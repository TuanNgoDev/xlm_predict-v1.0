import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/client.js';
import { validate, recordRoundSchema, roundIdSchema, paginationSchema } from '../middleware/validation.js';
import { stroopsToXlm, microUsdToUsd, parseBigInt } from '../utils/conversion.js';
import * as contractService from '../services/contractService.js';
import { createError } from '../middleware/errorHandler.js';

const router = Router();

interface DbRound {
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
  settle_tx_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

function dbRoundToApi(row: DbRound) {
  return {
    contractRoundId: row.contract_round_id,
    creatorAddress: row.creator_address,
    startTime: row.start_time,
    lockTime: row.lock_time,
    endTime: row.end_time,
    minStakeXlm: stroopsToXlm(parseBigInt(row.min_stake_stroops)),
    totalPoolXlm: stroopsToXlm(parseBigInt(row.total_pool_stroops)),
    participantCount: row.participant_count,
    status: row.status,
    settlePrice: row.settle_price_micro_usd
      ? microUsdToUsd(parseBigInt(row.settle_price_micro_usd))
      : null,
    settleTxHash: row.settle_tx_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/rounds/current
router.get('/current', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const row = await queryOne<DbRound>(
      `SELECT * FROM rounds WHERE status IN ('Open', 'Locked')
       ORDER BY contract_round_id DESC LIMIT 1`
    );
    if (!row) {
      res.status(404).json({ error: 'No active round found', code: 'NOT_FOUND' });
      return;
    }
    res.json(dbRoundToApi(row));
  } catch (err) {
    next(err);
  }
});

// GET /api/rounds — list with pagination
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pageResult = paginationSchema.safeParse(req.query);
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : null;

    const page = pageResult.success ? pageResult.data.page : 1;
    const limit = pageResult.success ? pageResult.data.limit : 20;
    const offset = (page - 1) * limit;

    const conditions = statusFilter ? `WHERE status = $1` : '';
    const params: unknown[] = statusFilter ? [statusFilter, limit, offset] : [limit, offset];
    const limitIdx = statusFilter ? 2 : 1;
    const offsetIdx = statusFilter ? 3 : 2;

    const [rows, countRows] = await Promise.all([
      query<DbRound>(
        `SELECT * FROM rounds ${conditions} ORDER BY contract_round_id DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM rounds ${conditions}`,
        statusFilter ? [statusFilter] : []
      ),
    ]);

    const total = parseInt(countRows[0]?.count ?? '0', 10);
    res.json({
      data: rows.map(dbRoundToApi),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/rounds/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idResult = roundIdSchema.safeParse(req.params.id);
    if (!idResult.success) {
      res.status(400).json({ error: 'Invalid round id', code: 'VALIDATION_ERROR' });
      return;
    }
    const row = await queryOne<DbRound>(
      `SELECT * FROM rounds WHERE contract_round_id = $1`,
      [idResult.data]
    );
    if (!row) {
      res.status(404).json({ error: 'Round not found', code: 'NOT_FOUND' });
      return;
    }
    res.json(dbRoundToApi(row));
  } catch (err) {
    next(err);
  }
});

// POST /api/rounds/record — frontend calls after create_round on blockchain
router.post('/record', validate(recordRoundSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = (req as Request & { parsed: z.infer<typeof recordRoundSchema> }).parsed;

    const existing = await queryOne<{ id: number }>(
      `SELECT id FROM rounds WHERE contract_round_id = $1`,
      [body.contractRoundId]
    );
    if (existing) {
      res.status(409).json({ error: 'Round already recorded', code: 'CONFLICT' });
      return;
    }

    const rows = await query<DbRound>(
      `INSERT INTO rounds
         (contract_round_id, creator_address, start_time, lock_time, end_time, min_stake_stroops)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        body.contractRoundId,
        body.creatorAddress,
        body.startTime,
        body.lockTime,
        body.endTime,
        body.minStakeStroops.toString(),
      ]
    );
    res.status(201).json(dbRoundToApi(rows[0]));
  } catch (err) {
    next(err);
  }
});

// POST /api/rounds/sync/:id — sync from smart contract
router.post('/sync/:id', async (req: Request, res: Response, next: NextFunction) => {
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

    const rows = await query<DbRound>(
      `INSERT INTO rounds
         (contract_round_id, creator_address, start_time, lock_time, end_time,
          min_stake_stroops, total_pool_stroops, participant_count, status, settle_price_micro_usd)
       VALUES ($1, $2, to_timestamp($3), to_timestamp($4), to_timestamp($5), $6, $7, $8, $9, $10)
       ON CONFLICT (contract_round_id) DO UPDATE SET
         total_pool_stroops = EXCLUDED.total_pool_stroops,
         participant_count  = EXCLUDED.participant_count,
         status             = EXCLUDED.status,
         settle_price_micro_usd = EXCLUDED.settle_price_micro_usd,
         updated_at         = NOW()
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
    res.json(dbRoundToApi(rows[0]));
  } catch (err) {
    next(err);
  }
});

export default router;
