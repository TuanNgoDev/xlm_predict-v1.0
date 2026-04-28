/**
 * Oracle — fetches XLM/USDT price from Binance public API (no key needed).
 * Converts to micro-USD for smart contract (e.g. $0.135000 → 135_000).
 */

const BINANCE_URL = 'https://api.binance.com/api/v3/ticker/price?symbol=XLMUSDT';

export async function fetchXlmPrice(): Promise<number> {
  const res = await fetch(BINANCE_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Binance API error: ${res.status}`);
  const data = await res.json();
  return parseFloat(data.price);
}

// $0.135000 → 135_000 (6 decimal places)
export function usdToMicroUsd(price: number): number {
  return Math.round(price * 1_000_000);
}

// 135_000 → $0.135000
export function microUsdToUsd(microUsd: bigint | number): number {
  return Number(microUsd) / 1_000_000;
}

// Format for display: $0.1350
export function formatPrice(usd: number): string {
  return `$${usd.toFixed(4)}`;
}
