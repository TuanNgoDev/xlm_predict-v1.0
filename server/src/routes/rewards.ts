import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/client.js';
import { validate, recordClaimSchema, stellarAddressSchema, roundIdSchema } from '../middleware/validation.js';
import { stroopsToXlm, parseBigInt } from '../utils/conversion.js';

const router = Router();

// GET /api/rewards/:address/round/:roundId
router.get('/:address/round/:roundId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const addrResult = stellarAddressSchema.safeParse(req.params.address);
    const idResult = roundIdSchema.safeParse(req.params.roundId);

    if (!addrResult.success || !idResult.success) {
      res.status(400).json({ error: 'Invalid address or round id', code: 'VALIDATION_ERROR' });
      return;
    }

    const row = await queryOne<{
      reward_stroops: string;
      claimed: boolean;
      rank: number | null;
    }>(
      `SELECT reward_stroops, claimed, rank FROM bets
       WHERE bettor_address = $1 AND round_id = $2`,
      [addrResult.data, idResult.data]
    );

    if (!row) {
      res.status(404).json({ error: 'Bet not found', code: 'NOT_FOUND' });
      return;
    }

    res.json({
      rewardXlm: stroopsToXlm(parseBigInt(row.reward_stroops)),
      rewardStroops: row.reward_stroops,
      claimed: row.claimed,
      rank: row.rank,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/rewards/record-claim — idempotent
router.post('/record-claim', validate(recordClaimSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = (req as Request & { parsed: z.infer<typeof recordClaimSchema> }).parsed;

    // Update bet claimed = true (idempotent — no error if already claimed)
    const updated = await query<{ id: number; reward_stroops: string; claimed: boolean }>(
      `UPDATE bets SET claimed = true
       WHERE bettor_address = $1 AND round_id = $2
       RETURNING id, reward_stroops, claimed`,
      [body.address, body.roundId]
    );

    if (updated.length === 0) {
      res.status(404).json({ error: 'Bet not found', code: 'NOT_FOUND' });
      return;
    }

    // Update Reward transaction to confirmed
    await query(
      `UPDATE transactions SET status = 'confirmed', tx_hash = $1
       WHERE wallet_address = $2 AND round_id = $3 AND type = 'Reward'`,
      [body.txHash, body.address, body.roundId]
    );

    // Insert claim transaction only if not already recorded (idempotent)
    const existing = await query<{ id: number }>(
      `SELECT id FROM transactions WHERE wallet_address = $1 AND round_id = $2 AND type = 'Claim'`,
      [body.address, body.roundId]
    );
    if (existing.length === 0) {
      await query(
        `INSERT INTO transactions (wallet_address, type, amount_stroops, round_id, tx_hash, status)
         VALUES ($1, 'Claim', $2, $3, $4, 'confirmed')`,
        [body.address, updated[0].reward_stroops, body.roundId, body.txHash]
      );
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
