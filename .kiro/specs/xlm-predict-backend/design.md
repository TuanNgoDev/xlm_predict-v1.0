# Design Document: XLMPredict Backend


## Overview

XLMPredict Backend là hệ thống server-side hoàn chỉnh cho nền tảng dự đoán giá XLM trên Stellar Testnet. Kiến trúc được thiết kế theo nguyên tắc **"Contract-First, DB-as-Cache"**: mọi state change quan trọng (tạo round, đặt cược, settle, cancel, claim) đều phải được ghi vào smart contract Soroban trước, sau đó mới mirror vào PostgreSQL để phục vụ UI nhanh hơn.

### Nguyên tắc thiết kế cốt lõi

1. **Smart contract là source of truth**: Tất cả state thay đổi đều đi qua contract trước. Database chỉ là read-optimized cache.
2. **Backend server độc lập**: Express.js server trong thư mục `server/`, tách biệt hoàn toàn với Vite frontend.
3. **Admin-only automation**: Cron job dùng admin wallet để gọi `settle_round` / `cancel_round` sau khi round hết hạn.
4. **Idempotent operations**: Mọi sync/settle/cancel đều có idempotency check để tránh double-processing.
5. **Graceful degradation**: Nếu Binance API timeout, trả về giá cũ từ DB với flag `stale: true`.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend server | Express.js + TypeScript |
| Database | PostgreSQL (Neon cloud) |
| DB driver | `pg` (node-postgres) với connection pooling |
| Stellar SDK | `@stellar/stellar-sdk` (đã có trong project) |
| Cron | `node-cron` |
| Validation | `zod` |
| Logging | `pino` (structured JSON) |
| Testing | `vitest` + `fast-check` (PBT) |
| Rate limiting | `express-rate-limit` |


## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         STELLAR TESTNET                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  PredictionPool Contract (Soroban)                           │   │
│  │  CAZSI42RVHPPQBY3LKULN57R4EDPJKXDUXADXRMDCF4GDMVY7KLB2BBD  │   │
│  │  Functions: create_round, place_bet, settle_round,           │   │
│  │             cancel_round, claim_reward, get_*                │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                    ▲ signed txs          ▲ read (simulate)           │
└────────────────────┼─────────────────────┼───────────────────────────┘
                     │                     │
          ┌──────────┴──────────┐          │
          │   Admin Wallet      │          │
          │  (ADMIN_SECRET_KEY) │          │
          └──────────┬──────────┘          │
                     │                     │
┌────────────────────▼─────────────────────▼───────────────────────────┐
│                    EXPRESS.JS BACKEND SERVER (server/)                │
│                                                                       │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│  │   REST API       │  │   Cron Jobs       │  │  Price Feed        │  │
│  │   Routes         │  │   (node-cron)     │  │  (30s interval)    │  │
│  │                  │  │                   │  │                    │  │
│  │  /api/rounds     │  │  Every 60s:       │  │  Binance API       │  │
│  │  /api/bets       │  │  - Check expired  │  │  → price_feed DB   │  │
│  │  /api/price      │  │    rounds         │  └────────────────────┘  │
│  │  /api/leaderboard│  │  - settle_round   │                          │
│  │  /api/users      │  │    or cancel_round│  ┌────────────────────┐  │
│  │  /api/rewards    │  │  - Update DB      │  │  Soroban RPC       │  │
│  │  /api/sync       │  └──────────────────┘  │  Client             │  │
│  │  /api/health     │                         │  (read-only sim)   │  │
│  └─────────────────┘                          └────────────────────┘  │
│                                                                       │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│                    PostgreSQL (Neon Cloud)                             │
│                                                                       │
│  rounds │ bets │ price_feed │ transactions │ user_stats               │
└───────────────────────────────────────────────────────────────────────┘
                                ▲
                                │ REST API calls
┌───────────────────────────────┴───────────────────────────────────────┐
│                    VITE FRONTEND (src/)                                │
│                                                                       │
│  React + TypeScript                                                   │
│  src/services/api.ts  (replaces mockData.ts)                         │
│  src/services/contract.ts  (direct Soroban calls for signed txs)     │
└───────────────────────────────────────────────────────────────────────┘
```

### Request Flow: State-Changing Operations

Các thao tác thay đổi state (create_round, place_bet, claim_reward) được thực hiện **trực tiếp từ frontend** qua Freighter wallet, sau đó frontend gọi backend để record vào DB:

```
Frontend (user action)
    │
    ├─1─► contract.ts: build + simulate tx
    │
    ├─2─► Freighter: user signs tx
    │
    ├─3─► Soroban RPC: submit signed tx
    │
    ├─4─► Wait for confirmation (tx hash)
    │
    └─5─► Backend API: POST /api/rounds/record
                    or POST /api/bets/record
                    or POST /api/rewards/record-claim
                       (mirror to DB)
```

### Request Flow: Admin Automation (Cron)

```
Cron Job (every 60s)
    │
    ├─1─► Query DB: SELECT rounds WHERE status='Open' AND end_time <= NOW()
    │
    ├─2─► For each expired round:
    │       ├─ IF participant_count >= 2:
    │       │     ├─ Fetch oracle price (Binance)
    │       │     ├─ Build settle_round tx (admin wallet)
    │       │     ├─ Submit to Soroban RPC
    │       │     └─ On success: update DB (status, settle_price, bets.rank, rewards, user_stats)
    │       │
    │       └─ IF participant_count < 2:
    │             ├─ Build cancel_round tx (admin wallet)
    │             ├─ Submit to Soroban RPC
    │             └─ On success: update DB (status=Cancelled, refund transactions)
    │
    └─3─► Log results
```

### Directory Structure

```
XLMPredict/
├── src/                          # Frontend (Vite + React)
│   └── services/
│       ├── api.ts                # NEW: replaces mockData.ts
│       ├── contract.ts           # Existing: direct Soroban calls
│       ├── oracle.ts             # Existing: Binance price
│       └── wallet.ts             # Existing: Freighter
│
└── server/                       # NEW: Backend server
    ├── src/
    │   ├── index.ts              # Entry point, Express app setup
    │   ├── config.ts             # Env vars validation (zod)
    │   ├── db/
    │   │   ├── client.ts         # pg Pool setup
    │   │   └── schema.sql        # Database schema
    │   ├── routes/
    │   │   ├── rounds.ts         # /api/rounds/*
    │   │   ├── bets.ts           # /api/bets/*
    │   │   ├── price.ts          # /api/price/*
    │   │   ├── leaderboard.ts    # /api/leaderboard/*
    │   │   ├── users.ts          # /api/users/*
    │   │   ├── rewards.ts        # /api/rewards/*
    │   │   ├── sync.ts           # /api/sync/*
    │   │   └── health.ts         # /api/health
    │   ├── services/
    │   │   ├── contractService.ts # Soroban RPC wrapper (admin txs)
    │   │   ├── oracleService.ts   # Binance price fetching
    │   │   └── settlementService.ts # Settle/cancel logic
    │   ├── cron/
    │   │   └── settlementCron.ts  # node-cron job
    │   ├── middleware/
    │   │   ├── validation.ts      # Zod validators
    │   │   ├── rateLimit.ts       # express-rate-limit
    │   │   └── errorHandler.ts    # Global error handler
    │   └── utils/
    │       ├── conversion.ts      # XLM/stroops/microUSD conversions
    │       └── ranking.ts         # Reward ranking logic
    ├── tests/
    │   ├── unit/
    │   │   ├── conversion.test.ts
    │   │   ├── ranking.test.ts
    │   │   └── validation.test.ts
    │   ├── integration/
    │   │   ├── rounds.test.ts
    │   │   ├── bets.test.ts
    │   │   └── price.test.ts
    │   └── property/
    │       ├── conversion.property.test.ts
    │       ├── ranking.property.test.ts
    │       └── pagination.property.test.ts
    ├── package.json
    ├── tsconfig.json
    ├── .env.example
    └── .gitignore
```


## Components and Interfaces

### 1. Express.js Server (`server/src/index.ts`)

Entry point khởi tạo Express app, đăng ký middleware, routes, và cron jobs.

```typescript
// Startup sequence
async function main() {
  // 1. Validate env vars (fail fast if missing)
  const config = validateConfig();
  
  // 2. Test DB connection
  await db.connect();
  
  // 3. Run schema migrations
  await db.runMigrations();
  
  // 4. Register middleware (cors, rate-limit, json parser, logger)
  
  // 5. Register routes
  
  // 6. Start cron jobs
  startSettlementCron(config.cronIntervalMs);
  startPriceFeedCron(config.priceFetchIntervalMs);
  
  // 7. Start server
  app.listen(config.port);
}
```

### 2. Database Client (`server/src/db/client.ts`)

```typescript
import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Helper: typed query
export async function query<T>(sql: string, params?: unknown[]): Promise<T[]>
```

### 3. Contract Service (`server/src/services/contractService.ts`)

Admin-side contract interactions (signed transactions). Khác với `src/services/contract.ts` ở frontend (dùng Freighter), service này dùng admin secret key để ký.

```typescript
interface ContractService {
  // Admin operations (signed with ADMIN_SECRET_KEY)
  settleRound(roundId: number, actualPriceMicroUsd: bigint): Promise<string>; // returns tx hash
  cancelRound(roundId: number): Promise<string>;
  
  // Read-only (simulate, no signing needed)
  getRound(roundId: number): Promise<ContractRound>;
  getBet(roundId: number, bettor: string): Promise<ContractBet>;
  getReward(roundId: number, bettor: string): Promise<bigint>;
  getBettorList(roundId: number): Promise<string[]>;
  getParticipantCount(roundId: number): Promise<number>;
  getCurrentRound(): Promise<number>;
}
```

### 4. Oracle Service (`server/src/services/oracleService.ts`)

```typescript
interface OracleService {
  // Fetch from Binance, store to DB, return price
  fetchAndStore(): Promise<PriceRecord>;
  
  // Get latest from DB (fallback when Binance unavailable)
  getLatestFromDb(): Promise<PriceRecord & { stale: boolean }>;
  
  // Get current price (tries Binance first, falls back to DB)
  getCurrentPrice(): Promise<PriceRecord & { stale: boolean }>;
  
  // Get price history with filters
  getHistory(opts: { limit: number; from?: Date; to?: Date }): Promise<PriceRecord[]>;
  
  // Compute 24h stats
  getStats24h(): Promise<PriceStats>;
}
```

### 5. Settlement Service (`server/src/services/settlementService.ts`)

Core business logic cho việc settle/cancel rounds.

```typescript
interface SettlementService {
  // Find all rounds that need processing
  getExpiredOpenRounds(): Promise<DbRound[]>;
  
  // Settle a round: call contract, update DB
  settleRound(round: DbRound): Promise<void>;
  
  // Cancel a round: call contract, update DB
  cancelRound(round: DbRound): Promise<void>;
  
  // Update DB after successful settlement
  applySettlement(roundId: number, settlePrice: bigint, txHash: string): Promise<void>;
  
  // Update DB after successful cancellation
  applyCancellation(roundId: number, txHash: string): Promise<void>;
}
```

### 6. Utility Functions (`server/src/utils/`)

#### conversion.ts
```typescript
// XLM ↔ Stroops
export function xlmToStroops(xlm: number): bigint
export function stroopsToXlm(stroops: bigint): number

// USD ↔ MicroUSD (6 decimal places)
export function usdToMicroUsd(usd: number): bigint
export function microUsdToUsd(microUsd: bigint): number

// Format for display
export function formatXlm(stroops: bigint): string
export function formatUsd(microUsd: bigint): string
```

#### ranking.ts
```typescript
interface BetForRanking {
  bettorAddress: string;
  predictedPriceMicroUsd: bigint;
  stakeAmountStroops: bigint;
  createdAt: Date; // for tie-breaking
}

// Rank bets by |predicted - actual|, tie-break by createdAt asc
export function rankBets(
  bets: BetForRanking[],
  actualPriceMicroUsd: bigint
): Array<BetForRanking & { rank: number; error: bigint }>

// Calculate reward amounts (mirrors contract logic)
// Note: actual reward distribution is done by contract.
// This function is used to mirror/verify the contract's distribution.
export function calculateRewards(
  rankedBets: Array<{ rank: number; stakeAmountStroops: bigint }>,
  totalPoolStroops: bigint,
  feeBps: number
): Array<{ rank: number; rewardStroops: bigint }>
```

### 7. Validation Middleware (`server/src/middleware/validation.ts`)

```typescript
import { z } from 'zod';

// Stellar address: 56 chars starting with 'G'
export const stellarAddressSchema = z
  .string()
  .length(56)
  .startsWith('G');

export const roundIdSchema = z.coerce.number().int().positive();

export const predictedPriceSchema = z.coerce.bigint().positive();

export const stakeAmountSchema = z.coerce.bigint().positive();

// Request body schemas
export const recordBetSchema = z.object({
  roundId: roundIdSchema,
  bettorAddress: stellarAddressSchema,
  predictedPriceMicroUsd: predictedPriceSchema,
  stakeAmountStroops: stakeAmountSchema,
  txHash: z.string().length(64).optional(),
});

export const recordRoundSchema = z.object({
  contractRoundId: roundIdSchema,
  creatorAddress: stellarAddressSchema,
  startTime: z.string().datetime(),
  lockTime: z.string().datetime(),
  endTime: z.string().datetime(),
  minStakeStroops: stakeAmountSchema,
});
```

### 8. Frontend API Service (`src/services/api.ts`)

Thay thế `mockData.ts`, gọi backend REST API.

```typescript
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const api = {
  rounds: {
    getCurrent(): Promise<ApiRound>,
    getById(id: number): Promise<ApiRound>,
    list(params?: { page?: number; limit?: number; status?: string }): Promise<PaginatedResponse<ApiRound>>,
    record(data: RecordRoundPayload): Promise<ApiRound>,
    sync(id: number): Promise<ApiRound>,
  },
  bets: {
    getByRound(roundId: number): Promise<ApiBet[]>,
    getByUser(address: string, params?: PaginationParams): Promise<PaginatedResponse<ApiBet>>,
    record(data: RecordBetPayload): Promise<ApiBet>,
    getPositions(address: string): Promise<ApiPosition[]>,
  },
  price: {
    getCurrent(): Promise<ApiPrice>,
    getHistory(params?: PriceHistoryParams): Promise<ApiPrice[]>,
    getStats(): Promise<PriceStats>,
  },
  leaderboard: {
    getGlobal(params?: PaginationParams): Promise<PaginatedResponse<LeaderboardEntry>>,
    getByRound(roundId: number): Promise<RoundLeaderboardEntry[]>,
  },
  users: {
    getStats(address: string): Promise<UserStats>,
    getHistory(address: string, params?: PaginationParams): Promise<PaginatedResponse<ApiTransaction>>,
  },
  rewards: {
    get(address: string, roundId: number): Promise<RewardInfo>,
    recordClaim(data: { address: string; roundId: number; txHash: string }): Promise<void>,
  },
  health: {
    check(): Promise<HealthStatus>,
  },
};
```


## Data Models

### Database Schema (`server/src/db/schema.sql`)

```sql
-- ============================================================
-- Table: rounds
-- Mirror of smart contract Round struct
-- ============================================================
CREATE TABLE IF NOT EXISTS rounds (
  id                      SERIAL PRIMARY KEY,
  contract_round_id       INTEGER UNIQUE NOT NULL,
  creator_address         VARCHAR(56) NOT NULL,
  start_time              TIMESTAMPTZ NOT NULL,
  lock_time               TIMESTAMPTZ NOT NULL,
  end_time                TIMESTAMPTZ NOT NULL,
  min_stake_stroops       BIGINT NOT NULL,
  total_pool_stroops      BIGINT NOT NULL DEFAULT 0,
  status                  VARCHAR(20) NOT NULL DEFAULT 'Open'
                            CHECK (status IN ('Open', 'Locked', 'Settled', 'Cancelled')),
  settle_price_micro_usd  BIGINT,
  settle_tx_hash          VARCHAR(64),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Table: bets
-- Mirror of smart contract Bet struct + reward info
-- ============================================================
CREATE TABLE IF NOT EXISTS bets (
  id                          SERIAL PRIMARY KEY,
  round_id                    INTEGER NOT NULL REFERENCES rounds(contract_round_id),
  bettor_address              VARCHAR(56) NOT NULL,
  predicted_price_micro_usd   BIGINT NOT NULL,
  stake_amount_stroops        BIGINT NOT NULL,
  rank                        INTEGER,                    -- NULL until settled
  reward_stroops              BIGINT NOT NULL DEFAULT 0,  -- 0 until settled
  claimed                     BOOLEAN NOT NULL DEFAULT FALSE,
  tx_hash                     VARCHAR(64),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (round_id, bettor_address)
);

-- ============================================================
-- Table: price_feed
-- Historical XLM/USD prices from Binance
-- ============================================================
CREATE TABLE IF NOT EXISTS price_feed (
  id              SERIAL PRIMARY KEY,
  price_usd       DECIMAL(18, 8) NOT NULL,
  price_micro_usd BIGINT NOT NULL,
  source          VARCHAR(20) NOT NULL DEFAULT 'binance',
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Table: transactions
-- Audit log of all on-chain transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id              SERIAL PRIMARY KEY,
  wallet_address  VARCHAR(56) NOT NULL,
  type            VARCHAR(20) NOT NULL
                    CHECK (type IN ('Stake', 'Reward', 'Refund', 'Claim')),
  amount_stroops  BIGINT NOT NULL,
  round_id        INTEGER,
  tx_hash         VARCHAR(64),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'failed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Table: user_stats
-- Aggregated stats per wallet address (updated after each settle)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_stats (
  wallet_address          VARCHAR(56) PRIMARY KEY,
  total_bets              INTEGER NOT NULL DEFAULT 0,
  total_wins              INTEGER NOT NULL DEFAULT 0,
  total_staked_stroops    BIGINT NOT NULL DEFAULT 0,
  total_rewards_stroops   BIGINT NOT NULL DEFAULT 0,
  win_rate                DECIMAL(5, 2) NOT NULL DEFAULT 0,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bets_bettor_address    ON bets(bettor_address);
CREATE INDEX IF NOT EXISTS idx_bets_round_id          ON bets(round_id);
CREATE INDEX IF NOT EXISTS idx_price_feed_recorded_at ON price_feed(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet    ON transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_rounds_status          ON rounds(status);
CREATE INDEX IF NOT EXISTS idx_rounds_end_time        ON rounds(end_time);
CREATE INDEX IF NOT EXISTS idx_rounds_contract_id     ON rounds(contract_round_id);

-- ============================================================
-- Trigger: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rounds_updated_at
  BEFORE UPDATE ON rounds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER user_stats_updated_at
  BEFORE UPDATE ON user_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### TypeScript Data Models

```typescript
// DB row types (snake_case, mirrors DB columns)
interface DbRound {
  id: number;
  contract_round_id: number;
  creator_address: string;
  start_time: Date;
  lock_time: Date;
  end_time: Date;
  min_stake_stroops: bigint;
  total_pool_stroops: bigint;
  status: 'Open' | 'Locked' | 'Settled' | 'Cancelled';
  settle_price_micro_usd: bigint | null;
  settle_tx_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

interface DbBet {
  id: number;
  round_id: number;
  bettor_address: string;
  predicted_price_micro_usd: bigint;
  stake_amount_stroops: bigint;
  rank: number | null;
  reward_stroops: bigint;
  claimed: boolean;
  tx_hash: string | null;
  created_at: Date;
}

interface DbPriceFeed {
  id: number;
  price_usd: string; // DECIMAL from pg comes as string
  price_micro_usd: bigint;
  source: string;
  recorded_at: Date;
}

interface DbUserStats {
  wallet_address: string;
  total_bets: number;
  total_wins: number;
  total_staked_stroops: bigint;
  total_rewards_stroops: bigint;
  win_rate: string; // DECIMAL from pg
  updated_at: Date;
}

// API response types (camelCase, human-readable units)
interface ApiRound {
  contractRoundId: number;
  creatorAddress: string;
  startTime: string;       // ISO 8601
  lockTime: string;
  endTime: string;
  minStakeXlm: number;
  totalPoolXlm: number;
  participantCount: number;
  status: 'Open' | 'Locked' | 'Settled' | 'Cancelled';
  settlePrice: number | null; // USD
}

interface ApiBet {
  roundId: number;
  bettorAddress: string;
  predictedPriceUsd: number;
  stakeAmountXlm: number;
  rank: number | null;
  rewardXlm: number;
  claimed: boolean;
  txHash: string | null;
  createdAt: string;
}

interface ApiPrice {
  priceUsd: number;
  priceMicroUsd: bigint;
  source: string;
  recordedAt: string;
  stale?: boolean;
}

interface PriceStats {
  high24h: number;
  low24h: number;
  change24h: number;
  changePercent24h: number;
  avgPrice24h: number;
}

interface LeaderboardEntry {
  rank: number;
  walletAddress: string;
  totalWins: number;
  totalBets: number;
  winRate: number;
  totalRewardsXlm: number;
  totalStakedXlm: number;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

### Smart Contract ↔ DB Mapping

| Contract (Rust) | DB Column | Notes |
|----------------|-----------|-------|
| `Round.id` (u32) | `rounds.contract_round_id` | Contract-assigned ID |
| `Round.start_time` (u64 unix) | `rounds.start_time` (TIMESTAMPTZ) | Convert unix → timestamp |
| `Round.lock_time` (u64 unix) | `rounds.lock_time` | |
| `Round.end_time` (u64 unix) | `rounds.end_time` | |
| `Round.min_stake` (i128 stroops) | `rounds.min_stake_stroops` (BIGINT) | |
| `Round.total_pool` (i128 stroops) | `rounds.total_pool_stroops` | |
| `Round.status` (enum) | `rounds.status` (VARCHAR) | Open/Settled/Cancelled |
| `Round.settle_price` (i128 microUSD) | `rounds.settle_price_micro_usd` | |
| `Bet.predicted_price` (i128 microUSD) | `bets.predicted_price_micro_usd` | |
| `Bet.stake_amount` (i128 stroops) | `bets.stake_amount_stroops` | |
| `Reward(round_id, addr)` (i128) | `bets.reward_stroops` | Read after settle |


## API Endpoint Specifications

Tất cả endpoints đều có prefix `/api`. Server chạy trên port `3001` (configurable).

### Rounds

#### `GET /api/rounds/current`
Trả về round mới nhất có status `Open` hoặc `Locked`.

**Response 200:**
```json
{
  "contractRoundId": 42,
  "creatorAddress": "GABC...XYZ",
  "startTime": "2024-01-15T10:00:00Z",
  "lockTime": "2024-01-15T11:00:00Z",
  "endTime": "2024-01-15T12:00:00Z",
  "minStakeXlm": 10,
  "totalPoolXlm": 1250.5,
  "participantCount": 47,
  "status": "Open",
  "settlePrice": null
}
```
**Response 404:** `{ "error": "No active round found" }`

---

#### `GET /api/rounds/:id`
Trả về round theo `contract_round_id`.

**Response 200:** ApiRound object  
**Response 404:** `{ "error": "Round not found" }`

---

#### `GET /api/rounds`
Danh sách rounds với phân trang.

**Query params:** `page` (default 1), `limit` (default 20, max 100), `status`

**Response 200:** `PaginatedResponse<ApiRound>`

---

#### `POST /api/rounds/record`
Frontend gọi sau khi `create_round` thành công trên blockchain.

**Request body:**
```json
{
  "contractRoundId": 42,
  "creatorAddress": "GABC...XYZ",
  "startTime": "2024-01-15T10:00:00Z",
  "lockTime": "2024-01-15T11:00:00Z",
  "endTime": "2024-01-15T12:00:00Z",
  "minStakeStroops": "100000000"
}
```
**Response 201:** ApiRound object  
**Response 409:** `{ "error": "Round already recorded" }`

---

#### `POST /api/rounds/sync/:id`
Đồng bộ round từ smart contract vào DB.

**Response 200:** ApiRound object (updated)  
**Response 502:** `{ "error": "Contract error: ..." }`

---

### Bets

#### `GET /api/bets/round/:roundId`
Tất cả bets trong một round.

**Response 200:** `ApiBet[]`

---

#### `GET /api/bets/user/:address`
Lịch sử bets của một địa chỉ ví.

**Query params:** `page`, `limit`

**Response 200:** `PaginatedResponse<ApiBet & { roundStatus: string; roundEndTime: string }>`

---

#### `POST /api/bets/record`
Frontend gọi sau khi `place_bet` thành công.

**Request body:**
```json
{
  "roundId": 42,
  "bettorAddress": "GABC...XYZ",
  "predictedPriceMicroUsd": "135000",
  "stakeAmountStroops": "100000000",
  "txHash": "abc123...def456"
}
```
**Response 201:** ApiBet object  
**Response 409:** `{ "error": "Bet already exists for this round" }`

---

#### `GET /api/bets/user/:address/positions`
Positions của user với đầy đủ thông tin outcome.

**Response 200:**
```json
[{
  "roundId": 42,
  "pair": "XLM/USD",
  "predictedPriceUsd": 0.135,
  "stakeAmountXlm": 10,
  "status": "Settled",
  "outcome": "Won",
  "rewardXlm": 15.5,
  "rank": 1,
  "settlePrice": 0.1348,
  "createdAt": "2024-01-15T10:30:00Z"
}]
```

---

### Price Feed

#### `GET /api/price/current`
Lấy giá hiện tại từ Binance (hoặc DB nếu Binance timeout).

**Response 200:**
```json
{
  "priceUsd": 0.1352,
  "priceMicroUsd": 135200,
  "source": "binance",
  "recordedAt": "2024-01-15T10:30:00Z",
  "stale": false
}
```

---

#### `GET /api/price/history`
Lịch sử giá từ DB.

**Query params:** `limit` (default 100, max 1000), `from` (ISO), `to` (ISO)

**Response 200:** `ApiPrice[]`

---

#### `GET /api/price/stats`
Thống kê giá 24h.

**Response 200:**
```json
{
  "high24h": 0.1420,
  "low24h": 0.1280,
  "change24h": 0.0052,
  "changePercent24h": 4.0,
  "avgPrice24h": 0.1350
}
```

---

### Leaderboard

#### `GET /api/leaderboard`
Bảng xếp hạng toàn cầu theo `total_rewards_stroops` giảm dần.

**Query params:** `page`, `limit`

**Response 200:** `PaginatedResponse<LeaderboardEntry>`

---

#### `GET /api/leaderboard/round/:roundId`
Xếp hạng trong một round cụ thể.

**Response 200:**
```json
[{
  "rank": 1,
  "bettorAddress": "GABC...XYZ",
  "predictedPriceUsd": 0.1348,
  "stakeAmountXlm": 100,
  "errorAmount": 0.0002,
  "rewardXlm": 562.5
}]
```

---

### Users

#### `GET /api/users/:address/stats`
Thống kê của một địa chỉ ví.

**Response 200:**
```json
{
  "totalBets": 42,
  "totalWins": 15,
  "totalLosses": 27,
  "winRate": 35.71,
  "totalStakedXlm": 4200,
  "totalRewardsXlm": 6300,
  "netPnlXlm": 2100,
  "recentBets": [...]
}
```

---

#### `GET /api/users/:address/history`
Lịch sử giao dịch từ bảng `transactions`.

**Query params:** `page`, `limit`

**Response 200:** `PaginatedResponse<ApiTransaction>`

---

### Rewards

#### `GET /api/rewards/:address/round/:roundId`
Thông tin reward của một địa chỉ trong một round.

**Response 200:**
```json
{
  "rewardXlm": 562.5,
  "rewardStroops": "5625000000",
  "claimed": false,
  "rank": 1
}
```

---

#### `POST /api/rewards/record-claim`
Frontend gọi sau khi `claim_reward` thành công.

**Request body:**
```json
{
  "address": "GABC...XYZ",
  "roundId": 42,
  "txHash": "abc123...def456"
}
```
**Response 200:** `{ "success": true }`

---

### Sync & Health

#### `POST /api/sync/round/:id`
Đọc round từ contract, cập nhật DB.

#### `POST /api/sync/bets/:roundId`
Đọc danh sách bettors từ contract, sync vào DB.

#### `GET /api/health`
**Response 200:**
```json
{
  "status": "ok",
  "db": "connected",
  "contractId": "CAZSI42...",
  "network": "testnet",
  "uptime": 3600
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Price Conversion Round-Trip

*For any* valid XLM price in USD (positive floating-point number), converting to micro-USD and back should produce a value within 0.000001 USD of the original.

Formally: `|microUsdToUsd(usdToMicroUsd(price)) - price| < 0.000001`

**Validates: Requirements 10.4**

---

### Property 2: Stroops Conversion Round-Trip

*For any* valid XLM amount (positive number with up to 7 decimal places), converting to stroops and back should produce a value within 1 stroop of the original.

Formally: `|stroopsToXlm(xlmToStroops(amount)) - amount| < 1e-7`

**Validates: Requirements 10.1**

---

### Property 3: Reward Distribution Invariant

*For any* valid set of bets (at least 2 participants, all with positive stake amounts), the total rewards distributed by `calculateRewards` must not exceed `total_pool * (1 - FEE_BPS/10000)`.

Formally: `sum(rewards) <= totalPool * (1 - 0.05)`

This ensures the fee is always deducted and rewards never exceed the prize pool.

**Validates: Requirements 7.1, 7.2, 10.3**

---

### Property 4: Ranking Ordering Invariant

*For any* set of bets with a known settle price, the output of `rankBets` must be sorted in ascending order of `|predicted_price - settle_price|`. No two adjacent entries in the result may have the first entry's error strictly greater than the second's.

Formally: `∀ i < j: rankedBets[i].error <= rankedBets[j].error`

**Validates: Requirements 7.4**

---

### Property 5: Ranking Tie-Breaking Consistency

*For any* two bets with identical `|predicted_price - settle_price|`, the bet with the earlier `created_at` timestamp must receive the lower (better) rank.

Formally: `if error(a) == error(b) and a.createdAt < b.createdAt then rank(a) < rank(b)`

**Validates: Requirements 7.5**

---

### Property 6: Input Validation Rejects All Invalid Inputs

*For any* string that is not exactly 56 characters long or does not start with 'G', the Stellar address validator must reject it. *For any* non-positive integer or non-integer value, the roundId/price/stake validators must reject it.

Formally:
- `∀ s: len(s) ≠ 56 OR s[0] ≠ 'G' → isValidStellarAddress(s) = false`
- `∀ n ≤ 0: isValidPositiveInt(n) = false`

**Validates: Requirements 9.1, 9.2, 9.3, 9.4**

---

### Property 7: Data Persistence Round-Trip

*For any* valid round or bet data inserted into the database, reading it back by its primary key must return all fields with identical values (modulo timestamp precision).

Formally: `∀ data: read(insert(data)).fields == data.fields`

**Validates: Requirements 2.2, 3.3, 8.4, 10.7**

---

### Property 8: Pagination Correctness

*For any* collection of N items and pagination parameters (page p, limit L), the paginated response must satisfy:
- `len(response.data) <= L`
- `response.pagination.total == N`
- Items on page p must be the correct slice: `items[(p-1)*L .. p*L]`
- No item appears on two different pages

**Validates: Requirements 2.3, 3.2, 5.4**

---

### Property 9: Leaderboard Global Ordering Invariant

*For any* set of user stats, the global leaderboard must be sorted in descending order of `total_rewards_stroops`. No two adjacent entries may have the first entry's rewards strictly less than the second's.

Formally: `∀ i < j: leaderboard[i].totalRewardsStroops >= leaderboard[j].totalRewardsStroops`

**Validates: Requirements 5.1**

---

### Property 10: Round Leaderboard Accuracy Ordering

*For any* settled round with a known settle price, the round leaderboard must be sorted in ascending order of `|predicted_price - settle_price|`.

Formally: `∀ i < j: roundLeaderboard[i].errorAmount <= roundLeaderboard[j].errorAmount`

**Validates: Requirements 5.2**

---

### Property 11: Claim Idempotency

*For any* valid claim operation, calling `record-claim` multiple times for the same (address, roundId) pair must result in `claimed = true` exactly once — subsequent calls must not change the state or create duplicate records.

Formally: `recordClaim(a, r); recordClaim(a, r); getBet(a, r).claimed == true AND count(claims for (a,r)) == 1`

**Validates: Requirements 7.7**

---

### Property 12: Cron Settlement Decision Correctness

*For any* set of rounds with varying statuses, end times, and participant counts, the cron job's settlement decision function must:
- Call `settle_round` for exactly those rounds where `status='Open' AND end_time <= NOW() AND participant_count >= 2`
- Call `cancel_round` for exactly those rounds where `status='Open' AND end_time <= NOW() AND participant_count < 2`
- Not process any round where `status != 'Open'` or `end_time > NOW()`

**Validates: Requirements 6.2, 6.3**

---

### Property 13: Price Stats Correctness

*For any* set of price records within a 24-hour window, the computed stats must satisfy:
- `high24h = max(prices)`
- `low24h = min(prices)`
- `avgPrice24h = mean(prices)`
- `change24h = last(prices) - first(prices)`

**Validates: Requirements 4.5**


## Error Handling

### Error Response Format

Tất cả lỗi đều trả về JSON với format nhất quán:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "field": "fieldName"  // optional, for validation errors
}
```

### HTTP Status Codes

| Status | Scenario |
|--------|----------|
| 200 | Success |
| 201 | Created |
| 400 | Validation error (invalid input) |
| 404 | Resource not found |
| 409 | Conflict (duplicate bet, round already recorded) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
| 502 | Smart contract / Soroban RPC error |
| 503 | Database unavailable |

### Database Connection Failure

```typescript
// Middleware: check DB health before each request
app.use(async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    next();
  } catch (err) {
    res.status(503).json({ error: 'Database unavailable', code: 'DB_UNAVAILABLE' });
  }
});
```

### Soroban RPC Errors

Contract errors được map từ Rust error codes:

| Contract Error | HTTP Status | Message |
|---------------|-------------|---------|
| `RoundNotFound` (2) | 404 | "Round not found on contract" |
| `RoundLocked` (3) | 409 | "Round is locked, no new bets" |
| `AlreadyBet` (8) | 409 | "Address already placed a bet" |
| `TooEarly` (9) | 409 | "Round has not ended yet" |
| `AlreadySettled` (10) | 409 | "Round already settled or cancelled" |
| `NotEnoughParticipants` (15) | 409 | "Not enough participants to settle" |
| Other | 502 | "Contract error: {message}" |

### Cron Job Error Handling

```typescript
async function processRound(round: DbRound, retryCount = 0): Promise<void> {
  try {
    // ... process round
  } catch (err) {
    logger.error({ roundId: round.contract_round_id, retryCount, err }, 'Settlement failed');
    
    if (retryCount < 3) {
      // Retry after 60s (next cron tick)
      await markRoundForRetry(round.contract_round_id, retryCount + 1);
    } else {
      logger.error({ roundId: round.contract_round_id }, 'Max retries exceeded, manual intervention required');
    }
  }
}
```

### Oracle Fallback

```typescript
async function getCurrentPrice(): Promise<ApiPrice> {
  try {
    const price = await fetchBinancePrice(); // 5s timeout
    await storePriceFeed(price);
    return { ...price, stale: false };
  } catch (err) {
    logger.warn('Binance API unavailable, using cached price');
    const cached = await getLatestPriceFromDb();
    return { ...cached, stale: true };
  }
}
```

### Global Error Handler

```typescript
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.errors,
    });
  }
  
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
});
```


## Testing Strategy

### Overview

Dự án sử dụng **dual testing approach**: unit/integration tests cho các behavior cụ thể, và property-based tests cho các invariants phổ quát. Framework: **Vitest** + **fast-check** (PBT library cho TypeScript).

### Test Categories

#### 1. Unit Tests (`server/tests/unit/`)

Kiểm tra các pure functions với concrete examples:

```typescript
// conversion.test.ts
describe('xlmToStroops', () => {
  it('converts 1 XLM to 10_000_000 stroops', () => {
    expect(xlmToStroops(1)).toBe(10_000_000n);
  });
  it('handles fractional XLM', () => {
    expect(xlmToStroops(0.5)).toBe(5_000_000n);
  });
});

// ranking.test.ts
describe('rankBets', () => {
  it('ranks by absolute error ascending', () => {
    const bets = [
      { bettorAddress: 'G...1', predictedPriceMicroUsd: 140_000n, ... },
      { bettorAddress: 'G...2', predictedPriceMicroUsd: 135_000n, ... },
    ];
    const ranked = rankBets(bets, 135_500n);
    expect(ranked[0].bettorAddress).toBe('G...2'); // error: 500
    expect(ranked[1].bettorAddress).toBe('G...1'); // error: 4500
  });
  
  it('tie-breaks by earlier timestamp', () => {
    // Both predict exactly 135_000, first bet wins
  });
});
```

#### 2. Property-Based Tests (`server/tests/property/`)

Sử dụng `fast-check` để generate random inputs và verify invariants:

```typescript
// conversion.property.test.ts
// Feature: xlm-predict-backend, Property 1: Price conversion round-trip
import fc from 'fast-check';

test('price conversion round-trip', () => {
  fc.assert(
    fc.property(
      fc.float({ min: 0.000001, max: 10, noNaN: true }),
      (price) => {
        const microUsd = usdToMicroUsd(price);
        const back = microUsdToUsd(microUsd);
        expect(Math.abs(back - price)).toBeLessThan(0.000001);
      }
    ),
    { numRuns: 1000 }
  );
});

// Feature: xlm-predict-backend, Property 3: Reward distribution invariant
test('total rewards never exceed prize pool', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          stakeAmountStroops: fc.bigInt({ min: 1_000_000n, max: 1_000_000_000n }),
        }),
        { minLength: 2, maxLength: 100 }
      ),
      (bets) => {
        const totalPool = bets.reduce((sum, b) => sum + b.stakeAmountStroops, 0n);
        const rewards = calculateRewards(
          bets.map((b, i) => ({ rank: i + 1, stakeAmountStroops: b.stakeAmountStroops })),
          totalPool,
          500 // FEE_BPS
        );
        const totalRewards = rewards.reduce((sum, r) => sum + r.rewardStroops, 0n);
        const prizePool = totalPool * 9500n / 10000n; // after 5% fee
        expect(totalRewards).toBeLessThanOrEqual(prizePool);
      }
    ),
    { numRuns: 1000 }
  );
});

// Feature: xlm-predict-backend, Property 4: Ranking ordering invariant
test('rankBets output is sorted by error ascending', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          bettorAddress: fc.stringMatching(/^G[A-Z2-7]{55}$/),
          predictedPriceMicroUsd: fc.bigInt({ min: 1n, max: 10_000_000n }),
          stakeAmountStroops: fc.bigInt({ min: 1_000_000n }),
          createdAt: fc.date(),
        }),
        { minLength: 1, maxLength: 100 }
      ),
      fc.bigInt({ min: 1n, max: 10_000_000n }),
      (bets, settlePrice) => {
        const ranked = rankBets(bets, settlePrice);
        for (let i = 0; i < ranked.length - 1; i++) {
          expect(ranked[i].error).toBeLessThanOrEqual(ranked[i + 1].error);
        }
      }
    ),
    { numRuns: 1000 }
  );
});

// Feature: xlm-predict-backend, Property 6: Input validation rejects invalid inputs
test('stellar address validator rejects non-56-char strings', () => {
  fc.assert(
    fc.property(
      fc.string().filter(s => s.length !== 56 || !s.startsWith('G')),
      (invalidAddress) => {
        expect(stellarAddressSchema.safeParse(invalidAddress).success).toBe(false);
      }
    ),
    { numRuns: 1000 }
  );
});

// Feature: xlm-predict-backend, Property 8: Pagination correctness
test('pagination returns correct subsets', () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer(), { minLength: 0, maxLength: 200 }),
      fc.integer({ min: 1, max: 10 }),
      fc.integer({ min: 1, max: 50 }),
      (items, page, limit) => {
        const result = paginate(items, page, limit);
        const start = (page - 1) * limit;
        const expected = items.slice(start, start + limit);
        expect(result.data).toEqual(expected);
        expect(result.pagination.total).toBe(items.length);
        expect(result.data.length).toBeLessThanOrEqual(limit);
      }
    ),
    { numRuns: 1000 }
  );
});

// Feature: xlm-predict-backend, Property 9: Leaderboard ordering invariant
test('global leaderboard is sorted by total_rewards descending', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          walletAddress: fc.stringMatching(/^G[A-Z2-7]{55}$/),
          totalRewardsStroops: fc.bigInt({ min: 0n }),
        }),
        { minLength: 0, maxLength: 100 }
      ),
      (users) => {
        const leaderboard = sortLeaderboard(users);
        for (let i = 0; i < leaderboard.length - 1; i++) {
          expect(leaderboard[i].totalRewardsStroops).toBeGreaterThanOrEqual(
            leaderboard[i + 1].totalRewardsStroops
          );
        }
      }
    ),
    { numRuns: 1000 }
  );
});

// Feature: xlm-predict-backend, Property 13: Price stats correctness
test('price stats high/low/avg are computed correctly', () => {
  fc.assert(
    fc.property(
      fc.array(fc.float({ min: 0.0001, max: 10, noNaN: true }), { minLength: 1, maxLength: 1000 }),
      (prices) => {
        const stats = computePriceStats(prices);
        expect(stats.high24h).toBe(Math.max(...prices));
        expect(stats.low24h).toBe(Math.min(...prices));
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
        expect(Math.abs(stats.avgPrice24h - avg)).toBeLessThan(0.000001);
      }
    ),
    { numRuns: 1000 }
  );
});
```

#### 3. Integration Tests (`server/tests/integration/`)

Sử dụng test database (Neon branch hoặc local PostgreSQL):

```typescript
// rounds.test.ts
describe('POST /api/rounds/record', () => {
  it('stores round and returns it', async () => {
    const payload = { contractRoundId: 999, creatorAddress: 'G...' /* valid */ };
    const res = await request(app).post('/api/rounds/record').send(payload);
    expect(res.status).toBe(201);
    expect(res.body.contractRoundId).toBe(999);
    
    // Verify in DB
    const dbRound = await db.query('SELECT * FROM rounds WHERE contract_round_id = $1', [999]);
    expect(dbRound[0].creator_address).toBe(payload.creatorAddress);
  });
  
  it('returns 409 on duplicate', async () => {
    // Insert once, then again
  });
});

// bets.test.ts — Feature: xlm-predict-backend, Property 7: Data persistence round-trip
describe('Bet record round-trip', () => {
  it('stored bet matches retrieved bet', async () => {
    const bet = { roundId: 1, bettorAddress: 'G...', predictedPriceMicroUsd: '135000', stakeAmountStroops: '100000000' };
    await request(app).post('/api/bets/record').send(bet);
    const res = await request(app).get(`/api/bets/round/1`);
    const stored = res.body.find(b => b.bettorAddress === bet.bettorAddress);
    expect(stored.predictedPriceUsd).toBeCloseTo(0.135, 6);
  });
});
```

#### 4. Smoke Tests

```typescript
// smoke.test.ts
describe('Database schema', () => {
  it('has all required tables', async () => {
    const tables = await db.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const names = tables.map(t => t.table_name);
    expect(names).toContain('rounds');
    expect(names).toContain('bets');
    expect(names).toContain('price_feed');
    expect(names).toContain('transactions');
    expect(names).toContain('user_stats');
  });
  
  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
  });
});
```

### Test Configuration

```json
// server/package.json (test scripts)
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:unit": "vitest run tests/unit",
    "test:property": "vitest run tests/property",
    "test:integration": "vitest run tests/integration"
  }
}
```

```typescript
// server/vitest.config.ts
export default {
  test: {
    coverage: {
      provider: 'v8',
      threshold: { lines: 80, functions: 80, branches: 80 },
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/db/schema.sql'],
    },
  },
};
```

### Property Test Tag Reference

| Property | Tag | Test File |
|----------|-----|-----------|
| P1: Price conversion round-trip | `Feature: xlm-predict-backend, Property 1` | `conversion.property.test.ts` |
| P2: Stroops conversion round-trip | `Feature: xlm-predict-backend, Property 2` | `conversion.property.test.ts` |
| P3: Reward distribution invariant | `Feature: xlm-predict-backend, Property 3` | `ranking.property.test.ts` |
| P4: Ranking ordering invariant | `Feature: xlm-predict-backend, Property 4` | `ranking.property.test.ts` |
| P5: Ranking tie-breaking | `Feature: xlm-predict-backend, Property 5` | `ranking.property.test.ts` |
| P6: Input validation | `Feature: xlm-predict-backend, Property 6` | `validation.property.test.ts` |
| P7: Data persistence round-trip | `Feature: xlm-predict-backend, Property 7` | `bets.test.ts` (integration) |
| P8: Pagination correctness | `Feature: xlm-predict-backend, Property 8` | `pagination.property.test.ts` |
| P9: Leaderboard ordering | `Feature: xlm-predict-backend, Property 9` | `leaderboard.property.test.ts` |
| P10: Round leaderboard accuracy | `Feature: xlm-predict-backend, Property 10` | `leaderboard.property.test.ts` |
| P11: Claim idempotency | `Feature: xlm-predict-backend, Property 11` | `rewards.test.ts` (integration) |
| P12: Cron settlement decision | `Feature: xlm-predict-backend, Property 12` | `cron.property.test.ts` |
| P13: Price stats correctness | `Feature: xlm-predict-backend, Property 13` | `price.property.test.ts` |

