import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { validateConfig } from '../../src/config.js';
import { createTestApp } from './helpers/app.js';
import { setupTestDb, teardownTestDb } from './helpers/db.js';
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

describe('GET /api/health', () => {
  it('returns status ok with db connected', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
    expect(res.body.contractId).toBeDefined();
    expect(res.body.network).toBe('testnet');
    expect(typeof res.body.uptime).toBe('number');
  });
});

describe('Database schema', () => {
  it('has all required tables', async () => {
    const pool = getPool();
    const result = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const tables = result.rows.map((r: { table_name: string }) => r.table_name);
    expect(tables).toContain('rounds');
    expect(tables).toContain('bets');
    expect(tables).toContain('price_feed');
    expect(tables).toContain('transactions');
    expect(tables).toContain('user_stats');
  });

  it('has all required indexes', async () => {
    const pool = getPool();
    const result = await pool.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
    `);
    const indexes = result.rows.map((r: { indexname: string }) => r.indexname);
    expect(indexes).toContain('idx_bets_bettor_address');
    expect(indexes).toContain('idx_bets_round_id');
    expect(indexes).toContain('idx_rounds_status');
    expect(indexes).toContain('idx_rounds_end_time');
    expect(indexes).toContain('idx_price_feed_recorded_at');
  });
});

describe('API error handling', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid round id', async () => {
    const res = await request(app).get('/api/rounds/abc');
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid stellar address', async () => {
    const res = await request(app).get('/api/users/invalid/stats');
    expect(res.status).toBe(400);
  });
});
