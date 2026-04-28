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
});

async function seedUserStats(address: string, wins: number, bets: number, rewards: string, staked: string) {
  const pool = getPool();
  const winRate = bets > 0 ? ((wins / bets) * 100).toFixed(2) : '0';
  await pool.query(
    `INSERT INTO user_stats (wallet_address, total_wins, total_bets, total_rewards_stroops, total_staked_stroops, win_rate)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (wallet_address) DO UPDATE SET
       total_wins = $2, total_bets = $3,
       total_rewards_stroops = $4, total_staked_stroops = $5, win_rate = $6`,
    [address, wins, bets, rewards, staked, winRate]
  );
}

describe('GET /api/leaderboard', () => {
  it('returns users sorted by total rewards descending', async () => {
    await seedUserStats(validAddress(1), 5, 10, '500000000', '200000000');
    await seedUserStats(validAddress(2), 2, 5, '1000000000', '300000000');
    await seedUserStats(validAddress(3), 1, 3, '100000000', '50000000');

    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    // Should be sorted descending by totalRewardsXlm
    expect(res.body.data[0].totalRewardsXlm).toBeGreaterThanOrEqual(res.body.data[1].totalRewardsXlm);
    expect(res.body.data[1].totalRewardsXlm).toBeGreaterThanOrEqual(res.body.data[2].totalRewardsXlm);
  });

  it('assigns correct rank numbers', async () => {
    await seedUserStats(validAddress(1), 1, 1, '100000000', '50000000');
    await seedUserStats(validAddress(2), 2, 2, '200000000', '100000000');

    const res = await request(app).get('/api/leaderboard');
    expect(res.body.data[0].rank).toBe(1);
    expect(res.body.data[1].rank).toBe(2);
  });

  it('supports pagination', async () => {
    for (let i = 1; i <= 5; i++) {
      await seedUserStats(validAddress(i), i, i * 2, String(i * 100_000_000), String(i * 50_000_000));
    }
    const res = await request(app).get('/api/leaderboard?page=1&limit=2');
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.total).toBe(5);
    expect(res.body.pagination.totalPages).toBe(3);
  });
});

describe('GET /api/leaderboard/round/:roundId', () => {
  it('returns bets sorted by rank for settled round', async () => {
    const pool = getPool();
    // Insert round
    await pool.query(
      `INSERT INTO rounds (contract_round_id, creator_address, start_time, lock_time, end_time,
        min_stake_stroops, status, settle_price_micro_usd)
       VALUES (1, $1, NOW(), NOW(), NOW(), '10000000', 'Settled', '135000')`,
      [validAddress(1)]
    );
    // Insert ranked bets
    await pool.query(
      `INSERT INTO bets (round_id, bettor_address, predicted_price_micro_usd, stake_amount_stroops, rank, reward_stroops)
       VALUES (1, $1, '135100', '100000000', 1, '570000000'),
              (1, $2, '134500', '100000000', 2, '237500000'),
              (1, $3, '136000', '100000000', 3, '142500000')`,
      [validAddress(2), validAddress(3), validAddress(4)]
    );

    const res = await request(app).get('/api/leaderboard/round/1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].rank).toBe(1);
    expect(res.body[1].rank).toBe(2);
    expect(res.body[2].rank).toBe(3);
    // Error amounts should be ascending
    expect(res.body[0].errorAmount).toBeLessThanOrEqual(res.body[1].errorAmount);
  });
});

describe('GET /api/users/:address/stats', () => {
  it('returns correct stats for a user', async () => {
    await seedUserStats(validAddress(1), 3, 10, '300000000', '500000000');

    const res = await request(app).get(`/api/users/${validAddress(1)}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.totalBets).toBe(10);
    expect(res.body.totalWins).toBe(3);
    expect(res.body.totalLosses).toBe(7);
    expect(res.body.winRate).toBeCloseTo(30, 1);
    expect(res.body.totalRewardsXlm).toBeCloseTo(30, 5);
    expect(res.body.totalStakedXlm).toBeCloseTo(50, 5);
    expect(res.body.netPnlXlm).toBeCloseTo(-20, 5);
  });

  it('returns zeros for unknown address', async () => {
    const res = await request(app).get(`/api/users/${validAddress(99)}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.totalBets).toBe(0);
  });

  it('returns 400 for invalid address', async () => {
    const res = await request(app).get('/api/users/invalid/stats');
    expect(res.status).toBe(400);
  });
});
