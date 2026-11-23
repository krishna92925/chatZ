import 'dotenv/config';
import { z } from 'zod';

const bool = (d: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  LOG_LEVEL: z.string().default('info'),
  CLIENT_ORIGIN: z.string().min(1, 'CLIENT_ORIGIN is required (comma separated list of allowed web origins)'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_POOL_MAX: z.coerce.number().int().default(10),
  AUTO_MIGRATE: bool(true),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a URL'),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(10, 'SUPABASE_PUBLISHABLE_KEY is required'),
  /** Only for projects that still sign tokens with the legacy shared secret (HS256). */
  SUPABASE_JWT_SECRET: z.string().optional(),
  FILE_URL_SECRET: z.string().min(32, 'FILE_URL_SECRET must be at least 32 characters'),
  // S3 compatible storage (Neon object storage). All four must be set to enable uploads.
  AWS_ENDPOINT_URL_S3: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool(true),
  /** proxy: files stream through this API (works everywhere). presign: browser talks to the bucket directly. */
  STORAGE_DELIVERY: z.enum(['proxy', 'presign']).default('proxy'),
  TRUST_PROXY: z.coerce.number().int().default(0),
});

export type Config = z.infer<typeof schema> & { origins: string[]; storageEnabled: boolean; isProd: boolean };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  const c = parsed.data;
  const origins = c.CLIENT_ORIGIN.split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (!origins.length) throw new Error('Invalid configuration:\n  - CLIENT_ORIGIN: no origin given');
  const storageEnabled = Boolean(c.AWS_ENDPOINT_URL_S3 && c.AWS_ACCESS_KEY_ID && c.AWS_SECRET_ACCESS_KEY && c.S3_BUCKET);
  return { ...c, origins, storageEnabled, isProd: c.NODE_ENV === 'production' };
}
