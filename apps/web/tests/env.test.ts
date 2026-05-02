import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const REQUIRED = {
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://x:y@localhost:5432/db',
  NEXTAUTH_SECRET: 'a-very-long-secret-string-32-bytes',
  NEXTAUTH_URL: 'http://localhost:3000',
};

let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
});

afterEach(() => {
  process.env = originalEnv;
});

describe('env validation', () => {
  it('parses a complete environment', async () => {
    Object.assign(process.env, REQUIRED, { NODE_ENV: 'test' });
    const { env } = await import('../src/lib/env');
    expect(env.NEXT_PUBLIC_APP_URL).toBe(REQUIRED.NEXT_PUBLIC_APP_URL);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.RATE_LIMIT_PER_MINUTE).toBe(20);
  });

  it('rejects when required vars are missing', async () => {
    process.env = { NODE_ENV: 'test' } as NodeJS.ProcessEnv;
    // Force a fresh module evaluation.
    await expect(import('../src/lib/env?missing' as string)).rejects.toBeTruthy();
  });
});
