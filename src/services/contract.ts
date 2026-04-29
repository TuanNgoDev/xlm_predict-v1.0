import {
  Contract,
  rpc as SorobanRpc,
  TransactionBuilder,
  Address,
  nativeToScVal,
  scValToNative,
  Networks,
} from '@stellar/stellar-sdk';

export const CONTRACT_ID = 'CBEFCWFEW7VLK2LAU7PLOKRB7QIGXMQS4YJDYNUZHEAIMH7SNJ3CZTGU';
export const RPC_URL = 'https://soroban-testnet.stellar.org';
export const NETWORK_PASSPHRASE = Networks.TESTNET;
export const STROOPS = 10_000_000;
const HIGH_FEE = '1000000'; // 0.1 XLM — covers Soroban resource fees

const rpc = new SorobanRpc.Server(RPC_URL, { allowHttp: false });
const DUMMY = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

async function simulate(method: string, args: ReturnType<typeof nativeToScVal>[]) {
  const contract = new Contract(CONTRACT_ID);
  const account = await rpc.getAccount(DUMMY).catch(() => ({
    accountId: () => DUMMY, sequenceNumber: () => '0', incrementSequenceNumber: () => {},
  } as any));
  const tx = new TransactionBuilder(account, { fee: HIGH_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await rpc.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  return scValToNative((sim as SorobanRpc.Api.SimulateTransactionSuccessResponse).result!.retval);
}

export interface RoundData {
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

export async function getRound(roundId: number): Promise<RoundData> {
  return simulate('get_round', [nativeToScVal(roundId, { type: 'u32' })]);
}
export async function getCurrentRound(): Promise<number> {
  return simulate('get_current_round', []);
}
export async function getParticipantCount(roundId: number): Promise<number> {
  return simulate('get_participant_count', [nativeToScVal(roundId, { type: 'u32' })]);
}
export async function getBet(roundId: number, bettor: string) {
  return simulate('get_bet', [nativeToScVal(roundId, { type: 'u32' }), new Address(bettor).toScVal()]);
}
export async function getReward(roundId: number, bettor: string): Promise<bigint> {
  return simulate('get_reward', [nativeToScVal(roundId, { type: 'u32' }), new Address(bettor).toScVal()]);
}

// ── Signed transactions (require wallet) ────────────────────────────────────

export async function createRound(
  creatorPublicKey: string,
  endTimeSecs: number,
  minStakeXlm: number,
  signTx: (xdr: string) => Promise<string>
): Promise<string> {
  const contract = new Contract(CONTRACT_ID);
  const account = await rpc.getAccount(creatorPublicKey);
  const tx = new TransactionBuilder(account, { fee: HIGH_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(contract.call(
      'create_round',
      new Address(creatorPublicKey).toScVal(),
      nativeToScVal(BigInt(endTimeSecs), { type: 'u64' }),
      nativeToScVal(BigInt(Math.floor(minStakeXlm * STROOPS)), { type: 'i128' }),
    ))
    .setTimeout(60)
    .build();
  const prepared = await rpc.prepareTransaction(tx);
  const signed = await signTx(prepared.toXDR());
  const resp = await rpc.sendTransaction(TransactionBuilder.fromXDR(signed, NETWORK_PASSPHRASE));
  if (resp.status === 'ERROR') throw new Error(JSON.stringify(resp.errorResult));
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const s = await rpc.getTransaction(resp.hash);
    if (s.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) return String(scValToNative((s as any).returnValue));
    if (s.status === SorobanRpc.Api.GetTransactionStatus.FAILED) throw new Error('Transaction failed');
  }
  throw new Error('Timeout');
}

export async function placeBet(
  bettorPublicKey: string,
  roundId: number,
  predictedPriceUsd: number,
  stakeXlm: number,
  signTx: (xdr: string) => Promise<string>
): Promise<string> {
  const contract = new Contract(CONTRACT_ID);
  const account = await rpc.getAccount(bettorPublicKey);
  const tx = new TransactionBuilder(account, { fee: HIGH_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(contract.call(
      'place_bet',
      nativeToScVal(roundId, { type: 'u32' }),
      new Address(bettorPublicKey).toScVal(),
      nativeToScVal(BigInt(Math.round(predictedPriceUsd * 1_000_000)), { type: 'i128' }),
      nativeToScVal(BigInt(Math.floor(stakeXlm * STROOPS)), { type: 'i128' }),
    ))
    .setTimeout(120)
    .build();
  const prepared = await rpc.prepareTransaction(tx);
  const signed = await signTx(prepared.toXDR());
  const resp = await rpc.sendTransaction(TransactionBuilder.fromXDR(signed, NETWORK_PASSPHRASE));
  if (resp.status === 'ERROR') throw new Error(JSON.stringify(resp.errorResult));
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const s = await rpc.getTransaction(resp.hash);
    if (s.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) return resp.hash;
    if (s.status === SorobanRpc.Api.GetTransactionStatus.FAILED) throw new Error(`Transaction failed: ${resp.hash}`);
  }
  throw new Error('Timeout waiting for confirmation');
}

export async function claimReward(
  claimerPublicKey: string,
  roundId: number,
  signTx: (xdr: string) => Promise<string>
): Promise<string> {
  const contract = new Contract(CONTRACT_ID);
  const account = await rpc.getAccount(claimerPublicKey);
  const tx = new TransactionBuilder(account, { fee: HIGH_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(contract.call(
      'claim_reward',
      nativeToScVal(roundId, { type: 'u32' }),
      new Address(claimerPublicKey).toScVal(),
    ))
    .setTimeout(60)
    .build();
  const prepared = await rpc.prepareTransaction(tx);
  const signed = await signTx(prepared.toXDR());
  const resp = await rpc.sendTransaction(TransactionBuilder.fromXDR(signed, NETWORK_PASSPHRASE));
  if (resp.status === 'ERROR') throw new Error(JSON.stringify(resp.errorResult));
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const s = await rpc.getTransaction(resp.hash);
    if (s.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) return resp.hash;
    if (s.status === SorobanRpc.Api.GetTransactionStatus.FAILED) throw new Error('Transaction failed');
  }
  throw new Error('Timeout');
}
