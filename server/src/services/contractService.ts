import {
  Contract,
  Keypair,
  TransactionBuilder,
  BASE_FEE,
  Address,
  nativeToScVal,
  scValToNative,
  rpc as SorobanRpc,
} from '@stellar/stellar-sdk';
import { getConfig } from '../config.js';
import { createError } from '../middleware/errorHandler.js';

// Contract error codes → HTTP status mapping
const CONTRACT_ERRORS: Record<number, { status: number; message: string }> = {
  1:  { status: 409, message: 'Contract already initialized' },
  2:  { status: 404, message: 'Round not found on contract' },
  3:  { status: 409, message: 'Round is locked, no new bets' },
  4:  { status: 409, message: 'Round is not open' },
  5:  { status: 400, message: 'Stake amount too low' },
  6:  { status: 400, message: 'Invalid prediction price' },
  7:  { status: 409, message: 'Round is full' },
  8:  { status: 409, message: 'Address already placed a bet' },
  9:  { status: 409, message: 'Round has not ended yet' },
  10: { status: 409, message: 'Round already settled or cancelled' },
  11: { status: 409, message: 'Round not settled yet' },
  12: { status: 404, message: 'No reward to claim' },
  13: { status: 404, message: 'Bet not found' },
  14: { status: 400, message: 'Invalid end time (must be >= 10 minutes)' },
  15: { status: 409, message: 'Not enough participants to settle' },
  16: { status: 409, message: 'Enough participants — use settle instead of cancel' },
};

export interface ContractRound {
  id: number;
  creator: string;
  start_time: bigint;
  lock_time: bigint;
  end_time: bigint;
  min_stake: bigint;
  total_pool: bigint;
  status: 'Open' | 'Settled' | 'Cancelled';
  settle_price: bigint;
}

export interface ContractBet {
  bettor: string;
  predicted_price: bigint;
  stake_amount: bigint;
}

let _rpc: SorobanRpc.Server | null = null;
let _adminKeypair: Keypair | null = null;

function getRpc(): SorobanRpc.Server {
  if (!_rpc) {
    const config = getConfig();
    _rpc = new SorobanRpc.Server(config.RPC_URL, { allowHttp: false });
  }
  return _rpc;
}

function getAdminKeypair(): Keypair {
  if (!_adminKeypair) {
    const config = getConfig();
    _adminKeypair = Keypair.fromSecret(config.ADMIN_SECRET_KEY);
  }
  return _adminKeypair;
}

function mapContractError(err: unknown): never {
  const msg = String(err);
  // Try to extract error code from Soroban error message
  const match = msg.match(/Error\(Contract, #(\d+)\)/);
  if (match) {
    const code = parseInt(match[1], 10);
    const mapped = CONTRACT_ERRORS[code];
    if (mapped) {
      throw createError(mapped.message, mapped.status, `CONTRACT_ERROR_${code}`);
    }
  }
  throw createError(`Contract error: ${msg}`, 502, 'CONTRACT_ERROR');
}

async function simulate(method: string, args: ReturnType<typeof nativeToScVal>[]) {
  const config = getConfig();
  const rpc = getRpc();
  const contract = new Contract(config.CONTRACT_ID);

  const DUMMY = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
  const account = await rpc.getAccount(DUMMY).catch(() => ({
    accountId: () => DUMMY,
    sequenceNumber: () => '0',
    incrementSequenceNumber: () => {},
  } as unknown as ConstructorParameters<typeof TransactionBuilder>[0]));

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    mapContractError(sim.error);
  }
  return scValToNative(
    (sim as SorobanRpc.Api.SimulateTransactionSuccessResponse).result!.retval
  );
}

async function submitAdminTx(method: string, args: ReturnType<typeof nativeToScVal>[]): Promise<string> {
  const config = getConfig();
  const rpc = getRpc();
  const adminKeypair = getAdminKeypair();
  const contract = new Contract(config.CONTRACT_ID);

  const account = await rpc.getAccount(adminKeypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: String(Number(BASE_FEE) * 100),
    networkPassphrase: config.NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    mapContractError(sim.error);
  }

  const prepared = SorobanRpc.assembleTransaction(tx, sim).build();
  prepared.sign(adminKeypair);

  const resp = await rpc.sendTransaction(prepared);
  if (resp.status === 'ERROR') {
    mapContractError(JSON.stringify(resp.errorResult));
  }

  // Poll for confirmation
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await rpc.getTransaction(resp.hash);
    if (s.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) return resp.hash;
    if (s.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      mapContractError(`Transaction failed: ${resp.hash}`);
    }
  }
  throw createError('Transaction confirmation timeout', 504, 'TX_TIMEOUT');
}

// ── Admin operations ──────────────────────────────────────────────────────────

export async function settleRound(roundId: number, actualPriceMicroUsd: bigint): Promise<string> {
  return submitAdminTx('settle_round', [
    nativeToScVal(roundId, { type: 'u32' }),
    nativeToScVal(actualPriceMicroUsd, { type: 'i128' }),
  ]);
}

export async function cancelRound(roundId: number): Promise<string> {
  return submitAdminTx('cancel_round', [
    nativeToScVal(roundId, { type: 'u32' }),
  ]);
}

// ── Read-only operations ──────────────────────────────────────────────────────

export async function getRound(roundId: number): Promise<ContractRound> {
  return simulate('get_round', [nativeToScVal(roundId, { type: 'u32' })]);
}

export async function getBet(roundId: number, bettor: string): Promise<ContractBet> {
  return simulate('get_bet', [
    nativeToScVal(roundId, { type: 'u32' }),
    new Address(bettor).toScVal(),
  ]);
}

export async function getReward(roundId: number, bettor: string): Promise<bigint> {
  return simulate('get_reward', [
    nativeToScVal(roundId, { type: 'u32' }),
    new Address(bettor).toScVal(),
  ]);
}

export async function getBettorList(roundId: number): Promise<string[]> {
  return simulate('get_bettor_list', [nativeToScVal(roundId, { type: 'u32' })]);
}

export async function getParticipantCount(roundId: number): Promise<number> {
  return simulate('get_participant_count', [nativeToScVal(roundId, { type: 'u32' })]);
}

export async function getCurrentRound(): Promise<number> {
  return simulate('get_current_round', []);
}
