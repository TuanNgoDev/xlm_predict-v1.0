import { z, ZodSchema } from 'zod';
import type { Request, Response, NextFunction } from 'express';

// ── Reusable schemas ──────────────────────────────────────────────────────────

export const stellarAddressSchema = z
  .string()
  .length(56, 'Stellar address must be exactly 56 characters')
  .startsWith('G', 'Stellar address must start with G');

export const roundIdSchema = z.coerce
  .number()
  .int('roundId must be an integer')
  .positive('roundId must be positive');

export const predictedPriceSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((v) => BigInt(v))
  .refine((v) => v > 0n, 'predictedPriceMicroUsd must be positive');

export const stakeAmountSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((v) => BigInt(v))
  .refine((v) => v > 0n, 'stakeAmountStroops must be positive');

// ── Request body schemas ──────────────────────────────────────────────────────

export const recordBetSchema = z.object({
  roundId: roundIdSchema,
  bettorAddress: stellarAddressSchema,
  predictedPriceMicroUsd: predictedPriceSchema,
  stakeAmountStroops: stakeAmountSchema,
  txHash: z.string().min(1).optional(),
});

export const recordRoundSchema = z.object({
  contractRoundId: roundIdSchema,
  creatorAddress: stellarAddressSchema,
  startTime: z.string().datetime(),
  lockTime: z.string().datetime(),
  endTime: z.string().datetime(),
  minStakeStroops: stakeAmountSchema,
});

export const recordClaimSchema = z.object({
  address: stellarAddressSchema,
  roundId: roundIdSchema,
  txHash: z.string().min(1),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const priceHistorySchema = z.object({
  limit: z.coerce.number().int().positive().max(1000).default(100),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// ── Middleware factory ────────────────────────────────────────────────────────

type Target = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, target: Target = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: result.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }
    // Attach parsed data back to request
    (req as Request & { parsed: unknown }).parsed = result.data;
    next();
  };
}
