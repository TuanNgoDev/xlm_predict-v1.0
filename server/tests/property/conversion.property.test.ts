import { describe, it } from 'vitest';
import fc from 'fast-check';
import {
  usdToMicroUsd,
  microUsdToUsd,
  xlmToStroops,
  stroopsToXlm,
} from '../../src/utils/conversion.js';

// Feature: xlm-predict-backend, Property 1: Price Conversion Round-Trip
describe('P1: price conversion round-trip', () => {
  it('microUsdToUsd(usdToMicroUsd(price)) ≈ price within 0.000001', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.000001), max: Math.fround(10), noNaN: true, noDefaultInfinity: true }),
        (price) => {
          const microUsd = usdToMicroUsd(price);
          const back = microUsdToUsd(microUsd);
          return Math.abs(back - price) < 0.000001;
        }
      ),
      { numRuns: 1000 }
    );
  });
});

// Feature: xlm-predict-backend, Property 2: Stroops Conversion Round-Trip
describe('P2: stroops conversion round-trip', () => {
  it('stroopsToXlm(xlmToStroops(amount)) ≈ amount within 1e-7', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.0000001), max: Math.fround(1_000_000), noNaN: true, noDefaultInfinity: true }),
        (amount) => {
          const stroops = xlmToStroops(amount);
          const back = stroopsToXlm(stroops);
          return Math.abs(back - amount) < 1e-7;
        }
      ),
      { numRuns: 1000 }
    );
  });
});
