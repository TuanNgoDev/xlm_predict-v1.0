// Mirrors smart contract reward distribution logic
// REWARD_PCTS = [50, 30, 20] for top-3; [60, 40] for 2 participants
const REWARD_PCTS_3 = [50n, 30n, 20n];
const REWARD_PCTS_2 = [60n, 40n]; // fallback, not used with min 3 rule
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
 * Calculate reward amounts mirroring the smart contract logic.
 * Fee is deducted first, then distributed to top-3 (or top-2).
 * Returns only entries that receive a reward (rank 1–3).
 */
export function calculateRewards(
  rankedBets: Array<{ rank: number; bettorAddress: string; stakeAmountStroops: bigint }>,
  totalPoolStroops: bigint,
  feeBps: bigint = FEE_BPS_DEFAULT
): RewardEntry[] {
  const fee = (totalPoolStroops * feeBps) / BPS_DENOM;
  const prizePool = totalPoolStroops - fee;

  const n = rankedBets.length;
  if (n === 0) return [];

  const pcts = n >= 3 ? REWARD_PCTS_3 : REWARD_PCTS_2;
  const topN = Math.min(n, pcts.length);

  const rewards: RewardEntry[] = [];
  for (let i = 0; i < topN; i++) {
    const bet = rankedBets.find((b) => b.rank === i + 1);
    if (!bet) continue;
    rewards.push({
      rank: i + 1,
      bettorAddress: bet.bettorAddress,
      rewardStroops: (prizePool * pcts[i]) / 100n,
    });
  }

  return rewards;
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
