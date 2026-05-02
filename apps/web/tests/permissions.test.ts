import { describe, it, expect } from 'vitest';
import { canAccessResource, isAdmin } from '../src/lib/permissions';

describe('permissions', () => {
  it('allows owner', () => {
    expect(canAccessResource({ id: 'u1', role: 'USER' }, 'u1')).toBe(true);
  });
  it('denies non-owner', () => {
    expect(canAccessResource({ id: 'u1', role: 'USER' }, 'u2')).toBe(false);
  });
  it('admin overrides ownership', () => {
    expect(canAccessResource({ id: 'admin', role: 'ADMIN' }, 'someone-else')).toBe(true);
  });
  it('denies missing actor', () => {
    expect(canAccessResource(null, 'u1')).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});

describe('rate limit', () => {
  it('blocks after limit', async () => {
    process.env.NODE_ENV = 'test';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    process.env.DATABASE_URL = 'postgresql://x:y@localhost:5432/db';
    process.env.NEXTAUTH_SECRET = 'a-very-long-secret-string-32-bytes';
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    const { rateLimit } = await import('../src/lib/rate-limit');
    const key = `test-${Math.random()}`;
    let lastAllowed = true;
    for (let i = 0; i < 25; i++) lastAllowed = rateLimit(key, 5).allowed;
    expect(lastAllowed).toBe(false);
  });
});
