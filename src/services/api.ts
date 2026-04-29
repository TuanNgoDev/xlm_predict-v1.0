/**
 * Backend API client — replaces mockData.ts
 * All calls go to the Express server at VITE_API_URL
 */

const API_BASE = (import.meta as unknown as { env: Record<string, string> }).env.VITE_API_URL ?? 'http://localhost:3001';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApiRound {
  contractRoundId: number;
  creatorAddress: string;
  startTime: string;
  lockTime: string;
  endTime: string;
  minStakeXlm: number;
  totalPoolXlm: number;
  participantCount: number;
  status: 'Open' | 'Locked' | 'Settled' | 'Cancelled';
  settlePrice: number | null;
  settleTxHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiBet {
  roundId: number;
  bettorAddress: string;
  predictedPriceUsd: number;
  stakeAmountXlm: number;
  rank: number | null;
  rewardXlm: number;
  claimed: boolean;
  txHash: string | null;
  createdAt: string;
  roundStatus?: string;
  roundEndTime?: string;
}

export interface ApiPosition {
  roundId: number;
  pair: string;
  predictedPriceUsd: number;
  stakeAmountXlm: number;
  status: string;
  outcome: 'Won' | 'Lost' | 'Pending' | 'Refunded';
  rewardXlm: number;
  rank: number | null;
  settlePrice: number | null;
  claimed: boolean;
  createdAt: string;
  roundEndTime: string;
}

export interface ApiPrice {
  priceUsd: number;
  priceMicroUsd: string;
  source: string;
  recordedAt: string;
  stale: boolean;
}

export interface PriceStats {
  high24h: number;
  low24h: number;
  change24h: number;
  changePercent24h: number;
  avgPrice24h: number;
}

export interface LeaderboardEntry {
  rank: number;
  walletAddress: string;
  totalWins: number;
  totalBets: number;
  winRate: number;
  totalRewardsXlm: number;
  totalStakedXlm: number;
}

export interface RoundLeaderboardEntry {
  rank: number;
  bettorAddress: string;
  predictedPriceUsd: number;
  stakeAmountXlm: number;
  errorAmount: number;
  rewardXlm: number;
}

export interface UserStats {
  totalBets: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  totalStakedXlm: number;
  totalRewardsXlm: number;
  netPnlXlm: number;
  recentBets: ApiBet[];
}

export interface ApiTransaction {
  id: number;
  type: string;
  amountXlm: number;
  roundId: number | null;
  txHash: string | null;
  status: string;
  createdAt: string;
}

export interface RewardInfo {
  rewardXlm: number;
  rewardStroops: string;
  claimed: boolean;
  rank: number | null;
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

export interface HealthStatus {
  status: string;
  db: string;
  contractId: string;
  network: string;
  uptime: number;
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

// ── API object ────────────────────────────────────────────────────────────────

export const api = {
  rounds: {
    getCurrent: () => apiFetch<ApiRound>('/api/rounds/current'),
    getById: (id: number) => apiFetch<ApiRound>(`/api/rounds/${id}`),
    list: (params?: { page?: number; limit?: number; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set('page', String(params.page));
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.status) q.set('status', params.status);
      return apiFetch<PaginatedResponse<ApiRound>>(`/api/rounds?${q}`);
    },
    record: (data: {
      contractRoundId: number;
      creatorAddress: string;
      startTime: string;
      lockTime: string;
      endTime: string;
      minStakeStroops: string;
    }) => apiFetch<ApiRound>('/api/rounds/record', { method: 'POST', body: JSON.stringify(data) }),
    sync: (id: number) => apiFetch<ApiRound>(`/api/rounds/sync/${id}`, { method: 'POST' }),
  },

  bets: {
    getByRound: (roundId: number) => apiFetch<ApiBet[]>(`/api/bets/round/${roundId}`),
    getByUser: (address: string, params?: { page?: number; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set('page', String(params.page));
      if (params?.limit) q.set('limit', String(params.limit));
      return apiFetch<PaginatedResponse<ApiBet>>(`/api/bets/user/${address}?${q}`);
    },
    record: (data: {
      roundId: number;
      bettorAddress: string;
      predictedPriceMicroUsd: string;
      stakeAmountStroops: string;
      txHash?: string;
    }) => apiFetch<ApiBet>('/api/bets/record', { method: 'POST', body: JSON.stringify(data) }),
    getPositions: (address: string) => apiFetch<ApiPosition[]>(`/api/bets/user/${address}/positions`),
  },

  price: {
    getCurrent: () => apiFetch<ApiPrice>('/api/price/current'),
    getHistory: (params?: { limit?: number; from?: string; to?: string }) => {
      const q = new URLSearchParams();
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.from) q.set('from', params.from);
      if (params?.to) q.set('to', params.to);
      return apiFetch<ApiPrice[]>(`/api/price/history?${q}`);
    },
    getStats: () => apiFetch<PriceStats>('/api/price/stats'),
  },

  leaderboard: {
    getGlobal: (params?: { page?: number; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set('page', String(params.page));
      if (params?.limit) q.set('limit', String(params.limit));
      return apiFetch<PaginatedResponse<LeaderboardEntry>>(`/api/leaderboard?${q}`);
    },
    getByRound: (roundId: number) =>
      apiFetch<RoundLeaderboardEntry[]>(`/api/leaderboard/round/${roundId}`),
  },

  users: {
    getStats: (address: string) => apiFetch<UserStats>(`/api/users/${address}/stats`),
    getHistory: (address: string, params?: { page?: number; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set('page', String(params.page));
      if (params?.limit) q.set('limit', String(params.limit));
      return apiFetch<PaginatedResponse<ApiTransaction>>(`/api/users/${address}/history?${q}`);
    },
  },

  rewards: {
    get: (address: string, roundId: number) =>
      apiFetch<RewardInfo>(`/api/rewards/${address}/round/${roundId}`),
    recordClaim: (data: { address: string; roundId: number; txHash: string }) =>
      apiFetch<{ success: boolean }>('/api/rewards/record-claim', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  health: {
    check: () => apiFetch<HealthStatus>('/api/health'),
  },
};
