import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import fc from 'fast-check';
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
  // Seed a round for bets to reference
  await request(app).post('/api/rounds/record').send({
    contractRoundId: 1,
    creatorAddress: validAddress(1),
    startTime: '2024-01-01T00:00:00Z',
    lockTime: '2024-01-01T01:00:00Z',
    endTime: '2024-01-01T02:00:00Z',
    minStakeStroops: '10000000',
  });
});

const sampleBet = {
  roundId: 1,
  bettorAddress: validAddress(2),
  predictedPriceMicroUsd: '135000',
  stakeAmountStroops: '100000000',
  txHash: 'a'.repeat(64),
};

describe('POST /api/bets/record', () => {
  it('stores bet and returns 201', async () => {
    const res = await request(app).post('/api/bets/record').send(sampleBet);
    expect(res.status).toBe(201);
    expect(res.body.bettorAddress).toBe(sampleBet.bettorAddress);
    expect(res.body.predictedPriceUsd).toBeCloseTo(0.135, 6);
    expect(res.body.stakeAmountXlm).toBeCloseTo(10, 5);
  });

  it('returns 409 on duplicate (roundId, bettorAddress)', async () => {
    await request(app).post('/api/bets/record').send(sampleBet);
    const res = await request(app).post('/api/bets/record').send(sampleBet);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });

  it('returns 400 for invalid bettorAddress', async () => {
    const res = await request(app)
      .post('/api/bets/record')
      .send({ ...sampleBet, bettorAddress: 'bad' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for zero predictedPriceMicroUsd', async () => {
    const res = await request(app)
      .post('/api/bets/record')
      .send({ ...sampleBet, predictedPriceMicroUsd: '0' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/bets/round/:roundId', () => {
  it('returns all bets for a round', async () => {
    await request(app).post('/api/bets/record').send(sampleBet);
    await request(app).post('/api/bets/record').send({
      ...sampleBet,
      bettorAddress: validAddress(3),
      txHash: 'b'.repeat(64),
    });

    const res = await request(app).get('/api/bets/round/1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('returns empty array for round with no bets', async () => {
    const res = await request(app).get('/api/bets/round/1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

describe('GET /api/bets/user/:address/positions', () => {
  it('returns positions with Pending outcome for open round', async () => {
    await request(app).post('/api/bets/record').send(sampleBet);
    const res = await request(app).get(`/api/bets/user/${sampleBet.bettorAddress}/positions`);
    expect(res.status).toBe(200);
    expect(res.body[0].outcome).toBe('Pending');
    expect(res.body[0].predictedPriceUsd).toBeCloseTo(0.135, 6);
  });
});

// Feature: xlm-predict-backend, Property 7: Data Persistence Round-Trip
describe('P7: data persistence round-trip', () => {
  it('stored bet fields match input values', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.bigInt({ min: 1n, max: 10_000_000n }),
        fc.bigInt({ min: 1_000_000n, max: 1_000_000_000n }),
        async (predictedMicroUsd, stakeStroops) => {
          await cleanTables();
          // Re-seed round
          await request(app).post('/api/rounds/record').send({
            contractRoundId: 1,
            creatorAddress: validAddress(1),
            startTime: '2024-01-01T00:00:00Z',
            lockTime: '2024-01-01T01:00:00Z',
            endTime: '2024-01-01T02:00:00Z',
            minStakeStroops: '10000000',
          });

          const bet = {
            roundId: 1,
            bettorAddress: validAddress(2),
            predictedPriceMicroUsd: predictedMicroUsd.toString(),
            stakeAmountStroops: stakeStroops.toString(),
          };

          await request(app).post('/api/bets/record').send(bet);
          const res = await request(app).get('/api/bets/round/1');
          const stored = res.body[0];

          const expectedPriceUsd = Number(predictedMicroUsd) / 1_000_000;
          const expectedStakeXlm = Number(stakeStroops) / 10_000_000;

          return (
            Math.abs(stored.predictedPriceUsd - expectedPriceUsd) < 0.000001 &&
            Math.abs(stored.stakeAmountXlm - expectedStakeXlm) < 1e-7
          );
        }
      ),
      { numRuns: 20 } // fewer runs for integration (DB calls)
    );
  });
});
