import express from 'express';
import cors from 'cors';
import roundsRouter from '../../../src/routes/rounds.js';
import betsRouter from '../../../src/routes/bets.js';
import priceRouter from '../../../src/routes/price.js';
import leaderboardRouter from '../../../src/routes/leaderboard.js';
import usersRouter from '../../../src/routes/users.js';
import rewardsRouter from '../../../src/routes/rewards.js';
import syncRouter from '../../../src/routes/sync.js';
import healthRouter from '../../../src/routes/health.js';
import { errorHandler } from '../../../src/middleware/errorHandler.js';

export function createTestApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api/rounds', roundsRouter);
  app.use('/api/bets', betsRouter);
  app.use('/api/price', priceRouter);
  app.use('/api/leaderboard', leaderboardRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/rewards', rewardsRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/health', healthRouter);

  app.use(errorHandler);
  return app;
}
