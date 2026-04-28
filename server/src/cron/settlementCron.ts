import pino from 'pino';
import * as settlementService from '../services/settlementService.js';
import * as oracle from '../services/oracleService.js';
import { getConfig } from '../config.js';

const logger = pino({ name: 'cron' });

const MAX_RETRIES = 3;
const retryCount = new Map<number, number>();

async function processRound(round: settlementService.DbRound): Promise<void> {
  const roundId = round.contract_round_id;
  const attempts = retryCount.get(roundId) ?? 0;

  if (attempts >= MAX_RETRIES) {
    logger.error({ roundId, attempts }, 'Max retries exceeded — manual intervention required');
    return;
  }

  try {
    if (round.participant_count >= 2) {
      await settlementService.settleRound(round);
      logger.info({ roundId }, 'Round settled successfully');
    } else {
      await settlementService.cancelRound(round);
      logger.info({ roundId }, 'Round cancelled (not enough participants)');
    }
    retryCount.delete(roundId);
  } catch (err) {
    const nextAttempt = attempts + 1;
    retryCount.set(roundId, nextAttempt);
    logger.error({ roundId, attempt: nextAttempt, err }, 'Round processing failed, will retry');
  }
}

async function runSettlementTick(): Promise<void> {
  const start = Date.now();
  let settled = 0;
  let cancelled = 0;
  let errors = 0;

  try {
    const rounds = await settlementService.getExpiredOpenRounds();
    logger.info({ count: rounds.length }, 'Settlement tick started');

    for (const round of rounds) {
      const before = { settled, cancelled };
      try {
        if (round.participant_count >= 2) {
          await settlementService.settleRound(round);
          settled++;
        } else {
          await settlementService.cancelRound(round);
          cancelled++;
        }
        retryCount.delete(round.contract_round_id);
      } catch (err) {
        errors++;
        const attempts = (retryCount.get(round.contract_round_id) ?? 0) + 1;
        retryCount.set(round.contract_round_id, attempts);
        logger.error(
          { roundId: round.contract_round_id, attempt: attempts, err },
          'Failed to process round'
        );
      }
    }
  } catch (err) {
    logger.error({ err }, 'Settlement tick failed to fetch rounds');
  }

  logger.info(
    {
      durationMs: Date.now() - start,
      settled,
      cancelled,
      errors,
    },
    'Settlement tick completed'
  );
}

async function runPriceFeedTick(): Promise<void> {
  try {
    const record = await oracle.fetchAndStore();
    logger.debug({ priceUsd: record.priceUsd }, 'Price feed updated');
  } catch (err) {
    logger.warn({ err }, 'Price feed update failed');
  }
}

export function startSettlementCron(): NodeJS.Timeout {
  const config = getConfig();
  const intervalMs = config.CRON_INTERVAL_MS;

  logger.info({ intervalMs }, 'Settlement cron started');

  // Run immediately on start
  void runSettlementTick();

  return setInterval(() => {
    void runSettlementTick();
  }, intervalMs);
}

export function startPriceFeedCron(): NodeJS.Timeout {
  const config = getConfig();
  const intervalMs = config.PRICE_FETCH_INTERVAL_MS;

  logger.info({ intervalMs }, 'Price feed cron started');

  // Run immediately on start
  void runPriceFeedTick();

  return setInterval(() => {
    void runPriceFeedTick();
  }, intervalMs);
}

// Export for testing
export { runSettlementTick, runPriceFeedTick };
