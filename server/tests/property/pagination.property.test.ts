import { describe, it } from 'vitest';
import fc from 'fast-check';
import { paginate } from '../../src/utils/ranking.js';

// Feature: xlm-predict-backend, Property 8: Pagination Correctness
describe('P8: pagination correctness', () => {
  it('data length never exceeds limit', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 200 }),
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 50 }),
        (items, page, limit) => {
          const result = paginate(items, page, limit);
          return result.data.length <= limit;
        }
      ),
      { numRuns: 1000 }
    );
  });

  it('pagination.total always equals items.length', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 200 }),
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 50 }),
        (items, page, limit) => {
          const result = paginate(items, page, limit);
          return result.pagination.total === items.length;
        }
      ),
      { numRuns: 1000 }
    );
  });

  it('data is the correct slice for given page and limit', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 200 }),
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 50 }),
        (items, page, limit) => {
          const result = paginate(items, page, limit);
          const start = (page - 1) * limit;
          const expected = items.slice(start, start + limit);
          return JSON.stringify(result.data) === JSON.stringify(expected);
        }
      ),
      { numRuns: 1000 }
    );
  });

  it('no item appears on two different pages', () => {
    fc.assert(
      fc.property(
        fc.array(fc.uniqueArray(fc.integer(), { minLength: 0, maxLength: 100 }), { minLength: 1, maxLength: 1 }),
        fc.integer({ min: 1, max: 20 }),
        ([items], limit) => {
          const totalPages = Math.ceil(items.length / limit);
          const allItems: number[] = [];
          for (let p = 1; p <= totalPages; p++) {
            const result = paginate(items, p, limit);
            allItems.push(...result.data);
          }
          return allItems.length === items.length &&
            new Set(allItems).size === allItems.length;
        }
      ),
      { numRuns: 500 }
    );
  });
});
