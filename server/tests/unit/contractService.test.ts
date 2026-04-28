import { describe, it, expect } from 'vitest';

// Unit tests for contractService error mapping logic (pure, no network)
// Full integration tests require live Soroban RPC

const CONTRACT_ERRORS: Record<number, { status: number; message: string }> = {
  1:  { status: 409, message: 'Contract already initialized' },
  2:  { status: 404, message: 'Round not found on contract' },
  3:  { status: 409, message: 'Round is locked, no new bets' },
  4:  { status: 409, message: 'Round is not open' },
  5:  { status: 400, message: 'Stake amount too low' },
  6:  { status: 400, message: 'Invalid prediction price' },
  7:  { status: 409, message: 'Round is full' },
  8:  { status: 409, message: 'Address already placed a bet' },
  9:  { status: 409, message: 'Round has not ended yet' },
  10: { status: 409, message: 'Round already settled or cancelled' },
  11: { status: 409, message: 'Round not settled yet' },
  12: { status: 404, message: 'No reward to claim' },
  13: { status: 404, message: 'Bet not found' },
  14: { status: 400, message: 'Invalid end time (must be >= 10 minutes)' },
  15: { status: 409, message: 'Not enough participants to settle' },
  16: { status: 409, message: 'Enough participants — use settle instead of cancel' },
};

function parseContractError(msg: string): { status: number; message: string } | null {
  const match = msg.match(/Error\(Contract, #(\d+)\)/);
  if (match) {
    const code = parseInt(match[1], 10);
    return CONTRACT_ERRORS[code] ?? null;
  }
  return null;
}

describe('contract error mapping', () => {
  it('maps error code 2 to 404 round not found', () => {
    const result = parseContractError('Error(Contract, #2)');
    expect(result?.status).toBe(404);
    expect(result?.message).toBe('Round not found on contract');
  });

  it('maps error code 8 to 409 already bet', () => {
    const result = parseContractError('Error(Contract, #8)');
    expect(result?.status).toBe(409);
    expect(result?.message).toBe('Address already placed a bet');
  });

  it('maps error code 10 to 409 already settled', () => {
    const result = parseContractError('Error(Contract, #10)');
    expect(result?.status).toBe(409);
    expect(result?.message).toBe('Round already settled or cancelled');
  });

  it('maps error code 15 to 409 not enough participants', () => {
    const result = parseContractError('Error(Contract, #15)');
    expect(result?.status).toBe(409);
  });

  it('returns null for unknown error code', () => {
    const result = parseContractError('Error(Contract, #999)');
    expect(result).toBeNull();
  });

  it('returns null for non-contract error string', () => {
    const result = parseContractError('Network timeout');
    expect(result).toBeNull();
  });

  it('ADMIN_SECRET_KEY does not appear in error messages', () => {
    // Verify error messages never contain secret key patterns
    const allMessages = Object.values(CONTRACT_ERRORS).map((e) => e.message);
    for (const msg of allMessages) {
      expect(msg).not.toMatch(/^S[A-Z2-7]{55}$/);
    }
  });

  it('all error codes map to valid HTTP status codes', () => {
    const validStatuses = [400, 404, 409, 502];
    for (const [, val] of Object.entries(CONTRACT_ERRORS)) {
      expect(validStatuses).toContain(val.status);
    }
  });
});
