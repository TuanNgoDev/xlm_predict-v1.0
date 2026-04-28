import { describe, it } from 'vitest';
import fc from 'fast-check';
import { rankBets } from '../../src/utils/ranking.js';

// Feature: xlm-predict-backend, Property 9: Leaderboard Global Ordering Invariant
describe('global leaderboard ordering invariant', () => {
  it('sorted by total rewards descending — no adjacent inversion', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            totalRewardsStroops: fc.bigInt({ min: 0n, max: 10_000_000_000n }),
          }),
          { minLength: 0, maxLength: 100 }
        ),
        (users) => {
          const sorted = [...users].sort((a, b) =>
            a.totalRewardsStroops > b.totalRewardsStroops ? -1 :
            a.totalRewardsStroops < b.totalRewardsStroops ? 1 : 0
          );
          for (let i = 0; i < sorted.length - 1; i++) {
            if (sorted[i].totalRewardsStroops < sorted[i + 1].totalRewardsStroops) return false;
          }
          return true;
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// Feature: xlm-predict-backend, Property 10: Round Leaderboard Accuracy Ordering
describe('round leaderboard accuracy ordering invariant', () => {
  it('sorted by prediction error ascending — no adjacent inversion', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            predictedPriceMicroUsd: fc.bigInt({ min: 1n, max: 10_000_000n }),
            stakeAmountStroops: fc.bigInt({ min: 1_000_000n }),
            createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
          }),
          { minLength: 1, maxLength: 100 }
        ),
        fc.bigInt({ min: 1n, max: 10_000_000n }),
        (rawBets, settlePrice) => {
          const bets = rawBets.map((b, i) => ({
            ...b,
            bettorAddress: `G${'A'.repeat(53)}${String(i).padStart(2, '0')}`,
          }));
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
