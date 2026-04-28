-- ============================================================
-- XLMPredict Database Schema
-- "Contract-First, DB-as-Cache" — mirrors Soroban contract state
-- ============================================================

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
  participant_count       INTEGER NOT NULL DEFAULT 0,
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
  round_id                    INTEGER NOT NULL REFERENCES rounds(contract_round_id) ON DELETE CASCADE,
  bettor_address              VARCHAR(56) NOT NULL,
  predicted_price_micro_usd   BIGINT NOT NULL,
  stake_amount_stroops        BIGINT NOT NULL,
  rank                        INTEGER,
  reward_stroops              BIGINT NOT NULL DEFAULT 0,
  claimed                     BOOLEAN NOT NULL DEFAULT FALSE,
  tx_hash                     VARCHAR(64),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (round_id, bettor_address)
);

-- ============================================================
-- Table: price_feed
-- Historical XLM/USD prices from Binance oracle
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
-- Aggregated stats per wallet — updated after each settlement
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
-- Trigger: auto-update updated_at on rounds and user_stats
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rounds_updated_at ON rounds;
CREATE TRIGGER rounds_updated_at
  BEFORE UPDATE ON rounds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS user_stats_updated_at ON user_stats;
CREATE TRIGGER user_stats_updated_at
  BEFORE UPDATE ON user_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
