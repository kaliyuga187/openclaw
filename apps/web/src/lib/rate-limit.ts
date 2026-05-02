import { env } from './env';

/**
 * In-memory token bucket per (key, minute window). Single-instance only —
 * for multi-replica deploys, replace `hits` with a Redis-backed counter.
 */
const hits = new Map<string, { count: number; expiresAt: number }>();
const WINDOW_MS = 60_000;

function sweep(now: number) {
  if (hits.size < 1024) return;
  for (const [k, v] of hits) if (v.expiresAt < now) hits.delete(k);
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(key: string, limit = env.RATE_LIMIT_PER_MINUTE): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const entry = hits.get(key);
  if (!entry || entry.expiresAt < now) {
    hits.set(key, { count: 1, expiresAt: now + WINDOW_MS });
    return { allowed: true, remaining: limit - 1, resetAt: now + WINDOW_MS };
  }
  entry.count += 1;
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.expiresAt,
  };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'anon';
}
