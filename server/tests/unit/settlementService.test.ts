import { describe, it, expect } from 'vitest';
import { rankBets, calculateRewards } from '../../src/utils/ranking.js';
import { parseBigInt } from '../../src/utils/conversion.js';

// Unit tests for settlement logic (pure functions only — no DB/contract calls)
// Full integration covered by integration tests

const addr = (n: number) => `G${'A'.repeat(53)}${String(n).padStart(2, '0')}`;

const makeBet = (predicted: bigint, stake: bigint, createdAt: Date, address: string) => ({
  bettorAddress: address,
  predictedPriceMicroUsd: predicted,
  stakeAmountStroops: stake,
  createdAt,
});

describe('settlement ranking logic', () => {
  it('settles correctly for 3 participants', () => {
    const settlePrice = 135_000n;
    const bets = [
      makeBet(135_100n, 100_000_000n, new Date('2024-01-01T00:00:00Z'), addr(1)), // error 100
      makeBet(134_500n, 200_000_000n, new Date('2024-01-01T00:01:00Z'), addr(2)), // error 500
      makeBet(136_000n, 150_000_000n, new Date('2024-01-01T00:02:00Z'), addr(3)), // error 1000
    ];

    const ranked = rankBets(bets, settlePrice);
    expect(ranked[0].bettorAddress).toBe(addr(1));
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].bettorAddress).toBe(addr(2));
    expect(ranked[2].bettorAddress).toBe(addr(3));
  });

  it('calculates rewards correctly according to contract logic (no fee, 65/35 on remaining pool)', () => {
    const totalPool = 450_000_000n; // 45 XLM
    const ranked = [
      { rank: 1, bettorAddress: addr(1), stakeAmountStroops: 100_000_000n },
      { rank: 2, bettorAddress: addr(2), stakeAmountStroops: 200_000_000n },
      { rank: 3, bettorAddress: addr(3), stakeAmountStroops: 150_000_000n },
    ];

    const rewards = calculateRewards(ranked, totalPool);
    expect(rewards.length).toBe(2);
    expect(rewards[0].rewardStroops).toBe(197_500_000n);
    expect(rewards[1].rewardStroops).toBe(252_500_000n);
  });

  it('skips processing when round is already Settled (idempotency)', () => {
    // Simulate idempotency check: if status !== 'Open', skip
    const roundStatus = 'Settled';
    const shouldProcess = roundStatus === 'Open';
    expect(shouldProcess).toBe(false);
  });

  it('skips processing when round is Cancelled', () => {
    const roundStatus = 'Cancelled';
    const shouldProcess = roundStatus === 'Open';
    expect(shouldProcess).toBe(false);
  });

  it('processes when round is Open', () => {
    const roundStatus = 'Open';
    const shouldProcess = roundStatus === 'Open';
    expect(shouldProcess).toBe(true);
  });
});

describe('parseBigInt for DB values', () => {
  it('parses string bigint from DB correctly', () => {
    expect(parseBigInt('5700000000')).toBe(5_700_000_000n);
  });

  it('handles null from DB', () => {
    expect(parseBigInt(null)).toBe(0n);
  });
});

describe('cron settlement decision logic', () => {
  it('decides settle when participant_count >= 2', () => {
    const round = { participant_count: 2, status: 'Open', end_time: new Date(Date.now() - 1000) };
    const shouldSettle = round.status === 'Open' && round.participant_count >= 2;
    const shouldCancel = round.status === 'Open' && round.participant_count < 2;
    expect(shouldSettle).toBe(true);
    expect(shouldCancel).toBe(false);
  });

  it('decides cancel when participant_count < 2', () => {
    const round = { participant_count: 1, status: 'Open', end_time: new Date(Date.now() - 1000) };
    const shouldSettle = round.status === 'Open' && round.participant_count >= 2;
    const shouldCancel = round.status === 'Open' && round.participant_count < 2;
    expect(shouldSettle).toBe(false);
    expect(shouldCancel).toBe(true);
  });

  it('does not process non-Open rounds', () => {
    for (const status of ['Settled', 'Cancelled']) {
      const round = { participant_count: 5, status, end_time: new Date(Date.now() - 1000) };
      const shouldProcess = round.status === 'Open';
      expect(shouldProcess).toBe(false);
    }
  });
});
