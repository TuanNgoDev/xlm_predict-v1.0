import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { query } from '../db/client.js';
import { roundIdSchema } from '../middleware/validation.js';
import { stroopsToXlm, microUsdToUsd, parseBigInt } from '../utils/conversion.js';
import * as contractService from '../services/contractService.js';

const router = Router();

// POST /api/sync/round/:id
router.post('/round/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idResult = roundIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      res.status(400).json({ error: 'Invalid round id', code: 'VALIDATION_ERROR' });
      return;
    }
    const roundId = idResult.data;

    let contractRound;
    try {
      contractRound = await contractService.getRound(roundId);
    } catch (err) {
      const appErr = err as { statusCode?: number; message?: string };
      res.status(appErr.statusCode ?? 502).json({
        error: appErr.message ?? 'Contract error',
        code: 'CONTRACT_ERROR',
      });
      return;
    }

    const participantCount = await contractService.getParticipantCount(roundId);
    const statusMap: Record<string, string> = { Open: 'Open', Settled: 'Settled', Cancelled: 'Cancelled' };
    const status = statusMap[String(contractRound.status)] ?? 'Open';

    const rows = await query<{
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
    }>(
      `INSERT INTO rounds
         (contract_round_id, creator_address, start_time, lock_time, end_time,
          min_stake_stroops, total_pool_stroops, participant_count, status, settle_price_micro_usd)
       VALUES ($1, $2, to_timestamp($3), to_timestamp($4), to_timestamp($5), $6, $7, $8, $9, $10)
       ON CONFLICT (contract_round_id) DO UPDATE SET
         total_pool_stroops     = EXCLUDED.total_pool_stroops,
         participant_count      = EXCLUDED.participant_count,
         status                 = EXCLUDED.status,
         settle_price_micro_usd = EXCLUDED.settle_price_micro_usd,
         updated_at             = NOW()
       RETURNING *`,
      [
        roundId,
        String(contractRound.creator),
        Number(contractRound.start_time),
        Number(contractRound.lock_time),
        Number(contractRound.end_time),
        contractRound.min_stake.toString(),
        contractRound.total_pool.toString(),
        participantCount,
        status,
        contractRound.settle_price > 0n ? contractRound.settle_price.toString() : null,
      ]
    );

    const r = rows[0];
    res.json({
      contractRoundId: r.contract_round_id,
      creatorAddress: r.creator_address,
      startTime: r.start_time,
      lockTime: r.lock_time,
      endTime: r.end_time,
      minStakeXlm: stroopsToXlm(parseBigInt(r.min_stake_stroops)),
      totalPoolXlm: stroopsToXlm(parseBigInt(r.total_pool_stroops)),
      participantCount: r.participant_count,
      status: r.status,
      settlePrice: r.settle_price_micro_usd
        ? microUsdToUsd(parseBigInt(r.settle_price_micro_usd))
        : null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/sync/bets/:roundId
router.post('/bets/:roundId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idResult = roundIdSchema.safeParse(req.params.roundId);
    if (!idResult.success) {
      res.status(400).json({ error: 'Invalid round id', code: 'VALIDATION_ERROR' });
      return;
    }
    const roundId = idResult.data;

    let bettors: string[];
    try {
      bettors = await contractService.getBettorList(roundId);
    } catch (err) {
      const appErr = err as { statusCode?: number; message?: string };
      res.status(appErr.statusCode ?? 502).json({
        error: appErr.message ?? 'Contract error',
        code: 'CONTRACT_ERROR',
      });
      return;
    }

    let synced = 0;
    for (const bettor of bettors) {
      try {
        const bet = await contractService.getBet(roundId, bettor);
        await query(
          `INSERT INTO bets (round_id, bettor_address, predicted_price_micro_usd, stake_amount_stroops)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (round_id, bettor_address) DO UPDATE SET
             predicted_price_micro_usd = EXCLUDED.predicted_price_micro_usd,
             stake_amount_stroops      = EXCLUDED.stake_amount_stroops`,
          [roundId, bettor, bet.predicted_price.toString(), bet.stake_amount.toString()]
        );
        synced++;
      } catch {
        // Skip individual bet errors
      }
    }

    res.json({ synced });
  } catch (err) {
    next(err);
  }
});

export default router;
