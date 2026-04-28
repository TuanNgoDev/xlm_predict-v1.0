import { NETWORK_PASSPHRASE } from './contract';

export type WalletType = 'freighter' | 'rabet';

// ── Rabet window type ─────────────────────────────────────────────────────────
declare global {
  interface Window {
    rabet?: {
      connect(): Promise<{ publicKey: string }>;
      sign(xdr: string, network: string): Promise<{ xdr: string }>;
      disconnect(): void;
    };
  }
}

const RABET_NETWORK = NETWORK_PASSPHRASE.includes('Test') ? 'testnet' : 'mainnet';

// ── Freighter ─────────────────────────────────────────────────────────────────

export async function connectFreighter(): Promise<string> {
  const { requestAccess, getAddress } = await import('@stellar/freighter-api');
  await requestAccess();
  const addr = await getAddress();
  if (!addr.address) throw new Error('Could not get Freighter address');
  return addr.address;
}

export async function getFreighterAddress(): Promise<string | null> {
  try {
    const { isConnected, getAddress } = await import('@stellar/freighter-api');
    const conn = await isConnected();
    if (!conn.isConnected) return null;
    const addr = await getAddress();
    return addr.address || null;
  } catch {
    return null;
  }
}

export async function signWithFreighter(xdr: string, address?: string): Promise<string> {
  const { signTransaction } = await import('@stellar/freighter-api');
  
  console.log('🔐 Signing with Freighter:', {
    networkPassphrase: NETWORK_PASSPHRASE,
    address,
    xdrLength: xdr.length
  });
  
  const opts: Record<string, string> = { networkPassphrase: NETWORK_PASSPHRASE };
  if (address) opts.address = address;

  const res = await signTransaction(xdr, opts);
  if ('error' in res && res.error) throw new Error(String(res.error));
  if ('signedTxXdr' in res && res.signedTxXdr) return res.signedTxXdr;
  if (typeof res === 'string') return res;
  throw new Error('Freighter signing failed');
}

// ── Rabet ─────────────────────────────────────────────────────────────────────

export async function connectRabet(): Promise<string> {
  if (!window.rabet) throw new Error('Rabet extension not found. Please install Rabet.');
  const result = await window.rabet.connect();
  if (!result.publicKey) throw new Error('Could not get Rabet address');
  return result.publicKey;
}

export async function signWithRabet(xdr: string): Promise<string> {
  if (!window.rabet) throw new Error('Rabet not available');
  const result = await window.rabet.sign(xdr, RABET_NETWORK);
  if (!result.xdr) throw new Error('Rabet signing failed');
  return result.xdr;
}

// ── Generic helpers (used by contract.ts) ────────────────────────────────────

export async function getWalletAddress(): Promise<string | null> {
  const saved = localStorage.getItem('walletType') as WalletType | null;
  if (saved === 'rabet') {
    try { return await connectRabet(); } catch { return null; }
  }
  return getFreighterAddress();
}

export async function connectWallet(): Promise<string> {
  // Legacy — defaults to Freighter
  return connectFreighter();
}

export async function signTransaction(xdr: string, address?: string): Promise<string> {
  const walletType = localStorage.getItem('walletType') as WalletType | null;
  if (walletType === 'rabet') return signWithRabet(xdr);
  return signWithFreighter(xdr, address);
}
