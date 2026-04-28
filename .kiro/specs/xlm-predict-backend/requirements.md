# Requirements Document

## Introduction

XLMPredict Backend là hệ thống backend hoàn chỉnh cho nền tảng dự đoán giá XLM (Stellar Lumens) trên blockchain Stellar với smart contract Soroban. Hệ thống bao gồm: REST API server (Next.js API Routes), tích hợp PostgreSQL (Neon) để lưu trữ dữ liệu, cron job tự động settle/cancel các vòng cược, real-time price feed, và tích hợp đầy đủ với smart contract `PredictionPool` đã triển khai trên Stellar Testnet.

Dự án hiện tại đã có:
- Frontend React/Vite với TypeScript
- Smart contract Soroban (`PredictionPool`) với các hàm: `create_round`, `place_bet`, `settle_round`, `cancel_round`, `claim_reward`
- Oracle service lấy giá XLM/USDT từ Binance
- Wallet integration qua Freighter

Backend cần hoàn thiện phần còn thiếu: API layer, database persistence, automation (cron), và real-time data feed.

---

## Glossary

- **API_Server**: Next.js API Routes server xử lý HTTP requests từ frontend
- **Database**: PostgreSQL instance trên Neon cloud
- **Round**: Một vòng cược với trạng thái Open → Locked → Settled/Cancelled
- **Bet**: Một lần đặt cược của một địa chỉ ví vào một Round
- **Oracle**: Service lấy giá XLM/USDT từ Binance public API
- **Cron_Job**: Tiến trình tự động chạy định kỳ để settle/cancel các Round đã hết hạn
- **Admin_Wallet**: Ví Stellar có quyền gọi `settle_round` và `cancel_round` trên smart contract
- **Price_Feed**: Luồng dữ liệu giá XLM theo thời gian thực được lưu vào database
- **Reward**: Phần thưởng XLM được phân phối cho top 3 người dự đoán gần nhất
- **Stroops**: Đơn vị nhỏ nhất của XLM (1 XLM = 10,000,000 stroops)
- **MicroUSD**: Đơn vị giá trong smart contract (1 USD = 1,000,000 microUSD)
- **Lock_Time**: Mốc 50% thời gian của Round — sau đó không nhận cược mới
- **Settlement**: Quá trình kết thúc Round, lấy giá oracle, tính toán và phân phối thưởng
- **Leaderboard**: Bảng xếp hạng người dùng theo tổng thưởng nhận được

---

## Requirements

### Requirement 1: Cấu hình Database và Schema

**User Story:** As a developer, I want a fully initialized PostgreSQL database schema, so that all application data can be persisted reliably.

#### Acceptance Criteria

1. THE Database SHALL có bảng `rounds` lưu trữ thông tin vòng cược với các cột: `id` (SERIAL PRIMARY KEY), `contract_round_id` (INTEGER UNIQUE NOT NULL), `creator_address` (VARCHAR(56) NOT NULL), `start_time` (TIMESTAMPTZ NOT NULL), `lock_time` (TIMESTAMPTZ NOT NULL), `end_time` (TIMESTAMPTZ NOT NULL), `min_stake_stroops` (BIGINT NOT NULL), `total_pool_stroops` (BIGINT DEFAULT 0), `status` (VARCHAR(20) NOT NULL DEFAULT 'Open'), `settle_price_micro_usd` (BIGINT), `created_at` (TIMESTAMPTZ DEFAULT NOW()), `updated_at` (TIMESTAMPTZ DEFAULT NOW())

2. THE Database SHALL có bảng `bets` lưu trữ thông tin đặt cược với các cột: `id` (SERIAL PRIMARY KEY), `round_id` (INTEGER REFERENCES rounds(contract_round_id)), `bettor_address` (VARCHAR(56) NOT NULL), `predicted_price_micro_usd` (BIGINT NOT NULL), `stake_amount_stroops` (BIGINT NOT NULL), `rank` (INTEGER), `reward_stroops` (BIGINT DEFAULT 0), `claimed` (BOOLEAN DEFAULT FALSE), `tx_hash` (VARCHAR(64)), `created_at` (TIMESTAMPTZ DEFAULT NOW()), UNIQUE(round_id, bettor_address)

3. THE Database SHALL có bảng `price_feed` lưu trữ lịch sử giá với các cột: `id` (SERIAL PRIMARY KEY), `price_usd` (DECIMAL(18,8) NOT NULL), `price_micro_usd` (BIGINT NOT NULL), `source` (VARCHAR(20) DEFAULT 'binance'), `recorded_at` (TIMESTAMPTZ DEFAULT NOW())

4. THE Database SHALL có bảng `transactions` lưu trữ lịch sử giao dịch với các cột: `id` (SERIAL PRIMARY KEY), `wallet_address` (VARCHAR(56) NOT NULL), `type` (VARCHAR(20) NOT NULL), `amount_stroops` (BIGINT NOT NULL), `round_id` (INTEGER), `tx_hash` (VARCHAR(64)), `status` (VARCHAR(20) NOT NULL DEFAULT 'pending'), `created_at` (TIMESTAMPTZ DEFAULT NOW())

5. THE Database SHALL có bảng `user_stats` lưu trữ thống kê người dùng với các cột: `wallet_address` (VARCHAR(56) PRIMARY KEY), `total_bets` (INTEGER DEFAULT 0), `total_wins` (INTEGER DEFAULT 0), `total_staked_stroops` (BIGINT DEFAULT 0), `total_rewards_stroops` (BIGINT DEFAULT 0), `win_rate` (DECIMAL(5,2) DEFAULT 0), `updated_at` (TIMESTAMPTZ DEFAULT NOW())

6. WHEN database schema được khởi tạo, THE Database SHALL tạo index trên `bets(bettor_address)`, `bets(round_id)`, `price_feed(recorded_at)`, `transactions(wallet_address)`, `rounds(status)`, `rounds(end_time)`

7. THE Database SHALL sử dụng connection string từ biến môi trường `DATABASE_URL` với SSL mode require

8. IF kết nối database thất bại, THEN THE API_Server SHALL trả về HTTP 503 với message mô tả lỗi

---

### Requirement 2: API Endpoint — Rounds

**User Story:** As a frontend developer, I want REST API endpoints for round management, so that the UI can display and interact with prediction rounds.

#### Acceptance Criteria

1. WHEN client gửi `GET /api/rounds/current`, THE API_Server SHALL trả về thông tin round hiện tại (round mới nhất có status Open hoặc Locked) bao gồm: `contractRoundId`, `status`, `startTime`, `lockTime`, `endTime`, `totalPoolXlm`, `participantCount`, `minStakeXlm`, `settlePrice`

2. WHEN client gửi `GET /api/rounds/:id`, THE API_Server SHALL trả về thông tin chi tiết của round theo `contract_round_id` bao gồm tất cả các trường trong bảng `rounds`

3. WHEN client gửi `GET /api/rounds`, THE API_Server SHALL trả về danh sách rounds với phân trang, hỗ trợ query params: `page` (default 1), `limit` (default 20, max 100), `status` (filter theo trạng thái)

4. WHEN client gửi `POST /api/rounds/sync/:id`, THE API_Server SHALL đồng bộ thông tin round từ smart contract vào database và trả về round đã cập nhật

5. IF round không tồn tại trong database, THEN THE API_Server SHALL trả về HTTP 404 với message `"Round not found"`

6. THE API_Server SHALL trả về tất cả response dưới dạng JSON với Content-Type `application/json`

---

### Requirement 3: API Endpoint — Bets

**User Story:** As a frontend developer, I want REST API endpoints for bet management, so that users can view their bets and the system can track all predictions.

#### Acceptance Criteria

1. WHEN client gửi `GET /api/bets/round/:roundId`, THE API_Server SHALL trả về danh sách tất cả bets trong round đó, bao gồm: `bettorAddress`, `predictedPriceUsd`, `stakeAmountXlm`, `rank`, `rewardXlm`, `claimed`, `txHash`, `createdAt`

2. WHEN client gửi `GET /api/bets/user/:address`, THE API_Server SHALL trả về lịch sử bets của một địa chỉ ví với phân trang (page, limit), bao gồm thông tin round tương ứng

3. WHEN client gửi `POST /api/bets/record`, THE API_Server SHALL nhận payload `{ roundId, bettorAddress, predictedPriceMicroUsd, stakeAmountStroops, txHash }` và lưu bet vào database

4. IF bet đã tồn tại cho cặp (roundId, bettorAddress), THEN THE API_Server SHALL trả về HTTP 409 với message `"Bet already exists for this round"`

5. WHEN client gửi `GET /api/bets/user/:address/positions`, THE API_Server SHALL trả về danh sách positions của user với đầy đủ thông tin: round status, predicted price, stake, outcome (Won/Lost/Pending), reward amount

---

### Requirement 4: API Endpoint — Price Feed

**User Story:** As a frontend developer, I want REST API endpoints for price data, so that the UI can display live and historical XLM prices.

#### Acceptance Criteria

1. WHEN client gửi `GET /api/price/current`, THE API_Server SHALL lấy giá XLM/USDT từ Binance API, lưu vào bảng `price_feed`, và trả về `{ priceUsd, priceMicroUsd, source, recordedAt }`

2. WHEN client gửi `GET /api/price/history`, THE API_Server SHALL trả về lịch sử giá từ bảng `price_feed` với query params: `limit` (default 100, max 1000), `from` (ISO timestamp), `to` (ISO timestamp)

3. THE API_Server SHALL tự động lưu giá vào `price_feed` mỗi 30 giây thông qua cron job

4. IF Binance API không phản hồi trong 5 giây, THEN THE API_Server SHALL trả về giá gần nhất từ database với flag `{ stale: true }`

5. WHEN client gửi `GET /api/price/stats`, THE API_Server SHALL trả về thống kê giá: `high24h`, `low24h`, `change24h`, `changePercent24h`, `avgPrice24h`

---

### Requirement 5: API Endpoint — Leaderboard và User Stats

**User Story:** As a frontend developer, I want REST API endpoints for leaderboard and user statistics, so that users can see rankings and their own performance.

#### Acceptance Criteria

1. WHEN client gửi `GET /api/leaderboard`, THE API_Server SHALL trả về bảng xếp hạng toàn cầu sắp xếp theo `total_rewards_stroops` giảm dần, với phân trang (page, limit), bao gồm: `rank`, `walletAddress`, `totalWins`, `totalBets`, `winRate`, `totalRewardsXlm`, `totalStakedXlm`

2. WHEN client gửi `GET /api/leaderboard/round/:roundId`, THE API_Server SHALL trả về bảng xếp hạng của một round cụ thể, sắp xếp theo độ chính xác dự đoán (gần settle_price nhất), bao gồm: `rank`, `bettorAddress`, `predictedPriceUsd`, `stakeAmountXlm`, `errorAmount`, `rewardXlm`

3. WHEN client gửi `GET /api/users/:address/stats`, THE API_Server SHALL trả về thống kê của một địa chỉ ví: `totalBets`, `totalWins`, `totalLosses`, `winRate`, `totalStakedXlm`, `totalRewardsXlm`, `netPnlXlm`, `bestRank`, `recentBets`

4. WHEN client gửi `GET /api/users/:address/history`, THE API_Server SHALL trả về lịch sử giao dịch của user từ bảng `transactions` với phân trang

5. WHEN một round được settle, THE API_Server SHALL cập nhật bảng `user_stats` cho tất cả participants của round đó

---

### Requirement 6: Cron Job — Tự động Settle và Cancel Rounds

**User Story:** As a system operator, I want automated round settlement and cancellation, so that rounds are resolved without manual intervention.

#### Acceptance Criteria

1. THE Cron_Job SHALL chạy mỗi 60 giây để kiểm tra các rounds cần xử lý

2. WHEN một round có `status = 'Open'` và `end_time <= NOW()` và `participant_count >= 2`, THE Cron_Job SHALL gọi `settle_round` trên smart contract với giá oracle hiện tại

3. WHEN một round có `status = 'Open'` và `end_time <= NOW()` và `participant_count < 2`, THE Cron_Job SHALL gọi `cancel_round` trên smart contract

4. WHEN `settle_round` thành công, THE Cron_Job SHALL cập nhật database: set `rounds.status = 'Settled'`, `rounds.settle_price_micro_usd`, cập nhật `bets.rank` và `bets.reward_stroops` cho top 3, cập nhật `user_stats` cho tất cả participants

5. WHEN `cancel_round` thành công, THE Cron_Job SHALL cập nhật database: set `rounds.status = 'Cancelled'`, ghi nhận refund transactions vào bảng `transactions`

6. IF gọi smart contract thất bại, THEN THE Cron_Job SHALL log lỗi chi tiết và retry sau 60 giây, tối đa 3 lần

7. THE Cron_Job SHALL sử dụng Admin_Wallet từ biến môi trường `ADMIN_SECRET_KEY` để ký transactions

8. WHILE Cron_Job đang xử lý một round, THE Cron_Job SHALL không xử lý lại round đó (idempotent check)

---

### Requirement 7: Phân phối Thưởng

**User Story:** As a bettor, I want rewards to be correctly calculated and distributed, so that I receive the right amount when I win.

#### Acceptance Criteria

1. WHEN một round được settle với `participant_count >= 3`, THE API_Server SHALL tính toán phần thưởng: Top 1 nhận 50% `total_pool`, Top 2 nhận 30% `total_pool`, Top 3 nhận 20% `total_pool`

2. WHEN một round được settle với `participant_count = 2`, THE API_Server SHALL tính toán phần thưởng: Top 1 nhận 60% `total_pool`, Top 2 nhận 40% `total_pool` (theo logic smart contract `REWARD_PCTS`)

3. WHEN một round được settle với `participant_count = 1`, THE API_Server SHALL không phân phối thưởng và gọi `cancel_round` thay thế

4. THE API_Server SHALL xác định thứ hạng dựa trên `|predicted_price - settle_price|` nhỏ nhất

5. IF hai người có cùng sai số dự đoán, THEN THE API_Server SHALL xếp hạng người đặt cược trước (timestamp nhỏ hơn) cao hơn

6. WHEN client gửi `GET /api/rewards/:address/round/:roundId`, THE API_Server SHALL trả về thông tin reward của địa chỉ đó trong round: `rewardXlm`, `claimed`, `rank`

7. WHEN client gửi `POST /api/rewards/record-claim`, THE API_Server SHALL nhận `{ address, roundId, txHash }` và cập nhật `bets.claimed = true` trong database

---

### Requirement 8: Đồng bộ dữ liệu từ Smart Contract

**User Story:** As a system operator, I want the database to stay synchronized with the smart contract state, so that the UI always shows accurate data.

#### Acceptance Criteria

1. WHEN client gửi `POST /api/sync/round/:id`, THE API_Server SHALL đọc trạng thái round từ smart contract qua Soroban RPC và cập nhật database

2. WHEN client gửi `POST /api/sync/bets/:roundId`, THE API_Server SHALL đọc danh sách bettors từ smart contract và đồng bộ vào database

3. THE API_Server SHALL expose endpoint `GET /api/health` trả về `{ status: "ok", db: "connected", contractId, network }` để kiểm tra trạng thái hệ thống

4. WHEN frontend gọi `POST /api/rounds/record`, THE API_Server SHALL nhận thông tin round mới vừa được tạo trên blockchain và lưu vào database

5. IF smart contract trả về lỗi khi đồng bộ, THEN THE API_Server SHALL trả về HTTP 502 với message mô tả lỗi từ contract

---

### Requirement 9: Bảo mật và Validation

**User Story:** As a system operator, I want all API inputs to be validated and the admin key to be protected, so that the system is secure against malicious inputs.

#### Acceptance Criteria

1. THE API_Server SHALL validate tất cả địa chỉ ví Stellar: phải là chuỗi 56 ký tự bắt đầu bằng 'G'

2. THE API_Server SHALL validate `roundId` phải là số nguyên dương

3. THE API_Server SHALL validate `predictedPriceMicroUsd` phải là số nguyên dương lớn hơn 0

4. THE API_Server SHALL validate `stakeAmountStroops` phải là số nguyên dương lớn hơn 0

5. IF bất kỳ validation nào thất bại, THEN THE API_Server SHALL trả về HTTP 400 với message mô tả trường nào không hợp lệ

6. THE API_Server SHALL không expose `ADMIN_SECRET_KEY` trong bất kỳ response nào

7. THE API_Server SHALL sử dụng CORS headers phù hợp, chỉ cho phép origins được cấu hình trong `ALLOWED_ORIGINS`

8. THE API_Server SHALL giới hạn rate limit: tối đa 100 requests/phút cho mỗi IP

---

### Requirement 10: Testing

**User Story:** As a developer, I want comprehensive tests for all backend features, so that I can confidently deploy changes without breaking existing functionality.

#### Acceptance Criteria

1. THE API_Server SHALL có unit tests cho tất cả utility functions: price conversion (USD ↔ MicroUSD ↔ Stroops), reward calculation, round phase determination

2. THE API_Server SHALL có integration tests cho tất cả API endpoints sử dụng test database

3. THE API_Server SHALL có property-based tests cho reward calculation: với bất kỳ tập hợp bets hợp lệ nào, tổng rewards phân phối không vượt quá `total_pool`

4. THE API_Server SHALL có property-based tests cho price conversion: `microUsdToUsd(usdToMicroUsd(price)) ≈ price` với sai số nhỏ hơn 0.000001

5. THE API_Server SHALL có tests cho cron job logic: verify settle được gọi khi đủ điều kiện, cancel được gọi khi không đủ participants

6. WHEN tất cả tests chạy, THE API_Server SHALL đạt coverage tối thiểu 80% cho business logic

7. THE API_Server SHALL có test cho round-trip data: dữ liệu lưu vào database và đọc ra phải giống nhau

---

### Requirement 11: Biến môi trường và Cấu hình

**User Story:** As a developer, I want all sensitive configuration to be managed through environment variables, so that the application can be deployed securely across different environments.

#### Acceptance Criteria

1. THE API_Server SHALL đọc cấu hình từ file `.env` với các biến bắt buộc: `DATABASE_URL`, `ADMIN_SECRET_KEY`, `CONTRACT_ID`, `RPC_URL`, `NETWORK_PASSPHRASE`

2. THE API_Server SHALL đọc cấu hình tùy chọn: `ALLOWED_ORIGINS` (default: `http://localhost:5173`), `CRON_INTERVAL_MS` (default: 60000), `PRICE_FETCH_INTERVAL_MS` (default: 30000), `PORT` (default: 3001)

3. IF biến môi trường bắt buộc không được cung cấp, THEN THE API_Server SHALL log lỗi rõ ràng và dừng khởi động

4. THE API_Server SHALL có file `.env.example` liệt kê tất cả biến môi trường cần thiết với giá trị mẫu (không chứa secrets thật)

5. THE API_Server SHALL có file `.gitignore` đảm bảo `.env` không được commit vào repository

---

### Requirement 12: Logging và Monitoring

**User Story:** As a system operator, I want structured logging for all important events, so that I can monitor system health and debug issues.

#### Acceptance Criteria

1. THE API_Server SHALL log tất cả HTTP requests với: method, path, status code, response time

2. THE Cron_Job SHALL log mỗi lần chạy với: timestamp, số rounds được kiểm tra, số rounds được settle, số rounds được cancel

3. WHEN smart contract transaction thành công, THE API_Server SHALL log: transaction hash, round id, action type, timestamp

4. WHEN smart contract transaction thất bại, THE API_Server SHALL log: error message, round id, action type, retry count

5. THE API_Server SHALL sử dụng structured JSON logging format để dễ dàng parse bởi log aggregation tools

6. THE API_Server SHALL log ở level INFO cho các hoạt động bình thường và ERROR cho các lỗi cần chú ý
