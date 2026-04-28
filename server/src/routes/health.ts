import { Router } from 'express';
import type { Request, Response } from 'express';
import { getPool } from '../db/client.js';
import { getConfig } from '../config.js';

const router = Router();

// GET /api/health
router.get('/', async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    const config = getConfig();

    res.json({
      status: 'ok',
      db: 'connected',
      contractId: config.CONTRACT_ID,
      network: config.NETWORK_PASSPHRASE.includes('Test') ? 'testnet' : 'mainnet',
      uptime: Math.floor(process.uptime()),
    });
  } catch {
    res.status(503).json({
      status: 'error',
      db: 'disconnected',
      error: 'Database unavailable',
    });
  }
});

export default router;
