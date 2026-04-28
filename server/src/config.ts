import { z } from 'zod';

const configSchema = z.object({
  // Required
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  ADMIN_SECRET_KEY: z.string().min(1, 'ADMIN_SECRET_KEY is required'),
  CONTRACT_ID: z.string().min(1, 'CONTRACT_ID is required'),
  RPC_URL: z.string().url('RPC_URL must be a valid URL'),
  NETWORK_PASSPHRASE: z.string().min(1, 'NETWORK_PASSPHRASE is required'),

  // Optional with defaults
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  CRON_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  PRICE_FETCH_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  PORT: z.coerce.number().int().positive().default(3001),
});

export type Config = z.infer<typeof configSchema>;

let _config: Config | null = null;

export function validateConfig(): Config {
  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    console.error(`[config] Missing or invalid environment variables:\n${missing}`);
    process.exit(1);
  }

  _config = result.data;
  return _config;
}

export function getConfig(): Config {
  if (!_config) {
    throw new Error('Config not initialized. Call validateConfig() first.');
  }
  return _config;
}
