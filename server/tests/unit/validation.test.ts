import { describe, it, expect } from 'vitest';
import {
  stellarAddressSchema,
  roundIdSchema,
  recordBetSchema,
  recordRoundSchema,
} from '../../src/middleware/validation.js';

const validAddress = 'G' + 'A'.repeat(55);

describe('stellarAddressSchema', () => {
  it('accepts valid 56-char address starting with G', () => {
    expect(stellarAddressSchema.safeParse(validAddress).success).toBe(true);
  });

  it('rejects address shorter than 56 chars', () => {
    expect(stellarAddressSchema.safeParse('G' + 'A'.repeat(54)).success).toBe(false);
  });

  it('rejects address longer than 56 chars', () => {
    expect(stellarAddressSchema.safeParse('G' + 'A'.repeat(56)).success).toBe(false);
  });

  it('rejects address not starting with G', () => {
    expect(stellarAddressSchema.safeParse('A' + 'A'.repeat(55)).success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(stellarAddressSchema.safeParse('').success).toBe(false);
  });
});

describe('roundIdSchema', () => {
  it('accepts positive integer', () => {
    expect(roundIdSchema.safeParse(1).success).toBe(true);
    expect(roundIdSchema.safeParse(42).success).toBe(true);
  });

  it('rejects zero', () => {
    expect(roundIdSchema.safeParse(0).success).toBe(false);
  });

  it('rejects negative number', () => {
    expect(roundIdSchema.safeParse(-1).success).toBe(false);
  });

  it('rejects float', () => {
    expect(roundIdSchema.safeParse(1.5).success).toBe(false);
  });

  it('coerces numeric string', () => {
    expect(roundIdSchema.safeParse('5').success).toBe(true);
  });

  it('rejects non-numeric string', () => {
    expect(roundIdSchema.safeParse('abc').success).toBe(false);
  });
});

describe('recordBetSchema', () => {
  const validBet = {
    roundId: 1,
    bettorAddress: validAddress,
    predictedPriceMicroUsd: '135000',
    stakeAmountStroops: '100000000',
    txHash: 'a'.repeat(64),
  };

  it('accepts valid bet payload', () => {
    expect(recordBetSchema.safeParse(validBet).success).toBe(true);
  });

  it('accepts bet without txHash (optional)', () => {
    const { txHash: _, ...withoutHash } = validBet;
    expect(recordBetSchema.safeParse(withoutHash).success).toBe(true);
  });

  it('rejects invalid bettorAddress', () => {
    expect(recordBetSchema.safeParse({ ...validBet, bettorAddress: 'invalid' }).success).toBe(false);
  });

  it('rejects zero predictedPriceMicroUsd', () => {
    expect(recordBetSchema.safeParse({ ...validBet, predictedPriceMicroUsd: '0' }).success).toBe(false);
  });

  it('rejects zero stakeAmountStroops', () => {
    expect(recordBetSchema.safeParse({ ...validBet, stakeAmountStroops: '0' }).success).toBe(false);
  });

  it('rejects missing roundId', () => {
    const { roundId: _, ...withoutId } = validBet;
    expect(recordBetSchema.safeParse(withoutId).success).toBe(false);
  });
});

describe('recordRoundSchema', () => {
  const validRound = {
    contractRoundId: 1,
    creatorAddress: validAddress,
    startTime: '2024-01-01T00:00:00Z',
    lockTime: '2024-01-01T01:00:00Z',
    endTime: '2024-01-01T02:00:00Z',
    minStakeStroops: '10000000',
  };

  it('accepts valid round payload', () => {
    expect(recordRoundSchema.safeParse(validRound).success).toBe(true);
  });

  it('rejects invalid datetime', () => {
    expect(recordRoundSchema.safeParse({ ...validRound, startTime: 'not-a-date' }).success).toBe(false);
  });

  it('rejects invalid creatorAddress', () => {
    expect(recordRoundSchema.safeParse({ ...validRound, creatorAddress: 'bad' }).success).toBe(false);
  });
});
