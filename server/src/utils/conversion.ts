const STROOPS_PER_XLM = 10_000_000n;
const MICRO_USD_PER_USD = 1_000_000n;

// ── XLM ↔ Stroops ────────────────────────────────────────────────────────────

/**
 * Convert XLM (float) to stroops (bigint).
 * e.g. 1.5 XLM → 15_000_000n stroops
 */
export function xlmToStroops(xlm: number): bigint {
  return BigInt(Math.round(xlm * Number(STROOPS_PER_XLM)));
}

/**
 * Convert stroops (bigint) to XLM (float).
 * e.g. 15_000_000n → 1.5
 */
export function stroopsToXlm(stroops: bigint): number {
  return Number(stroops) / Number(STROOPS_PER_XLM);
}

// ── USD ↔ MicroUSD ────────────────────────────────────────────────────────────

/**
 * Convert USD (float) to micro-USD (bigint, 6 decimal places).
 * e.g. 0.135000 → 135_000n
 */
export function usdToMicroUsd(usd: number): bigint {
  return BigInt(Math.round(usd * Number(MICRO_USD_PER_USD)));
}

/**
 * Convert micro-USD (bigint) to USD (float).
 * e.g. 135_000n → 0.135000
 */
export function microUsdToUsd(microUsd: bigint | number): number {
  return Number(microUsd) / Number(MICRO_USD_PER_USD);
}

// ── Formatting ────────────────────────────────────────────────────────────────

/**
 * Format stroops as XLM string with 7 decimal places.
 * e.g. 15_000_000n → "1.5000000"
 */
export function formatXlm(stroops: bigint): string {
  return stroopsToXlm(stroops).toFixed(7);
}

/**
 * Format micro-USD as USD string with 6 decimal places.
 * e.g. 135_000n → "0.135000"
 */
export function formatUsd(microUsd: bigint): string {
  return microUsdToUsd(microUsd).toFixed(6);
}

// ── DB BigInt helpers ─────────────────────────────────────────────────────────

/**
 * pg returns BIGINT columns as strings — parse safely.
 */
export function parseBigInt(value: string | bigint | number | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  return BigInt(value);
}
