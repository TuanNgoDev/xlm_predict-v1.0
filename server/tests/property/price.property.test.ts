import { describe, it } from 'vitest';
import fc from 'fast-check';
import { computePriceStats } from '../../src/services/oracleService.js';

// Feature: xlm-predict-backend, Property 13: Price Stats Correctness
describe('P13: price stats correctness', () => {
  it('high24h equals max of prices', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.float({ min: Math.fround(0.0001), max: Math.fround(10), noNaN: true, noDefaultInfinity: true }),
          { minLength: 1, maxLength: 1000 }
        ),
        (prices) => {
          const stats = computePriceStats(prices);
          return Math.abs(stats.high24h - Math.max(...prices)) < 1e-6;
        }
      ),
      { numRuns: 1000 }
    );
  });

  it('low24h equals min of prices', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.float({ min: Math.fround(0.0001), max: Math.fround(10), noNaN: true, noDefaultInfinity: true }),
          { minLength: 1, maxLength: 1000 }
        ),
        (prices) => {
          const stats = computePriceStats(prices);
          return Math.abs(stats.low24h - Math.min(...prices)) < 1e-6;
        }
      ),
      { numRuns: 1000 }
    );
  });

  it('avgPrice24h equals mean of prices', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.float({ min: Math.fround(0.0001), max: Math.fround(10), noNaN: true, noDefaultInfinity: true }),
          { minLength: 1, maxLength: 1000 }
        ),
        (prices) => {
          const stats = computePriceStats(prices);
          const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
          return Math.abs(stats.avgPrice24h - mean) < 0.000001;
        }
      ),
      { numRuns: 1000 }
    );
  });

  it('change24h equals last minus first price', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.float({ min: Math.fround(0.0001), max: Math.fround(10), noNaN: true, noDefaultInfinity: true }),
          { minLength: 2, maxLength: 100 }
        ),
        (prices) => {
          const stats = computePriceStats(prices);
          const expected = prices[prices.length - 1] - prices[0];
          return Math.abs(stats.change24h - expected) < 1e-6;
        }
      ),
      { numRuns: 1000 }
    );
  });
});
