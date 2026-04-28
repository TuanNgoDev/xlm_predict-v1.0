import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../../../src/db/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function setupTestDb() {
  const schema = readFileSync(
    join(__dirname, '../../../src/db/schema.sql'),
    'utf-8'
  );
  const pool = getPool();
  await pool.query(schema);
}

export async function cleanTables() {
  const pool = getPool();
  await pool.query(`
    TRUNCATE TABLE transactions, bets, rounds, price_feed, user_stats
    RESTART IDENTITY CASCADE
  `);
}

export async function teardownTestDb() {
  const pool = getPool();
  await pool.end();
}

export const validAddress = (n = 1) => {
  const suffix = String(n).padStart(2, '0');
  return `G${'A'.repeat(53)}${suffix}`;
};
