import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { query } from '../db/client.js';
import { roundIdSchema, paginationSchema } from '../middleware/validation.js';
import { stroopsToXlm, microUsdToUsd, parseBigInt } from '../utils/conversion.js';

const router = Router();

// GET /api/leaderboard
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pageResult = paginationSchema.safeParse(req.query);
    const page = pageResult.success ? pageResult.data.page : 1;
    const limit = pageResult.success ? pageResult.data.limit : 20;
    const offset = (page - 1) * limit;

    const [rows, countRows] = await Promise.all([
      query<{
        wallet_address: string;
        total_bets: number;
        total_wins: number;
        total_staked_stroops: string;
        total_rewards_stroops: string;
        win_rate: string;
      }>(
        `SELECT * FROM user_stats
         ORDER BY total_rewards_stroops DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM user_stats`),
    ]);

    const total = parseInt(countRows[0]?.count ?? '0', 10);
    res.json({
      data: rows.map((r, i) => ({
        rank: offset + i + 1,
        walletAddress: r.wallet_address,
        totalWins: r.total_wins,
        totalBets: r.total_bets,
        winRate: parseFloat(r.win_rate),
        totalRewardsXlm: stroopsToXlm(parseBigInt(r.total_rewards_stroops)),
        totalStakedXlm: stroopsToXlm(parseBigInt(r.total_staked_stroops)),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/leaderboard/round/:roundId
router.get('/round/:roundId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idResult = roundIdSchema.safeParse(req.params.roundId);
    if (!idResult.success) {
      res.status(400).json({ error: 'Invalid round id', code: 'VALIDATION_ERROR' });
      return;
    }

    const rows = await query<{
      bettor_address: string;
      predicted_price_micro_usd: string;
      stake_amount_stroops: string;
      rank: number;
      reward_stroops: string;
      settle_price_micro_usd: string | null;
    }>(
      `SELECT b.bettor_address, b.predicted_price_micro_usd, b.stake_amount_stroops,
              b.rank, b.reward_stroops, r.settle_price_micro_usd
       FROM bets b
       JOIN rounds r ON r.contract_round_id = b.round_id
       WHERE b.round_id = $1 AND b.rank IS NOT NULL
       ORDER BY b.rank ASC`,
      [idResult.data]
    );

    res.json(rows.map((r) => {
      const settlePrice = r.settle_price_micro_usd ? parseBigInt(r.settle_price_micro_usd) : 0n;
      const predicted = parseBigInt(r.predicted_price_micro_usd);
      const error = predicted > settlePrice ? predicted - settlePrice : settlePrice - predicted;

      return {
        rank: r.rank,
        bettorAddress: r.bettor_address,
        predictedPriceUsd: microUsdToUsd(predicted),
        stakeAmountXlm: stroopsToXlm(parseBigInt(r.stake_amount_stroops)),
        errorAmount: microUsdToUsd(error),
        rewardXlm: stroopsToXlm(parseBigInt(r.reward_stroops)),
      };
    }));
  } catch (err) {
    next(err);
  }
});

export default router;
