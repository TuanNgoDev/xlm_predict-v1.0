// Mirrors smart contract reward distribution logic exactly:
// Top 1: stake1 + 65% of (total_pool - stake1 - stake2)
// Top 2: stake2 + 35% of (total_pool - stake1 - stake2)
// Others: 0 (lose stake)
const FEE_BPS_DEFAULT = 0n; // No fee
const BPS_DENOM = 10_000n;

export interface BetForRanking {
  bettorAddress: string;
  predictedPriceMicroUsd: bigint;
  stakeAmountStroops: bigint;
  createdAt: Date;
}

export interface RankedBet extends BetForRanking {
  rank: number;   // 1-based
  error: bigint;  // |predicted - actual|
}

export interface RewardEntry {
  rank: number;
  bettorAddress: string;
  rewardStroops: bigint;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Rank bets by |predicted_price - actual_price| ascending.
 * Tie-break: earlier createdAt wins (lower rank number = better).
 */
export function rankBets(
  bets: BetForRanking[],
  actualPriceMicroUsd: bigint
): RankedBet[] {
  const withError = bets.map((b) => ({
    ...b,
    error: b.predictedPriceMicroUsd > actualPriceMicroUsd
      ? b.predictedPriceMicroUsd - actualPriceMicroUsd
      : actualPriceMicroUsd - b.predictedPriceMicroUsd,
  }));

  withError.sort((a, b) => {
    if (a.error < b.error) return -1;
    if (a.error > b.error) return 1;
    // Tie-break: earlier timestamp wins
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return withError.map((b, i) => ({ ...b, rank: i + 1 }));
}

/**
 * Calculate reward amounts mirroring the smart contract logic exactly.
 *
 * Contract logic (settle_round):
 *   prize_pool = total_pool - stake1 - stake2
 *   top1 reward = stake1 + (prize_pool * 65) / 100
 *   top2 reward = stake2 + (prize_pool * 35) / 100
 *   others      = 0 (lose stake)
 *
 * Requires at least 3 participants (enforced by contract MIN_PARTICIPANTS).
 */
export function calculateRewards(
  rankedBets: Array<{ rank: number; bettorAddress: string; stakeAmountStroops: bigint }>,
  totalPoolStroops: bigint,
  _feeBps: bigint = FEE_BPS_DEFAULT
): RewardEntry[] {
  const n = rankedBets.length;
  if (n < 2) return [];

  const top1 = rankedBets.find((b) => b.rank === 1);
  const top2 = rankedBets.find((b) => b.rank === 2);
  if (!top1 || !top2) return [];

  const stake1 = top1.stakeAmountStroops;
  const stake2 = top2.stakeAmountStroops;
  const prizePool = totalPoolStroops - stake1 - stake2;

  return [
    {
      rank: 1,
      bettorAddress: top1.bettorAddress,
      rewardStroops: stake1 + (prizePool * 65n) / 100n,
    },
    {
      rank: 2,
      bettorAddress: top2.bettorAddress,
      rewardStroops: stake2 + (prizePool * 35n) / 100n,
    },
  ];
}

/**
 * Generic pagination helper used across all list routes.
 */
export function paginate<T>(
  items: T[],
  page: number,
  limit: number
): PaginatedResponse<T> {
  const total = items.length;
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  const start = (page - 1) * limit;
  const data = items.slice(start, start + limit);

  return {
    data,
    pagination: { page, limit, total, totalPages },
  };
}
