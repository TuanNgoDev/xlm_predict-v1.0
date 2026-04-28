import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as oracle from '../services/oracleService.js';

const router = Router();

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(1000).default(100),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// GET /api/price/current
router.get('/current', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const price = await oracle.getCurrentPrice();
    res.json({
      priceUsd: price.priceUsd,
      priceMicroUsd: price.priceMicroUsd.toString(),
      source: price.source,
      recordedAt: price.recordedAt,
      stale: price.stale ?? false,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/price/history
router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = historyQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query params', code: 'VALIDATION_ERROR', details: parsed.error.errors });
      return;
    }
    const { limit, from, to } = parsed.data;
    const records = await oracle.getHistory({ limit, from, to });
    res.json(records.map((r) => ({
      id: r.id,
      priceUsd: r.priceUsd,
      priceMicroUsd: r.priceMicroUsd.toString(),
      source: r.source,
      recordedAt: r.recordedAt,
    })));
  } catch (err) {
    next(err);
  }
});

// GET /api/price/stats
router.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await oracle.getStats24h();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

export default router;
