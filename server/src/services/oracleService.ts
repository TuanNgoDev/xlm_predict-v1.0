import { query, queryOne } from '../db/client.js';
import { usdToMicroUsd, microUsdToUsd } from '../utils/conversion.js';

const BINANCE_URL = 'https://api.binance.com/api/v3/ticker/price?symbol=XLMUSDT';
const FETCH_TIMEOUT_MS = 5_000;

export interface PriceRecord {
  id?: number;
  priceUsd: number;
  priceMicroUsd: bigint;
  source: string;
  recordedAt: Date;
  stale?: boolean;
}

export interface PriceStats {
  high24h: number;
  low24h: number;
  change24h: number;
  changePercent24h: number;
  avgPrice24h: number;
}

interface DbPriceFeed {
  id: number;
  price_usd: string;
  price_micro_usd: string;
  source: string;
  recorded_at: Date;
}

function dbRowToRecord(row: DbPriceFeed, stale = false): PriceRecord & { stale: boolean } {
  return {
    id: row.id,
    priceUsd: parseFloat(row.price_usd),
    priceMicroUsd: BigInt(row.price_micro_usd),
    source: row.source,
    recordedAt: row.recorded_at,
    stale,
  };
}

/**
 * Fetch XLM/USDT price from Binance and store in price_feed table.
 */
export async function fetchAndStore(): Promise<PriceRecord> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(BINANCE_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`Binance API error: ${res.status}`);
    const data = (await res.json()) as { price: string };
    const priceUsd = parseFloat(data.price);
    const priceMicroUsd = usdToMicroUsd(priceUsd);

    const rows = await query<DbPriceFeed>(
      `INSERT INTO price_feed (price_usd, price_micro_usd, source)
       VALUES ($1, $2, 'binance')
       RETURNING *`,
      [priceUsd, priceMicroUsd.toString()]
    );

    return dbRowToRecord(rows[0], false);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Get the most recent price record from DB.
 */
export async function getLatestFromDb(): Promise<PriceRecord & { stale: boolean }> {
  const row = await queryOne<DbPriceFeed>(
    `SELECT * FROM price_feed ORDER BY recorded_at DESC LIMIT 1`
  );
  if (!row) throw new Error('No price data in database');
  return dbRowToRecord(row, true);
}

/**
 * Get current price — tries Binance first, falls back to DB with stale=true.
 */
export async function getCurrentPrice(): Promise<PriceRecord & { stale: boolean }> {
  try {
    const record = await fetchAndStore();
    return { ...record, stale: false };
  } catch {
    return getLatestFromDb();
  }
}

/**
 * Get price history with optional filters.
 */
export async function getHistory(opts: {
  limit: number;
  from?: string;
  to?: string;
}): Promise<PriceRecord[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (opts.from) {
    conditions.push(`recorded_at >= $${idx++}`);
    params.push(opts.from);
  }
  if (opts.to) {
    conditions.push(`recorded_at <= $${idx++}`);
    params.push(opts.to);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(opts.limit);

  const rows = await query<DbPriceFeed>(
    `SELECT * FROM price_feed ${where} ORDER BY recorded_at DESC LIMIT $${idx}`,
    params
  );

  return rows.map((r) => dbRowToRecord(r, false));
}

/**
 * Compute 24h price statistics from DB records.
 */
export async function getStats24h(): Promise<PriceStats> {
  const rows = await query<DbPriceFeed>(
    `SELECT * FROM price_feed
     WHERE recorded_at >= NOW() - INTERVAL '24 hours'
     ORDER BY recorded_at ASC`
  );

  if (rows.length === 0) {
    return { high24h: 0, low24h: 0, change24h: 0, changePercent24h: 0, avgPrice24h: 0 };
  }

  const prices = rows.map((r) => parseFloat(r.price_usd));
  return computePriceStats(prices);
}

/**
 * Pure function — compute stats from an array of prices.
 * Exported for property-based testing.
 */
export function computePriceStats(prices: number[]): PriceStats {
  if (prices.length === 0) {
    return { high24h: 0, low24h: 0, change24h: 0, changePercent24h: 0, avgPrice24h: 0 };
  }

  const high24h = Math.max(...prices);
  const low24h = Math.min(...prices);
  const avgPrice24h = prices.reduce((a, b) => a + b, 0) / prices.length;
  const change24h = prices[prices.length - 1] - prices[0];
  const changePercent24h = prices[0] !== 0 ? (change24h / prices[0]) * 100 : 0;

  return { high24h, low24h, change24h, changePercent24h, avgPrice24h };
}
