import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { validateConfig } from '../../src/config.js';
import { createTestApp } from './helpers/app.js';
import { setupTestDb, cleanTables, teardownTestDb, validAddress } from './helpers/db.js';
import { getPool } from '../../src/db/client.js';

let app: ReturnType<typeof createTestApp>;

beforeAll(async () => {
  validateConfig();
  await setupTestDb();
  app = createTestApp();
});

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(async () => {
  await cleanTables();

  const pool = getPool();
  // Seed a settled round
  await pool.query(
    `INSERT INTO rounds (contract_round_id, creator_address, start_time, lock_time, end_time,
      min_stake_stroops, status, settle_price_micro_usd)
     VALUES (1, $1, NOW(), NOW(), NOW(), '10000000', 'Settled', '135000')`,
    [validAddress(1)]
  );
  // Seed a winning bet (rank 1, reward 570 XLM)
  await pool.query(
    `INSERT INTO bets (round_id, bettor_address, predicted_price_micro_usd, stake_amount_stroops,
      rank, reward_stroops, claimed)
     VALUES (1, $1, '135100', '1000000000', 1, '5700000000', false)`,
    [validAddress(2)]
  );
});

describe('GET /api/rewards/:address/round/:roundId', () => {
  it('returns reward info for a winner', async () => {
    const res = await request(app).get(`/api/rewards/${validAddress(2)}/round/1`);
    expect(res.status).toBe(200);
    expect(res.body.rank).toBe(1);
    expect(res.body.claimed).toBe(false);
    expect(res.body.rewardXlm).toBeCloseTo(570, 4);
    expect(res.body.rewardStroops).toBe('5700000000');
  });

  it('returns 404 for non-existent bet', async () => {
    const res = await request(app).get(`/api/rewards/${validAddress(99)}/round/1`);
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid address', async () => {
    const res = await request(app).get('/api/rewards/invalid/round/1');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/rewards/record-claim', () => {
  it('sets claimed=true and returns success', async () => {
    const res = await request(app).post('/api/rewards/record-claim').send({
      address: validAddress(2),
      roundId: 1,
      txHash: 'a'.repeat(64),
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify claimed=true in DB
    const check = await request(app).get(`/api/rewards/${validAddress(2)}/round/1`);
    expect(check.body.claimed).toBe(true);
  });

  it('is idempotent — second call still returns success', async () => {
    const payload = { address: validAddress(2), roundId: 1, txHash: 'a'.repeat(64) };
    await request(app).post('/api/rewards/record-claim').send(payload);
    const res2 = await request(app).post('/api/rewards/record-claim').send(payload);
    expect(res2.status).toBe(200);
    expect(res2.body.success).toBe(true);
  });

  it('does not create duplicate transaction records on repeated claims', async () => {
    const payload = { address: validAddress(2), roundId: 1, txHash: 'a'.repeat(64) };
    await request(app).post('/api/rewards/record-claim').send(payload);
    await request(app).post('/api/rewards/record-claim').send(payload);
    await request(app).post('/api/rewards/record-claim').send(payload);

    const pool = getPool();
    const rows = await pool.query(
      `SELECT COUNT(*) as count FROM transactions
       WHERE wallet_address = $1 AND round_id = 1 AND type = 'Claim'`,
      [validAddress(2)]
    );
    expect(parseInt(rows.rows[0].count, 10)).toBe(1);
  });

  it('returns 404 for non-existent bet', async () => {
    const res = await request(app).post('/api/rewards/record-claim').send({
      address: validAddress(99),
      roundId: 1,
      txHash: 'b'.repeat(64),
    });
    expect(res.status).toBe(404);
  });
});
