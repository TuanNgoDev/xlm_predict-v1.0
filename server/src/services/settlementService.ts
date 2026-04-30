import { query, queryOne, withTransaction } from '../db/client.js';
import * as contractService from './contractService.js';
import * as oracle from './oracleService.js';
import { rankBets, calculateRewards } from '../utils/ranking.js';
import { parseBigInt } from '../utils/conversion.js';
import pino from 'pino';

const logger = pino({ name: 'settlement' });

export interface DbRound {
  id: number;
  contract_round_id: number;
  creator_address: string;
  start_time: Date;
  lock_time: Date;
  end_time: Date;
  min_stake_stroops: string;
  total_pool_stroops: string;
  participant_count: number;
  status: string;
  settle_price_micro_usd: string | null;
}

interface DbBet {
  id: number;
  round_id: number;
  bettor_address: string;
  predicted_price_micro_usd: string;
  stake_amount_stroops: string;
  created_at: Date;
}

/**
 * Find all Open rounds whose end_time has passed.
 */
export async function getExpiredOpenRounds(): Promise<DbRound[]> {
  return query<DbRound>(
    `SELECT * FROM rounds WHERE status = 'Open' AND end_time <= NOW()`
  );
}

/**
 * Find Open rounds that passed lock_time with < 3 participants — should be cancelled.
 */
export async function getLockedUnderparticipatedRounds(): Promise<DbRound[]> {
  return query<DbRound>(
    `SELECT * FROM rounds WHERE status = 'Open' AND lock_time <= NOW() AND participant_count < 3`
  );
}

/**
 * Settle a round: get oracle price closest to end_time → call contract → update DB.
 * Uses the price record nearest to round.end_time from DB to avoid timing drift
 * between when the round actually ended and when the cron job runs.
 */
export async function settleRound(round: DbRound): Promise<void> {
  // Idempotency check
  const current = await query<{ status: string }>(
    `SELECT status FROM rounds WHERE contract_round_id = $1`,
    [round.contract_round_id]
  );
  if (current[0]?.status !== 'Open') {
    logger.info({ roundId: round.contract_round_id }, 'Round already processed, skipping');
    return;
  }

  // Use price closest to end_time from DB — avoids drift between end_time and cron execution time.
  // Falls back to live price if no DB record exists near end_time.
  let actualPriceMicroUsd: bigint;
  try {
    const closestRow = await queryOne<{ price_micro_usd: string }>(
      `SELECT price_micro_usd FROM price_feed
       ORDER BY ABS(EXTRACT(EPOCH FROM (recorded_at - $1::timestamptz)))
       LIMIT 1`,
      [round.end_time]
    );
    if (closestRow) {
      actualPriceMicroUsd = BigInt(closestRow.price_micro_usd);
      logger.info(
        { roundId: round.contract_round_id, price: actualPriceMicroUsd.toString(), source: 'db_closest_to_end_time' },
        'Using DB price closest to end_time'
      );
    } else {
      // No price in DB at all — fall back to live fetch
      const priceRecord = await oracle.getCurrentPrice();
      actualPriceMicroUsd = priceRecord.priceMicroUsd;
      logger.warn(
        { roundId: round.contract_round_id, price: actualPriceMicroUsd.toString(), source: 'live_fallback' },
        'No DB price found, using live oracle price'
      );
    }
  } catch {
    const priceRecord = await oracle.getCurrentPrice();
    actualPriceMicroUsd = priceRecord.priceMicroUsd;
    logger.warn(
      { roundId: round.contract_round_id, price: actualPriceMicroUsd.toString(), source: 'live_fallback' },
      'DB price query failed, using live oracle price'
    );
  }

  logger.info(
    { roundId: round.contract_round_id, price: actualPriceMicroUsd.toString() },
    'Settling round'
  );

  const txHash = await contractService.settleRound(round.contract_round_id, actualPriceMicroUsd);

  logger.info({ roundId: round.contract_round_id, txHash }, 'Contract settle_round confirmed');

  await applySettlement(round.contract_round_id, actualPriceMicroUsd, txHash);
}

/**
 * Cancel a round: call contract → update DB.
 */
export async function cancelRound(round: DbRound): Promise<void> {
  // Idempotency check
  const current = await query<{ status: string }>(
    `SELECT status FROM rounds WHERE contract_round_id = $1`,
    [round.contract_round_id]
  );
  if (current[0]?.status !== 'Open') {
    logger.info({ roundId: round.contract_round_id }, 'Round already processed, skipping');
    return;
  }

  logger.info({ roundId: round.contract_round_id }, 'Cancelling round');

  const txHash = await contractService.cancelRound(round.contract_round_id);

  logger.info({ roundId: round.contract_round_id, txHash }, 'Contract cancel_round confirmed');

  await applyCancellation(round.contract_round_id, txHash);
}

/**
 * Mirror settlement results into DB (called after contract confirms).
 */
export async function applySettlement(
  roundId: number,
  settlePrice: bigint,
  txHash: string
): Promise<void> {
  const bets = await query<DbBet>(
    `SELECT * FROM bets WHERE round_id = $1 ORDER BY created_at ASC`,
    [roundId]
  );

  const betsForRanking = bets.map((b) => ({
    bettorAddress: b.bettor_address,
    predictedPriceMicroUsd: parseBigInt(b.predicted_price_micro_usd),
    stakeAmountStroops: parseBigInt(b.stake_amount_stroops),
    createdAt: b.created_at,
  }));

  const ranked = rankBets(betsForRanking, settlePrice);
  const totalPool = bets.reduce((s, b) => s + parseBigInt(b.stake_amount_stroops), 0n);
  const rewards = calculateRewards(ranked, totalPool, 500n);

  await withTransaction(async (client) => {
    // Update round status
    await client.query(
      `UPDATE rounds SET status = 'Settled', settle_price_micro_usd = $1,
       settle_tx_hash = $2, updated_at = NOW()
       WHERE contract_round_id = $3`,
      [settlePrice.toString(), txHash, roundId]
    );

    // Update bets with rank and reward
    for (const rankedBet of ranked) {
      const reward = rewards.find((r) => r.bettorAddress === rankedBet.bettorAddress);
      await client.query(
        `UPDATE bets SET rank = $1, reward_stroops = $2
         WHERE round_id = $3 AND bettor_address = $4`,
        [
          rankedBet.rank,
          reward ? reward.rewardStroops.toString() : '0',
          roundId,
          rankedBet.bettorAddress,
        ]
      );
    }

    // Insert reward transactions for top 3
    for (const reward of rewards) {
      await client.query(
        `INSERT INTO transactions (wallet_address, type, amount_stroops, round_id, tx_hash, status)
         VALUES ($1, 'Reward', $2, $3, $4, 'pending')`,
        [reward.bettorAddress, reward.rewardStroops.toString(), roundId, txHash]
      );
    }

    // Upsert user_stats for all participants
    for (const bet of bets) {
      const isWinner = rewards.some((r) => r.bettorAddress === bet.bettor_address);
      const rewardAmount = rewards.find((r) => r.bettorAddress === bet.bettor_address)?.rewardStroops ?? 0n;

      await client.query(
        `INSERT INTO user_stats (wallet_address, total_bets, total_wins, total_staked_stroops, total_rewards_stroops, win_rate)
         VALUES ($1, 1, $2, $3, $4, $5)
         ON CONFLICT (wallet_address) DO UPDATE SET
           total_bets            = user_stats.total_bets + 1,
           total_wins            = user_stats.total_wins + $2,
           total_staked_stroops  = user_stats.total_staked_stroops + $3,
           total_rewards_stroops = user_stats.total_rewards_stroops + $4,
           win_rate              = CASE
             WHEN (user_stats.total_bets + 1) > 0
             THEN ROUND(((user_stats.total_wins + $2)::numeric / (user_stats.total_bets + 1)) * 100, 2)
             ELSE 0
           END,
           updated_at = NOW()`,
        [
          bet.bettor_address,
          isWinner ? 1 : 0,
          bet.stake_amount_stroops,
          rewardAmount.toString(),
          isWinner ? 100 : 0,
        ]
      );
    }
  });

  logger.info({ roundId, settlePrice: settlePrice.toString(), participants: bets.length }, 'Settlement applied to DB');
}

/**
 * Mirror cancellation into DB (called after contract confirms).
 */
export async function applyCancellation(roundId: number, txHash: string): Promise<void> {
  const bets = await query<DbBet>(
    `SELECT * FROM bets WHERE round_id = $1`,
    [roundId]
  );

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE rounds SET status = 'Cancelled', updated_at = NOW()
       WHERE contract_round_id = $1`,
      [roundId]
    );

    for (const bet of bets) {
      await client.query(
        `INSERT INTO transactions (wallet_address, type, amount_stroops, round_id, tx_hash, status)
         VALUES ($1, 'Refund', $2, $3, $4, 'confirmed')`,
        [bet.bettor_address, bet.stake_amount_stroops, roundId, txHash]
      );
    }
  });

  logger.info({ roundId, refunded: bets.length }, 'Cancellation applied to DB');
}
