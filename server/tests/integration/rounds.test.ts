import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { validateConfig } from '../../src/config.js';
import { createTestApp } from './helpers/app.js';
import { setupTestDb, cleanTables, teardownTestDb, validAddress } from './helpers/db.js';

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

const sampleRound = {
  contractRoundId: 1,
  creatorAddress: validAddress(1),
  startTime: '2024-01-01T00:00:00Z',
  lockTime: '2024-01-01T01:00:00Z',
  endTime: '2024-01-01T02:00:00Z',
  minStakeStroops: '10000000',
};

describe('POST /api/rounds/record', () => {
  it('stores round and returns 201', async () => {
    const res = await request(app).post('/api/rounds/record').send(sampleRound);
    expect(res.status).toBe(201);
    expect(res.body.contractRoundId).toBe(1);
    expect(res.body.creatorAddress).toBe(sampleRound.creatorAddress);
    expect(res.body.status).toBe('Open');
    expect(res.body.minStakeXlm).toBeCloseTo(1, 5);
  });

  it('returns 409 on duplicate contractRoundId', async () => {
    await request(app).post('/api/rounds/record').send(sampleRound);
    const res = await request(app).post('/api/rounds/record').send(sampleRound);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });

  it('returns 400 for invalid creatorAddress', async () => {
    const res = await request(app)
      .post('/api/rounds/record')
      .send({ ...sampleRound, creatorAddress: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app).post('/api/rounds/record').send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/rounds/current', () => {
  it('returns 404 when no active round', async () => {
    const res = await request(app).get('/api/rounds/current');
    expect(res.status).toBe(404);
  });

  it('returns the most recent Open round', async () => {
    await request(app).post('/api/rounds/record').send(sampleRound);
    await request(app).post('/api/rounds/record').send({ ...sampleRound, contractRoundId: 2 });

    const res = await request(app).get('/api/rounds/current');
    expect(res.status).toBe(200);
    expect(res.body.contractRoundId).toBe(2);
    expect(res.body.status).toBe('Open');
  });
});

describe('GET /api/rounds/:id', () => {
  it('returns round by contractRoundId', async () => {
    await request(app).post('/api/rounds/record').send(sampleRound);
    const res = await request(app).get('/api/rounds/1');
    expect(res.status).toBe(200);
    expect(res.body.contractRoundId).toBe(1);
  });

  it('returns 404 for non-existent round', async () => {
    const res = await request(app).get('/api/rounds/999');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid id', async () => {
    const res = await request(app).get('/api/rounds/abc');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/rounds', () => {
  it('returns paginated list', async () => {
    await request(app).post('/api/rounds/record').send(sampleRound);
    await request(app).post('/api/rounds/record').send({ ...sampleRound, contractRoundId: 2 });

    const res = await request(app).get('/api/rounds?page=1&limit=1');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.pagination.totalPages).toBe(2);
  });

  it('filters by status', async () => {
    await request(app).post('/api/rounds/record').send(sampleRound);
    const res = await request(app).get('/api/rounds?status=Open');
    expect(res.status).toBe(200);
    expect(res.body.data.every((r: { status: string }) => r.status === 'Open')).toBe(true);
  });
});
