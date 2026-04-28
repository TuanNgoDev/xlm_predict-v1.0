import { describe, it } from 'vitest';
import fc from 'fast-check';
import { rankBets, calculateRewards } from '../../src/utils/ranking.js';

const addr = (n: number) => `G${'A'.repeat(54)}${String(n).padStart(1, '0')}`;

// Feature: xlm-predict-backend, Property 3: Reward Distribution Invariant
describe('P3: reward distribution invariant', () => {
  it('total rewards never exceed prize pool (after 5% fee)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            stakeAmountStroops: fc.bigInt({ min: 1_000_000n, max: 1_000_000_000n }),
          }),
          { minLength: 2, maxLength: 100 }
        ),
        (bets) => {
          const totalPool = bets.reduce((s, b) => s + b.stakeAmountStroops, 0n);
          const ranked = bets.map((b, i) => ({
            rank: i + 1,
            bettorAddress: addr(i),
            stakeAmountStroops: b.stakeAmountStroops,
          }));
          const rewards = calculateRewards(ranked, totalPool, 500n);
          const totalRewards = rewards.reduce((s, r) => s + r.rewardStroops, 0n);
          // Use same formula as calculateRewards: pool - floor(pool * fee / denom)
          const prizePool = totalPool - (totalPool * 500n) / 10_000n;
          return totalRewards <= prizePool;
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// Feature: xlm-predict-backend, Property 4: Ranking Ordering Invariant
describe('P4: ranking ordering invariant', () => {
  it('rankBets output is sorted by error ascending', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            predictedPriceMicroUsd: fc.bigInt({ min: 1n, max: 10_000_000n }),
            stakeAmountStroops: fc.bigInt({ min: 1_000_000n, max: 1_000_000_000n }),
            createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
          }),
          { minLength: 1, maxLength: 100 }
        ),
        fc.bigInt({ min: 1n, max: 10_000_000n }),
        (rawBets, settlePrice) => {
          const bets = rawBets.map((b, i) => ({ ...b, bettorAddress: addr(i) }));
          const ranked = rankBets(bets, settlePrice);
          for (let i = 0; i < ranked.length - 1; i++) {
            if (ranked[i].error > ranked[i + 1].error) return false;
          }
          return true;
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// Feature: xlm-predict-backend, Property 5: Ranking Tie-Breaking Consistency
describe('P5: ranking tie-breaking consistency', () => {
  it('earlier createdAt always gets better rank when errors are equal', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10_000_000n }),
        fc.date({ min: new Date('2020-01-01'), max: new Date('2025-01-01') }),
        fc.date({ min: new Date('2025-01-02'), max: new Date('2030-01-01') }),
        (predictedPrice, earlier, later) => {
          const bets = [
            { bettorAddress: addr(1), predictedPriceMicroUsd: predictedPrice, stakeAmountStroops: 100_000_000n, createdAt: later },
            { bettorAddress: addr(2), predictedPriceMicroUsd: predictedPrice, stakeAmountStroops: 100_000_000n, createdAt: earlier },
          ];
          const ranked = rankBets(bets, predictedPrice); // settle = predicted → error = 0 for both
          const earlyRank = ranked.find((r) => r.bettorAddress === addr(2))!.rank;
          const lateRank = ranked.find((r) => r.bettorAddress === addr(1))!.rank;
          return earlyRank < lateRank;
        }
      ),
      { numRuns: 1000 }
    );
  });
});
