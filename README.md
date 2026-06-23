<div align="center">

# XLMPredict

### Decentralized XLM/USDT Price Prediction Platform on Stellar Testnet

Predict XLM price movements, stake real testnet XLM, and earn rewards from a shared pool — powered by on-chain Soroban smart contracts with inter-contract token calls.

[![CI/CD Pipeline](https://github.com/TuanNgoDev/xlm_predict-v1.0/actions/workflows/ci.yml/badge.svg)](https://github.com/TuanNgoDev/xlm_predict-v1.0/actions/workflows/ci.yml)
[![Railway](https://img.shields.io/badge/Railway-Deployed-0B0D0E?style=flat-square&logo=railway&logoColor=white)](https://xlmpredict.up.railway.app)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Rust](https://img.shields.io/badge/Rust-Soroban-CE422B?style=flat-square&logo=rust&logoColor=white)](https://soroban.stellar.org)
[![Stellar](https://img.shields.io/badge/Stellar-Testnet-7B2FBE?style=flat-square&logo=stellar&logoColor=white)](https://stellar.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-336791?style=flat-square&logo=postgresql&logoColor=white)](https://neon.tech)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

</div>

---

## 📋 Table of Contents

- [Live Demo](#-live-demo)
- [Mobile Responsive](#-mobile-responsive)
- [CI/CD Pipeline](#-cicd-pipeline)
- [Smart Contracts](#-smart-contracts)
- [Inter-Contract Calls](#-inter-contract-calls)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Testing](#-testing)
- [API Reference](#-api-reference)

---

## 🌐 Live Demo

| Service | URL |
|---------|-----|
| **Live App (Railway)** | [https://xlmpredict.up.railway.app](https://xlmpredict.up.railway.app) |

---

## 📱 Mobile Responsive

XLMPredict is fully optimized for mobile devices with responsive flex grids, viewport-relative sizing, collapsible panels, and touch-friendly controls.

<div align="center">
  <img src="docs/mobile-preview.png" alt="Mobile responsive view of XLMPredict" width="280" />
</div>

> **Mobile features:** Adaptive navigation, responsive betting card, live price chart with touch gestures, live feed panel, and compact participant stats — all pixel-perfect on screens from 320px and up.

---

## ⚙️ CI/CD Pipeline

Automated via **GitHub Actions** on every push and pull request to `main`.

[![CI/CD Pipeline](https://github.com/TuanNgoDev/xlm_predict-v1.0/actions/workflows/ci.yml/badge.svg)](https://github.com/TuanNgoDev/xlm_predict-v1.0/actions/workflows/ci.yml)

**Pipeline jobs:**

| Job | Steps |
|-----|-------|
| `backend-test` | TypeScript type-check → Unit tests (Vitest) → Property-based tests (fast-check) |
| `frontend-build` | Install dependencies → Production build (Vite) |
| `contract-test` | Setup Rust toolchain → Cargo check (WASM) → Cargo unit tests → Production WASM build |

**Workflow file:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

---

## 📜 Smart Contracts

**Network:** Stellar Testnet (Soroban)

| Item | Value |
|------|-------|
| **Prediction Pool Contract ID** | `CAZSI42RVHPPQBY3LKULN57R4EDPJKXDUXADXRMDCF4GDMVY7KLB2BBD` |
| **Native XLM SAC (Token) Address** | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| **SDK** | Soroban SDK v22 (Rust, `no_std`) |

**Contract functions:**

| Function | Description |
|----------|-------------|
| `initialize` | Bootstrap contract with admin, token, and config |
| `create_round` | Admin opens a new prediction round |
| `place_bet` | User stakes XLM with a predicted price |
| `settle_round` | Admin settles with final price, distributes rewards |
| `cancel_round` | Admin cancels and triggers full refunds |
| `claim_reward` | Winner claims their reward from the pool |

---

## 🔗 Inter-Contract Calls

XLMPredict uses **native Soroban inter-contract calls** to interact with the official Stellar Native Asset Contract (SAC) for all XLM transfers — no custom token standard needed.

**How it works:**

```rust
// contracts/prediction_pool/src/lib.rs

// SAC token client — inter-contract call to Native XLM SAC
let token_client = token::Client::new(&env, &token_id);

// place_bet: transfer XLM from user → contract
token_client.transfer(&bettor, &env.current_contract_address(), &amount);

// settle_round / claim_reward: transfer XLM from contract → winner
token_client.transfer(&env.current_contract_address(), &winner, &reward);

// cancel_round: full refund XLM from contract → each bettor
token_client.transfer(&env.current_contract_address(), &bettor, &stake);
```

**Token / Pool Address:** `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` (Native Stellar XLM SAC on Testnet — initialized dynamically on contract deployment)

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     User Browser                        │
│              Freighter Wallet Extension                  │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────┐
│              Vite + React 19  (Railway)                  │
│  Pages: ActiveRound · History · Leaderboard · Positions  │
│  Services: api.ts · contract.ts · oracle.ts              │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────────┐
│            Express.js Backend  (Railway)                 │
│  Routes: /rounds · /bets · /price · /leaderboard        │
│  Cron (60s): settle_round · cancel_round · price feed    │
│  Soroban RPC Client (simulate + submit admin txs)        │
└──────┬───────────────────────────────┬───────────────────┘
       │ SQL                           │ Soroban RPC
┌──────▼──────────┐      ┌────────────▼──────────────────┐
│  PostgreSQL      │      │    Stellar Testnet (Soroban)   │
│  (Neon Cloud)    │      │                               │
│  rounds · bets   │      │  PredictionPool Contract      │
│  price_feed      │      │  ← calls → Native XLM SAC    │
│  transactions    │      │  (Inter-contract token calls) │
│  user_stats      │      └───────────────────────────────┘
└──────────────────┘
```

### Reward Distribution

```
Rank winners by: |predicted_price - settle_price| ascending

Top 1 reward = stake_1 + 65% × (pool - stake_1 - stake_2)
Top 2 reward = stake_2 + 35% × (pool - stake_1 - stake_2)
Others       = 0 (stake is lost)

Min participants to settle = 3
If participants < 3 → cancel_round, full on-chain refund
```

**Key parameters:**
- **Oracle:** Binance XLMUSDT public API, polled every 30 s
- **Lock time:** 50% of round duration (no new bets after lock)
- **Max participants:** 100 per round
- **Settlement cron:** every 60 s

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript 5, Vite 5 |
| **Styling** | Tailwind CSS, Lucide React |
| **Charts** | TradingView Widget, Recharts |
| **Blockchain** | Stellar Soroban, `@stellar/stellar-sdk` v15 |
| **Wallet** | Freighter via `@stellar/freighter-api` |
| **Smart Contracts** | Rust (`no_std`), Soroban SDK v22 |
| **Backend** | Express.js 4, TypeScript, Node.js 20 |
| **Database** | PostgreSQL — Neon serverless, `pg` driver |
| **Validation** | Zod |
| **Logging** | Pino (structured JSON) |
| **Cron** | node-cron |
| **Rate Limiting** | express-rate-limit (100 req/min per IP) |
| **Testing** | Vitest, Supertest, fast-check (property-based) |
| **CI/CD** | GitHub Actions |
| **Deployment** | Railway (full-stack) |

---

## 📁 Project Structure

```
XLMPredict/
├── .github/workflows/
│   └── ci.yml                    # GitHub Actions CI/CD pipeline
├── src/                          # Frontend (Vite + React 19)
│   ├── components/
│   │   ├── Layout.tsx
│   │   ├── Navbar.tsx
│   │   └── Sidebar.tsx
│   ├── features/
│   │   ├── rounds/
│   │   │   ├── ActiveRoundPage.tsx   # Main betting interface
│   │   │   └── TradingViewWidget.tsx # Live price chart
│   │   ├── history/
│   │   │   └── HistoryPage.tsx
│   │   ├── leaderboard/
│   │   │   └── LeaderboardPage.tsx
│   │   └── positions/
│   │       └── PositionsPage.tsx
│   ├── lib/
│   │   ├── walletContext.tsx          # Freighter wallet context
│   │   └── useToast.tsx
│   └── services/
│       ├── api.ts                    # REST API client
│       ├── contract.ts               # Soroban direct calls
│       └── oracle.ts                 # Binance price feed
├── server/                           # Backend (Express.js + TypeScript)
│   ├── src/
│   │   ├── index.ts
│   │   ├── config.ts                 # Env validation (zod)
│   │   ├── db/
│   │   │   ├── client.ts
│   │   │   └── schema.sql
│   │   ├── routes/
│   │   │   ├── rounds.ts · bets.ts · price.ts
│   │   │   ├── leaderboard.ts · users.ts
│   │   │   ├── rewards.ts · sync.ts · health.ts
│   │   ├── services/
│   │   │   ├── contractService.ts    # Soroban RPC wrapper
│   │   │   ├── oracleService.ts      # Binance price → DB
│   │   │   └── settlementService.ts  # Settle/cancel logic
│   │   ├── cron/
│   │   │   └── settlementCron.ts     # 60s auto-settle
│   │   ├── middleware/
│   │   │   ├── validation.ts · rateLimit.ts · errorHandler.ts
│   │   └── utils/
│   │       ├── conversion.ts         # XLM ↔ Stroops ↔ MicroUSD
│   │       └── ranking.ts            # Reward ranking logic
│   └── tests/
│       ├── unit/                     # Vitest unit tests
│       ├── integration/              # Supertest integration tests
│       └── property/                 # fast-check property tests
└── contracts/
    └── prediction_pool/              # Soroban smart contract (Rust)
        └── src/
            ├── lib.rs                # Contract entry point
            ├── types.rs              # Round, Bet, Error types
            ├── storage.rs            # DataKey definitions
            └── test.rs               # Unit tests verifying contract flow
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Rust + `soroban-cli`
- PostgreSQL database (or [Neon](https://neon.tech) cloud)
- [Freighter](https://freighter.app) browser extension

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/TuanNgoDev/xlm_predict-v1.0.git
cd xlm_predict-v1.0

# 2. Install frontend dependencies
npm install

# 3. Install backend dependencies
cd server && npm install && cd ..

# 4. Configure environment
cp .env.example .env.local
# Fill in your values (see Environment Variables below)

# 5. Run development servers
# Terminal 1 — Frontend
npm run dev

# Terminal 2 — Backend
cd server && npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | `http://localhost:5173` |
| Backend | `http://localhost:3001` |

---

## 🔐 Environment Variables

```env
# ── Frontend (.env.local) ──────────────────────────────
VITE_API_URL=http://localhost:3001
VITE_CONTRACT_ID=CAZSI42RVHPPQBY3LKULN57R4EDPJKXDUXADXRMDCF4GDMVY7KLB2BBD
VITE_RPC_URL=https://soroban-testnet.stellar.org
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015

# ── Backend (server/.env) ──────────────────────────────
DATABASE_URL=postgresql://user:password@host/db
ADMIN_SECRET_KEY=S...
CONTRACT_ID=CAZSI42RVHPPQBY3LKULN57R4EDPJKXDUXADXRMDCF4GDMVY7KLB2BBD
RPC_URL=https://soroban-testnet.stellar.org
NETWORK_PASSPHRASE=Test SDF Network ; September 2015
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173
```

---

## 🧪 Testing

### Backend & Property-Based Testing
```bash
cd server

# Run all backend tests
npm test

# Unit tests only
npm run test:unit

# Property-based tests only
npm run test:property
```

Backend tests cover: reward ranking logic, settlement math, XLM conversion utilities, and property invariants via `fast-check`.

### Smart Contract Unit Testing
```bash
cd contracts/prediction_pool

# Run contract tests
cargo test
```

Smart contract tests cover: contract initialization, round creation, betting validation, round cancellation/refund flow, round settlement, and correct rank-based reward distribution on-chain.

---

## 📡 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Server health check |
| `GET` | `/api/rounds/current` | Active round data |
| `GET` | `/api/rounds` | List rounds (paginated) |
| `POST` | `/api/rounds/record` | Record round from blockchain |
| `GET` | `/api/bets/round/:id` | All bets in a round |
| `GET` | `/api/bets/user/:address` | User bet history |
| `POST` | `/api/bets/record` | Record new bet |
| `GET` | `/api/bets/user/:address/positions` | User open positions |
| `GET` | `/api/price/current` | Current XLM/USDT price |
| `GET` | `/api/price/history` | Historical price feed |
| `GET` | `/api/price/stats` | 24h price statistics |
| `GET` | `/api/leaderboard` | Global leaderboard |
| `GET` | `/api/leaderboard/round/:id` | Round leaderboard |
| `GET` | `/api/users/:address/stats` | User statistics |
| `GET` | `/api/rewards/:address/round/:id` | Reward details |
| `POST` | `/api/rewards/record-claim` | Record reward claim |

---

## 📄 License

MIT © 2026 XLMPredict Team
