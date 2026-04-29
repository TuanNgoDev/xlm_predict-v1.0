import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/client.js';
import { validate, recordBetSchema, roundIdSchema, stellarAddressSchema, paginationSchema } from '../middleware/validation.js';
import { stroopsToXlm, microUsdToUsd, parseBigInt } from '../utils/conversion.js';

const router = Router();

interface DbBet {
  id: number;
  round_id: number;
  bettor_address: string;
  predicted_price_micro_usd: string;
  stake_amount_stroops: string;
  rank: number | null;
  reward_stroops: string;
  claimed: boolean;
  tx_hash: string | null;
  created_at: Date;
}

interface DbRoundJoin extends DbBet {
  round_status: string;
  round_end_time: Date;
  settle_price_micro_usd: string | null;
}

function dbBetToApi(row: DbBet) {
  return {
    roundId: row.round_id,
    bettorAddress: row.bettor_address,
    predictedPriceUsd: microUsdToUsd(parseBigInt(row.predicted_price_micro_usd)),
    stakeAmountXlm: stroopsToXlm(parseBigInt(row.stake_amount_stroops)),
    rank: row.rank,
    rewardXlm: stroopsToXlm(parseBigInt(row.reward_stroops)),
    claimed: row.claimed,
    txHash: row.tx_hash,
    createdAt: row.created_at,
  };
}

// GET /api/bets/round/:roundId
router.get('/round/:roundId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idResult = roundIdSchema.safeParse(req.params.roundId);
    if (!idResult.success) {
      res.status(400).json({ error: 'Invalid round id', code: 'VALIDATION_ERROR' });
      return;
    }
    const rows = await query<DbBet>(
      `SELECT * FROM bets WHERE round_id = $1 ORDER BY created_at ASC`,
      [idResult.data]
    );
    res.json(rows.map(dbBetToApi));
  } catch (err) {
    next(err);
  }
});

// GET /api/bets/user/:address
router.get('/user/:address', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const addrResult = stellarAddressSchema.safeParse(req.params.address);
    if (!addrResult.success) {
      res.status(400).json({ error: 'Invalid address', code: 'VALIDATION_ERROR' });
      return;
    }
    const pageResult = paginationSchema.safeParse(req.query);
    const page = pageResult.success ? pageResult.data.page : 1;
    const limit = pageResult.success ? pageResult.data.limit : 20;
    const offset = (page - 1) * limit;

    const [rows, countRows] = await Promise.all([
      query<DbRoundJoin>(
        `SELECT b.*, r.status as round_status, r.end_time as round_end_time,
                r.settle_price_micro_usd
         FROM bets b
         JOIN rounds r ON r.contract_round_id = b.round_id
         WHERE b.bettor_address = $1
         ORDER BY b.created_at DESC
         LIMIT $2 OFFSET $3`,
        [addrResult.data, limit, offset]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM bets WHERE bettor_address = $1`,
        [addrResult.data]
      ),
    ]);

    const total = parseInt(countRows[0]?.count ?? '0', 10);
    res.json({
      data: rows.map((r) => ({
        ...dbBetToApi(r),
        roundStatus: r.round_status,
        roundEndTime: r.round_end_time,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/bets/user/:address/positions
router.get('/user/:address/positions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const addrResult = stellarAddressSchema.safeParse(req.params.address);
    if (!addrResult.success) {
      res.status(400).json({ error: 'Invalid address', code: 'VALIDATION_ERROR' });
      return;
    }

    const rows = await query<DbRoundJoin>(
      `SELECT b.*, r.status as round_status, r.end_time as round_end_time,
              r.settle_price_micro_usd
       FROM bets b
       JOIN rounds r ON r.contract_round_id = b.round_id
       WHERE b.bettor_address = $1
       ORDER BY b.created_at DESC`,
      [addrResult.data]
    );

    const positions = rows.map((r) => {
      let outcome: 'Won' | 'Lost' | 'Pending' | 'Refunded' = 'Pending';
      if (r.round_status === 'Settled') {
        // Only top 2 win; rank 3+ lose their stake
        outcome = r.rank !== null && r.rank <= 2 ? 'Won' : 'Lost';
      } else if (r.round_status === 'Cancelled') {
        // < 3 participants — contract already refunded stake on-chain
        outcome = 'Refunded';
      }

      return {
        roundId: r.round_id,
        pair: 'XLM/USD',
        predictedPriceUsd: microUsdToUsd(parseBigInt(r.predicted_price_micro_usd)),
        stakeAmountXlm: stroopsToXlm(parseBigInt(r.stake_amount_stroops)),
        status: r.round_status,
        outcome,
        rewardXlm: stroopsToXlm(parseBigInt(r.reward_stroops)),
        rank: r.rank,
        settlePrice: r.settle_price_micro_usd
          ? microUsdToUsd(parseBigInt(r.settle_price_micro_usd))
          : null,
        claimed: r.claimed,
        createdAt: r.created_at,
        roundEndTime: r.round_end_time,
      };
    });

    res.json(positions);
  } catch (err) {
    next(err);
  }
});

// POST /api/bets/record
router.post('/record', validate(recordBetSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = (req as Request & { parsed: z.infer<typeof recordBetSchema> }).parsed;

    try {
      const rows = await query<DbBet>(
        `INSERT INTO bets
           (round_id, bettor_address, predicted_price_micro_usd, stake_amount_stroops, tx_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          body.roundId,
          body.bettorAddress,
          body.predictedPriceMicroUsd.toString(),
          body.stakeAmountStroops.toString(),
          body.txHash ?? null,
        ]
      );

      // Update round total_pool and participant_count
      await query(
        `UPDATE rounds SET
           total_pool_stroops = total_pool_stroops + $1,
           participant_count  = participant_count + 1,
           updated_at         = NOW()
         WHERE contract_round_id = $2`,
        [body.stakeAmountStroops.toString(), body.roundId]
      );

      res.status(201).json(dbBetToApi(rows[0]));
    } catch (dbErr: unknown) {
      const pgErr = dbErr as { code?: string };
      if (pgErr.code === '23505') {
        res.status(409).json({ error: 'Bet already exists for this round', code: 'CONFLICT' });
        return;
      }
      throw dbErr;
    }
  } catch (err) {
    next(err);
  }
});

export default router;
