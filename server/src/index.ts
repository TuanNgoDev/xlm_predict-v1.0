import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
const httpLogger = (pinoHttp as unknown as typeof pinoHttp.default ?? pinoHttp);
import pino from 'pino';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { validateConfig } from './config.js';
import { testConnection, runSchema } from './db/client.js';
import { apiRateLimiter } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/errorHandler.js';

import roundsRouter from './routes/rounds.js';
import betsRouter from './routes/bets.js';
import priceRouter from './routes/price.js';
import leaderboardRouter from './routes/leaderboard.js';
import usersRouter from './routes/users.js';
import rewardsRouter from './routes/rewards.js';
import syncRouter from './routes/sync.js';
import healthRouter from './routes/health.js';

import { startSettlementCron, startPriceFeedCron } from './cron/settlementCron.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logger = pino({ name: 'server' });

async function main() {
  // 1. Validate env vars — fail fast
  const config = validateConfig();

  // 2. Test DB connection
  try {
    await testConnection();
    logger.info('Database connected');
  } catch (err) {
    logger.error({ err }, 'Database connection failed — exiting');
    process.exit(1);
  }

  // 3. Run schema migrations
  try {
    const schema = readFileSync(join(__dirname, 'db/schema.sql'), 'utf-8');
    await runSchema(schema);
    logger.info('Database schema applied');
  } catch (err) {
    logger.error({ err }, 'Schema migration failed — exiting');
    process.exit(1);
  }

  // 4. Build Express app
  const app = express();

  // Middleware
  const allowedOrigins = config.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  app.use(cors({ origin: allowedOrigins }));
  app.use(httpLogger({ logger }));
  app.use(express.json());
  app.use(apiRateLimiter);

  // Routes
  app.use('/api/rounds', roundsRouter);
  app.use('/api/bets', betsRouter);
  app.use('/api/price', priceRouter);
  app.use('/api/leaderboard', leaderboardRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/rewards', rewardsRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/health', healthRouter);

  // Global error handler (must be last)
  app.use(errorHandler);

  // 5. Start cron jobs
  startSettlementCron();
  startPriceFeedCron();

  // 6. Start server
  app.listen(config.PORT, () => {
    logger.info(
      {
        port: config.PORT,
        network: config.NETWORK_PASSPHRASE.includes('Test') ? 'testnet' : 'mainnet',
        contractId: config.CONTRACT_ID,
      },
      'XLMPredict server started'
    );
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
