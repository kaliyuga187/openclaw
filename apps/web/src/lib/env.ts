import { z } from 'zod';

/**
 * Boot-time environment validation. Runs once on first import. Process exits
 * (in production) or throws (in dev/test) if anything required is missing.
 * Never imported from client components — server-only.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NEXTAUTH_SECRET: z.string().min(16, 'NEXTAUTH_SECRET must be at least 16 chars'),
  NEXTAUTH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  STRIPE_SECRET_KEY: z.string().optional().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),
  STRIPE_DEFAULT_CURRENCY: z.string().length(3).default('usd'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
});

export type Env = z.infer<typeof schema>;

function parseEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
    const msg = `Invalid environment configuration:\n${issues}`;
    if (process.env.NODE_ENV === 'production') {
      // eslint-disable-next-line no-console
      console.error(msg);
      process.exit(1);
    }
    throw new Error(msg);
  }
  return parsed.data;
}

export const env = parseEnv();

export const features = {
  google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  stripe: Boolean(env.STRIPE_SECRET_KEY),
  stripeWebhook: Boolean(env.STRIPE_WEBHOOK_SECRET),
};
