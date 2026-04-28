import { describe, it } from 'vitest';
import fc from 'fast-check';
import { stellarAddressSchema, roundIdSchema } from '../../src/middleware/validation.js';

// Feature: xlm-predict-backend, Property 6: Input Validation Rejects All Invalid Inputs
describe('P6: input validation rejects invalid inputs', () => {
  it('rejects any string that is not exactly 56 chars starting with G', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => s.length !== 56 || !s.startsWith('G')),
        (invalidAddress) => {
          return stellarAddressSchema.safeParse(invalidAddress).success === false;
        }
      ),
      { numRuns: 1000 }
    );
  });

  it('rejects zero and negative integers for roundId', () => {
    fc.assert(
      fc.property(
        fc.integer({ max: 0 }),
        (nonPositive) => {
          return roundIdSchema.safeParse(nonPositive).success === false;
        }
      ),
      { numRuns: 1000 }
    );
  });

  it('rejects non-integer floats for roundId', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.001), max: Math.fround(1000), noNaN: true, noDefaultInfinity: true })
          .filter((n) => !Number.isInteger(n)),
        (float) => {
          return roundIdSchema.safeParse(float).success === false;
        }
      ),
      { numRuns: 1000 }
    );
  });
});
