import { describe, it, expect } from 'vitest';
import { rankBets, calculateRewards, paginate } from '../../src/utils/ranking.js';

const addr = (n: number) => `G${'A'.repeat(54)}${n}`;

const makeBet = (predicted: bigint, createdAt: Date, addr_: string) => ({
  bettorAddress: addr_,
  predictedPriceMicroUsd: predicted,
  stakeAmountStroops: 100_000_000n,
  createdAt,
});

describe('rankBets', () => {
  it('ranks by absolute error ascending', () => {
    const settle = 135_000n;
    const bets = [
      makeBet(140_000n, new Date('2024-01-01T00:00:00Z'), addr(1)), // error 5000
      makeBet(135_500n, new Date('2024-01-01T00:01:00Z'), addr(2)), // error 500
      makeBet(134_000n, new Date('2024-01-01T00:02:00Z'), addr(3)), // error 1000
    ];
    const ranked = rankBets(bets, settle);
    expect(ranked[0].bettorAddress).toBe(addr(2)); // error 500 → rank 1
    expect(ranked[1].bettorAddress).toBe(addr(3)); // error 1000 → rank 2
    expect(ranked[2].bettorAddress).toBe(addr(1)); // error 5000 → rank 3
  });

  it('assigns 1-based rank numbers', () => {
    const bets = [
      makeBet(100n, new Date(), addr(1)),
      makeBet(200n, new Date(), addr(2)),
    ];
    const ranked = rankBets(bets, 150n);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
  });

  it('tie-breaks by earlier createdAt (earlier = better rank)', () => {
    const settle = 135_000n;
    const earlier = new Date('2024-01-01T00:00:00Z');
    const later = new Date('2024-01-01T00:05:00Z');
    const bets = [
      makeBet(135_000n, later, addr(1)),   // same error, placed later
      makeBet(135_000n, earlier, addr(2)), // same error, placed earlier
    ];
    const ranked = rankBets(bets, settle);
    expect(ranked[0].bettorAddress).toBe(addr(2)); // earlier → rank 1
    expect(ranked[1].bettorAddress).toBe(addr(1)); // later → rank 2
  });

  it('returns empty array for empty input', () => {
    expect(rankBets([], 135_000n)).toEqual([]);
  });

  it('includes error field in output', () => {
    const bets = [makeBet(136_000n, new Date(), addr(1))];
    const ranked = rankBets(bets, 135_000n);
    expect(ranked[0].error).toBe(1_000n);
  });
});

describe('calculateRewards', () => {
  const pool = 1_000_000_000n; // 100 XLM in stroops
  const fee = 500n; // 5%
  // prize pool = 1_000_000_000 * 9500 / 10000 = 950_000_000

  const makeRanked = (rank: number, addr_: string) => ({
    rank,
    bettorAddress: addr_,
    stakeAmountStroops: 100_000_000n,
  });

  it('distributes 65/35 of prize pool after stakes are deducted for 3 participants', () => {
    const ranked = [makeRanked(1, addr(1)), makeRanked(2, addr(2)), makeRanked(3, addr(3))];
    const rewards = calculateRewards(ranked, pool, fee);
    expect(rewards.length).toBe(2);
    expect(rewards[0].rewardStroops).toBe(100_000_000n + (800_000_000n * 65n) / 100n);
    expect(rewards[1].rewardStroops).toBe(100_000_000n + (800_000_000n * 35n) / 100n);
  });

  it('distributes 65/35 of prize pool after stakes are deducted for 2 participants', () => {
    const ranked = [makeRanked(1, addr(1)), makeRanked(2, addr(2))];
    const rewards = calculateRewards(ranked, pool, fee);
    expect(rewards.length).toBe(2);
    expect(rewards[0].rewardStroops).toBe(100_000_000n + (800_000_000n * 65n) / 100n);
    expect(rewards[1].rewardStroops).toBe(100_000_000n + (800_000_000n * 35n) / 100n);
  });

  it('returns empty for 0 participants', () => {
    expect(calculateRewards([], pool, fee)).toEqual([]);
  });

  it('total rewards do not exceed total pool', () => {
    const ranked = [makeRanked(1, addr(1)), makeRanked(2, addr(2)), makeRanked(3, addr(3))];
    const rewards = calculateRewards(ranked, pool, fee);
    const total = rewards.reduce((s, r) => s + r.rewardStroops, 0n);
    expect(total).toBe(pool);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it('returns correct slice for page 1', () => {
    const result = paginate(items, 1, 10);
    expect(result.data).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.pagination.total).toBe(25);
    expect(result.pagination.totalPages).toBe(3);
  });

  it('returns correct slice for page 3', () => {
    const result = paginate(items, 3, 10);
    expect(result.data).toEqual([21, 22, 23, 24, 25]);
  });

  it('returns empty data for out-of-range page', () => {
    const result = paginate(items, 10, 10);
    expect(result.data).toEqual([]);
  });

  it('handles empty array', () => {
    const result = paginate([], 1, 10);
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.totalPages).toBe(0);
  });
});
