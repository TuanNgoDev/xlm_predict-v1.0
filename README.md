<div align="center">

# XLMPredict

**Decentralized XLM/USD Price Prediction Platform on Stellar Testnet**

Predict XLM price, stake real testnet XLM, and earn rewards from pool — powered by on-chain Soroban smart contracts.

[![CI/CD Pipeline Status](https://github.com/TuanNgoDev/xlm_predict-v1.0/actions/workflows/ci.yml/badge.svg)](https://github.com/TuanNgoDev/xlm_predict-v1.0/actions)
[![Vercel Deployment](https://img.shields.io/badge/Vercel-Deployed-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://xlmpredict.vercel.app)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-Soroban-CE422B?style=for-the-badge&logo=rust&logoColor=white)](https://soroban.stellar.org/)
[![Stellar](https://img.shields.io/badge/Stellar-Testnet-7B2FBE?style=for-the-badge&logo=stellar&logoColor=white)](https://stellar.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech/)
[![Express](https://img.shields.io/badge/Express.js-4-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Railway](https://img.shields.io/badge/Railway-Deployed-0B0D0E?style=for-the-badge&logo=railway&logoColor=white)](https://railway.app/)

---

### 🚀 Production Submission Details

*   **Vercel Live Demo (Frontend):** [https://xlmpredict.vercel.app](https://xlmpredict.vercel.app)
*   **Railway API & Backend URL:** [https://xlmpredict.up.railway.app/](https://xlmpredict.up.railway.app/)
*   **CI/CD Workflow Status:** [![CI/CD Pipeline Status](https://github.com/TuanNgoDev/xlm_predict-v1.0/actions/workflows/ci.yml/badge.svg)](https://github.com/TuanNgoDev/xlm_predict-v1.0/actions) (Type checking, frontend building, backend unit and property tests fully verified via GitHub Actions).
*   **Mobile Responsiveness:** Highly optimized mobile layout designed using dynamic flex grids, viewport-relative elements, responsive containers, and collapsible toggles built with Tailwind CSS.
*   **Smart Contract ID (Stellar Testnet):** `CAZSI42RVHPPQBY3LKULN57R4EDPJKXDUXADXRMDCF4GDMVY7KLB2BBD`
*   **Dynamic Token SAC Address (Testnet):** `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` (Native Stellar XLM SAC on Testnet, initialized dynamically on deployment).
*   **Inter-Contract Calls:** Deployed dynamic integration invoking the official Native Stellar Asset Contract (SAC) token client (`token::Client`) for secure on-chain transfers, refund escrows, and claim operations.
*   **Commits Count:** 8+ meaningful development commits documenting contract refinements, backend migrations, cron stability, and frontend RPC fault-tolerance.

</div>

---

## Demo Video

[Watch demo videos on Google Drive](https://drive.google.com/drive/folders/1GpEGhH7Rpmhcikr65NjJjwjufwjYALHV)

---

## Testnet Users

Testnet accounts used for demo and testing:

| # | Address |
|---|---------|
| 1 | `GAEU3CLX3AZNNHB6ICCNMUN5VDMVRKJBP4CPQQGLRAXWKAFVBXAGLX32` |
| 2 | `GDQAK5F3RXAHGNUZZGODDTUL4D2OFBQG26LOZF36URKXGDIQQEVBBA4L` |
| 3 | `GCW74EQE6JLW446BLSOFWHAUDTZFBTZLLLBAA7JTRSXLBBWGXR4V4YD5` |
| 4 | `GAVRZLSQR7CEHJCFSN6ENPFRFY3VVICZV2KZWXCIDNFXSE5BUIOLBFCB` |
| 5 | `GBXANKIZ2P4JMKOY5LXSDNFX2VK5I2VKYFJWUNAPQA4JFO3V4PFZBCZT` |
| 6 | `GDLYHOUXV2IGDWK4P7C56JSPMOYU7ZZVQIK3HVQS5WLITWQIXVXHWOJC` |
| 7 | `GCZ2IR57HR7JSKNA5ILVGBWJSUFUHPJHW35RXDQ7HTDBZ2QHURULFP63` |

> Fund your Testnet account with free XLM at the [Stellar Friendbot](https://friendbot.stellar.org)

---

## Feedback & Roadmaps

**Feedback Form (Google Sheet):** [Open Feedback Sheet](https://docs.google.com/spreadsheets/d/1Rb7RLz8RQUfYdOjPLGkgWdFoxulSnC7FWrh6hDGaCXo/edit?usp=sharing)

### Future Improvements & Evolution

Based on collected user feedback, we are actively improving and evolving the project:

- **Enhanced Settlement Accuracy:** Fixed round end price settlement to use the exact price at `end_time` from database instead of live price at cron execution time, eliminating timing drift and ensuring 100% accurate price matching (completed based on feedback from `cucnguyen20121968@gmail.com` - see commit `bde41ab`).
- **Real-time Price Updates:** Implement WebSocket connections for live XLM/USD price streaming to reduce latency and improve user experience during active rounds.
- **Advanced Analytics Dashboard:** Build comprehensive statistics and historical data visualization for users to analyze their prediction patterns and performance trends.
- **Multi-Asset Support:** Expand prediction markets to include other Stellar assets beyond XLM, allowing users to predict prices for various token pairs.

---

## Architecture

```
+------------------------------------------------------------------+
|                        User Browser                              |
|              Freighter Wallet Extension                          |
+---------------------------+--------------------------------------+
                            | HTTPS
+---------------------------v--------------------------------------+
|                   Vite + React 19 Frontend                       |
|  +------------------+   +------------------+                    |
|  |   Pages          |   |   Services       |                    |
|  |                  |   |                  |                    |
|  |  - ActiveRound   |   |  api.ts          |                    |
|  |  - History       |   |  contract.ts     |                    |
|  |  - Leaderboard   |   |  oracle.ts       |                    |
|  |  - Positions     |   |                  |                    |
|  +------------------+   +------------------+                    |
+----------------------------+-------------------------------------+
                             |
+----------------------------v-------------------------------------+
|                   Express.js Backend (Railway)                   |
|  +------------------+   +------------------+  +--------------+  |
|  |   REST API       |   |   Cron Jobs      |  |  Price Feed  |  |
|  |   Routes         |   |   (node-cron)    |  |  (30s)       |  |
|  |                  |   |                  |  |              |  |
|  |  /api/rounds     |   |  Every 60s:      |  |  Binance API |  |
|  |  /api/bets       |   |  - settle_round  |  |  -> DB       |  |
|  |  /api/price      |   |  - cancel_round  |  +--------------+  |
|  |  /api/leaderboard|   |  - update DB     |                    |
|  |  /api/users      |   +------------------+                    |
|  |  /api/rewards    |                                           |
|  |  /api/sync       |   Soroban RPC Client (read-only simulate) |
|  |  /api/health     |                                           |
|  +------------------+                                           |
+----------------------------+-------------------------------------+
                             |
+----------------------------v-------------------------------------+
|                    PostgreSQL (Neon Cloud)                        |
|  rounds | bets | price_feed | transactions | user_stats          |
+------------------------------------------------------------------+
                             |
                             | Soroban RPC
+----------------------------v-------------------------------------+
|                    Stellar Testnet (Soroban)                      |
|                                                                   |
|  +------------------+                                            |
|  | PredictionPool   |                                            |
|  | Contract         |                                            |
|  |                  |                                            |
|  | create_round()   |                                            |
|  | place_bet()      |                                            |
|  | settle_round()   |                                            |
|  | cancel_round()   |                                            |
|  | claim_reward()   |                                            |
|  +------------------+                                            |
+-------------------------------------------------------------------+
```

### Reward Distribution Formula

```
Ranking  = sort bettors by |predicted_price - settle_price| ascending

Top 1 reward = stake_1 + 65% x (total_pool - stake_1 - stake_2) [adjusted to avoid dust]
Top 2 reward = stake_2 + 35% x (total_pool - stake_1 - stake_2)
Others       = 0 (lose stake)

Min participants to settle = 3
If participants < 3        -> cancel_round, full refund
```

- **Oracle:** Binance XLMUSDT public API, polled every 30s
- **Lock time:** 50% of round duration — no new bets after lock
- **Max participants:** 100 per round
- **Cron interval:** 60s auto-settle check

---

## Project Structure

```
XLMPredict/
├── src/                              # Frontend (Vite + React 19)
│   ├── components/
│   │   ├── Layout.tsx                # App layout wrapper
│   │   ├── Navbar.tsx                # Top navigation bar
│   │   └── Sidebar.tsx               # Side navigation
│   ├── features/
│   │   ├── rounds/
│   │   │   ├── ActiveRoundPage.tsx   # Main betting page
│   │   │   └── TradingViewWidget.tsx # Price chart
│   │   ├── history/
│   │   │   └── HistoryPage.tsx       # Transaction history
│   │   ├── leaderboard/
│   │   │   └── LeaderboardPage.tsx   # Global leaderboard
│   │   └── positions/
│   │       └── PositionsPage.tsx     # User positions
│   ├── lib/
│   │   ├── walletContext.tsx          # Freighter wallet context
│   │   └── useToast.tsx              # Toast notifications
│   └── services/
│       ├── api.ts                    # REST API client
│       ├── contract.ts               # Soroban direct calls (Freighter)
│       └── oracle.ts                 # Binance price feed
│
├── server/                           # Backend (Express.js + TypeScript)
│   ├── src/
│   │   ├── index.ts                  # Entry point, Express app setup
│   │   ├── config.ts                 # Env vars validation (zod)
│   │   ├── db/
│   │   │   ├── client.ts             # pg Pool setup
│   │   │   └── schema.sql            # Database schema + indexes
│   │   ├── routes/
│   │   │   ├── rounds.ts             # GET/POST /api/rounds/*
│   │   │   ├── bets.ts               # GET/POST /api/bets/*
│   │   │   ├── price.ts              # GET /api/price/*
│   │   │   ├── leaderboard.ts        # GET /api/leaderboard/*
│   │   │   ├── users.ts              # GET /api/users/*
│   │   │   ├── rewards.ts            # GET/POST /api/rewards/*
│   │   │   ├── sync.ts               # POST /api/sync/*
│   │   │   └── health.ts             # GET /api/health
│   │   ├── services/
│   │   │   ├── contractService.ts    # Soroban RPC wrapper (admin txs)
│   │   │   ├── oracleService.ts      # Binance price fetching + DB
│   │   │   └── settlementService.ts  # Settle/cancel business logic
│   │   ├── cron/
│   │   │   └── settlementCron.ts     # node-cron: settle + price feed
│   │   ├── middleware/
│   │   │   ├── validation.ts         # Zod validators
│   │   │   ├── rateLimit.ts          # 100 req/min per IP
│   │   │   └── errorHandler.ts       # Global error handler
│   │   └── utils/
│   │       ├── conversion.ts         # XLM <-> Stroops <-> MicroUSD
│   │       └── ranking.ts            # Reward ranking logic
│   └── tests/
│       ├── unit/                     # Unit tests (vitest)
│       ├── integration/              # Integration tests (supertest)
│       └── property/                 # Property-based tests (fast-check)
│
└── contracts/
    └── prediction_pool/              # Soroban smart contract (Rust)
        └── src/
            ├── lib.rs                # Contract entry point
            ├── types.rs              # Round, Bet, Error types
            └── storage.rs            # DataKey definitions
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 5, Vite 5 |
| Styling | Tailwind CSS, Lucide React |
| Charts | Recharts, TradingView Widget |
| Blockchain | Stellar Soroban, `@stellar/stellar-sdk` v15 |
| Wallet | Freighter via `@stellar/freighter-api` |
| Smart Contracts | Rust (no_std), Soroban SDK v22 |
| Backend | Express.js 4, TypeScript, Node.js 20 |
| Database | PostgreSQL (Neon serverless), `pg` driver |
| Validation | Zod |
| Logging | Pino (structured JSON) |
| Cron | node-cron |
| Rate Limiting | express-rate-limit |
| Testing | Vitest, Supertest, fast-check (property-based) |
| Deployment | Railway & Vercel |

---

## Getting Started

### Prerequisites

- Node.js 20+
- Rust + `soroban-cli`
- PostgreSQL database (or [Neon](https://neon.tech) cloud)
- Freighter browser extension

### Local Development

```bash
# 1. Clone the repo
git clone https://github.com/TuanNgoDev/xlm_predict-v1.0.git
cd xlm_predict-v1.0

# 2. Install frontend dependencies
npm install

# 3. Install backend dependencies
cd server && npm install

# 4. Configure environment
cp .env.example .env.local
cp server/.env.example server/.env
# Fill in your values (see Environment Variables below)

# 5. Start dev servers
# Terminal 1 — Frontend
npm run dev

# Terminal 2 — Backend
cd server && npm run dev
```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:3001`

### Environment Variables

```env
# Frontend (.env.local)
VITE_API_URL=http://localhost:3001
VITE_CONTRACT_ID=CAZSI42RVHPPQBY3LKULN57R4EDPJKXDUXADXRMDCF4GDMVY7KLB2BBD
VITE_RPC_URL=https://soroban-testnet.stellar.org
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015

# Backend (server/.env)
DATABASE_URL=postgresql://...
ADMIN_SECRET_KEY=S...
CONTRACT_ID=CAZSI42RVHPPQBY3LKULN57R4EDPJKXDUXADXRMDCF4GDMVY7KLB2BBD
RPC_URL=https://soroban-testnet.stellar.org
NETWORK_PASSPHRASE=Test SDF Network ; September 2015
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173
```

---

## Testing

```bash
cd server

# All tests
npm test

# Unit tests only
npm run test:unit

# Property-based tests only
npm run test:property
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Server health check |
| `GET` | `/api/rounds/current` | Active round |
| `GET` | `/api/rounds` | List rounds (paginated) |
| `POST` | `/api/rounds/record` | Record new round from blockchain |
| `GET` | `/api/bets/round/:id` | All bets in a round |
| `GET` | `/api/bets/user/:address` | User bet history |
| `POST` | `/api/bets/record` | Record new bet |
| `GET` | `/api/bets/user/:address/positions` | User positions |
| `GET` | `/api/price/current` | Current XLM price |
| `GET` | `/api/price/history` | Price history |
| `GET` | `/api/price/stats` | 24h price stats |
| `GET` | `/api/leaderboard` | Global leaderboard |
| `GET` | `/api/leaderboard/round/:id` | Round leaderboard |
| `GET` | `/api/users/:address/stats` | User stats |
| `GET` | `/api/rewards/:address/round/:id` | Reward info |
| `POST` | `/api/rewards/record-claim` | Record claim |

---

## Smart Contract

- **Network:** Stellar Testnet
- **Contract ID:** `CAZSI42RVHPPQBY3LKULN57R4EDPJKXDUXADXRMDCF4GDMVY7KLB2BBD`
- **SDK:** Soroban SDK v22
- **Functions:** `initialize` · `create_round` · `place_bet` · `settle_round` · `cancel_round` · `claim_reward`

---

## License

MIT © 2026 XLMPredict Team
