import { NextResponse } from 'next/server';
import { ZodError, type ZodSchema } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { logger } from './logger';
import { rateLimit, clientIp, type RateLimitResult } from './rate-limit';
import type { Actor } from './permissions';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export function jsonError(status: number, message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function requireSession(): Promise<Actor> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'Authentication required');
  return { id: session.user.id, role: session.user.role ?? 'USER' };
}

export async function requireAdmin(): Promise<Actor> {
  const actor = await requireSession();
  if (actor.role !== 'ADMIN') throw new ApiError(403, 'Admin access required');
  return actor;
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, 'Invalid JSON body');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, 'Validation failed', parsed.error.flatten());
  return parsed.data;
}

export function applyRateLimit(req: Request, scope: string, limit?: number): RateLimitResult {
  const ip = clientIp(req);
  const result = rateLimit(`${scope}:${ip}`, limit);
  if (!result.allowed) {
    throw new ApiError(429, 'Too many requests. Try again shortly.');
  }
  return result;
}

/**
 * Wraps a route handler so that thrown ApiError / ZodError become structured
 * responses, and unexpected errors are logged and 500'd without leaking stack.
 */
export function handler<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<Response>
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) return jsonError(err.status, err.message, err.details);
      if (err instanceof ZodError) return jsonError(400, 'Validation failed', err.flatten());
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'api.unhandled_error');
      return jsonError(500, 'Internal server error');
    }
  };
}
