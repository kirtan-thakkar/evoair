import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    PORT: z.string().default('5000'),
    NODE_ENV: z.enum(['development', 'test', 'production'], {
      required_error: 'NODE_ENV is required and must be development, test, or production',
    }),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    CORS_ORIGIN: z.string().optional(),
    REDIS_ENABLED: z.coerce.number().default(0), // Mentor Directive 3: Feature flag toggle (0 or 1)
    REDIS_URL: z.string().default('redis://localhost:6379'),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    GOOGLE_CLIENT_ID: z.string().trim().min(1).optional(),
  })
  .refine((data) => data.JWT_SECRET !== data.JWT_REFRESH_SECRET, {
    message: 'JWT_SECRET and JWT_REFRESH_SECRET must be distinct',
    path: ['JWT_REFRESH_SECRET'],
  })
  .transform((data) => {
    if (!data.CORS_ORIGIN && data.NODE_ENV === 'development') {
      data.CORS_ORIGIN = 'http://localhost:3000';
    }
    return data;
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(' Invalid environment variables:', JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
