import { describe, it, expect } from 'vitest';
import {
  xlmToStroops,
  stroopsToXlm,
  usdToMicroUsd,
  microUsdToUsd,
  formatXlm,
  formatUsd,
  parseBigInt,
} from '../../src/utils/conversion.js';

describe('xlmToStroops', () => {
  it('converts 1 XLM to 10_000_000 stroops', () => {
    expect(xlmToStroops(1)).toBe(10_000_000n);
  });

  it('converts 0.5 XLM to 5_000_000 stroops', () => {
    expect(xlmToStroops(0.5)).toBe(5_000_000n);
  });

  it('converts 100 XLM to 1_000_000_000 stroops', () => {
    expect(xlmToStroops(100)).toBe(1_000_000_000n);
  });

  it('converts 0 XLM to 0 stroops', () => {
    expect(xlmToStroops(0)).toBe(0n);
  });
});

describe('stroopsToXlm', () => {
  it('converts 10_000_000 stroops to 1 XLM', () => {
    expect(stroopsToXlm(10_000_000n)).toBe(1);
  });

  it('converts 5_000_000 stroops to 0.5 XLM', () => {
    expect(stroopsToXlm(5_000_000n)).toBe(0.5);
  });

  it('converts 0 stroops to 0 XLM', () => {
    expect(stroopsToXlm(0n)).toBe(0);
  });
});

describe('usdToMicroUsd', () => {
  it('converts 0.135 USD to 135_000 microUSD', () => {
    expect(usdToMicroUsd(0.135)).toBe(135_000n);
  });

  it('converts 1 USD to 1_000_000 microUSD', () => {
    expect(usdToMicroUsd(1)).toBe(1_000_000n);
  });

  it('converts 0 USD to 0 microUSD', () => {
    expect(usdToMicroUsd(0)).toBe(0n);
  });
});

describe('microUsdToUsd', () => {
  it('converts 135_000 microUSD to 0.135 USD', () => {
    expect(microUsdToUsd(135_000n)).toBeCloseTo(0.135, 6);
  });

  it('converts 1_000_000 microUSD to 1 USD', () => {
    expect(microUsdToUsd(1_000_000n)).toBe(1);
  });

  it('accepts number input', () => {
    expect(microUsdToUsd(135_000)).toBeCloseTo(0.135, 6);
  });
});

describe('round-trip conversions', () => {
  it('xlm → stroops → xlm is lossless for 7 decimal places', () => {
    const values = [1, 0.5, 10.1234567, 100, 0.0000001];
    for (const v of values) {
      expect(stroopsToXlm(xlmToStroops(v))).toBeCloseTo(v, 7);
    }
  });

  it('usd → microUsd → usd is lossless for 6 decimal places', () => {
    const values = [0.135, 1.0, 0.000001, 9.999999];
    for (const v of values) {
      expect(microUsdToUsd(usdToMicroUsd(v))).toBeCloseTo(v, 6);
    }
  });
});

describe('formatXlm', () => {
  it('formats 10_000_000 stroops as "1.0000000"', () => {
    expect(formatXlm(10_000_000n)).toBe('1.0000000');
  });
});

describe('formatUsd', () => {
  it('formats 135_000 microUSD as "0.135000"', () => {
    expect(formatUsd(135_000n)).toBe('0.135000');
  });
});

describe('parseBigInt', () => {
  it('parses string to bigint', () => {
    expect(parseBigInt('12345')).toBe(12345n);
  });

  it('returns 0n for null', () => {
    expect(parseBigInt(null)).toBe(0n);
  });

  it('returns 0n for undefined', () => {
    expect(parseBigInt(undefined)).toBe(0n);
  });

  it('passes through bigint', () => {
    expect(parseBigInt(999n)).toBe(999n);
  });
});
