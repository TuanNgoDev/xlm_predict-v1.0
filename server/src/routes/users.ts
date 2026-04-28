import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { query, queryOne } from '../db/client.js';
import { stellarAddressSchema, paginationSchema } from '../middleware/validation.js';
import { stroopsToXlm, microUsdToUsd, parseBigInt } from '../utils/conversion.js';

const router = Router();

// GET /api/users/:address/stats
router.get('/:address/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const addrResult = stellarAddressSchema.safeParse(req.params.address);
    if (!addrResult.success) {
      res.status(400).json({ error: 'Invalid address', code: 'VALIDATION_ERROR' });
      return;
    }
    const address = addrResult.data;

    const stats = await queryOne<{
      wallet_address: string;
      total_bets: number;
      total_wins: number;
      total_staked_stroops: string;
      total_rewards_stroops: string;
      win_rate: string;
    }>(`SELECT * FROM user_stats WHERE wallet_address = $1`, [address]);

    const recentBets = await query<{
      round_id: number;
      predicted_price_micro_usd: string;
      stake_amount_stroops: string;
      rank: number | null;
      reward_stroops: string;
      claimed: boolean;
      created_at: Date;
    }>(
      `SELECT round_id, predicted_price_micro_usd, stake_amount_stroops,
              rank, reward_stroops, claimed, created_at
       FROM bets WHERE bettor_address = $1
       ORDER BY created_at DESC LIMIT 5`,
      [address]
    );

    const totalStaked = parseBigInt(stats?.total_staked_stroops ?? '0');
    const totalRewards = parseBigInt(stats?.total_rewards_stroops ?? '0');
    const totalBets = stats?.total_bets ?? 0;
    const totalWins = stats?.total_wins ?? 0;

    res.json({
      totalBets,
      totalWins,
      totalLosses: totalBets - totalWins,
      winRate: parseFloat(stats?.win_rate ?? '0'),
      totalStakedXlm: stroopsToXlm(totalStaked),
      totalRewardsXlm: stroopsToXlm(totalRewards),
      netPnlXlm: stroopsToXlm(totalRewards - totalStaked),
      recentBets: recentBets.map((b) => ({
        roundId: b.round_id,
        predictedPriceUsd: microUsdToUsd(parseBigInt(b.predicted_price_micro_usd)),
        stakeAmountXlm: stroopsToXlm(parseBigInt(b.stake_amount_stroops)),
        rank: b.rank,
        rewardXlm: stroopsToXlm(parseBigInt(b.reward_stroops)),
        claimed: b.claimed,
        createdAt: b.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:address/history
router.get('/:address/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const addrResult = stellarAddressSchema.safeParse(req.params.address);
    if (!addrResult.success) {
      res.status(400).json({ error: 'Invalid address', code: 'VALIDATION_ERROR' });
      return;
    }
    const address = addrResult.data;
    const pageResult = paginationSchema.safeParse(req.query);
    const page = pageResult.success ? pageResult.data.page : 1;
    const limit = pageResult.success ? pageResult.data.limit : 20;
    const offset = (page - 1) * limit;

    const [rows, countRows] = await Promise.all([
      query<{
        id: number;
        wallet_address: string;
        type: string;
        amount_stroops: string;
        round_id: number | null;
        tx_hash: string | null;
        status: string;
        created_at: Date;
      }>(
        `SELECT * FROM transactions WHERE wallet_address = $1
         ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [address, limit, offset]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM transactions WHERE wallet_address = $1`,
        [address]
      ),
    ]);

    const total = parseInt(countRows[0]?.count ?? '0', 10);
    res.json({
      data: rows.map((r) => ({
        id: r.id,
        type: r.type,
        amountXlm: stroopsToXlm(parseBigInt(r.amount_stroops)),
        roundId: r.round_id,
        txHash: r.tx_hash,
        status: r.status,
        createdAt: r.created_at,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
