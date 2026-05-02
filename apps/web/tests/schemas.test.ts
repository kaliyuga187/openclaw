import { describe, it, expect } from 'vitest';
import { signUpSchema, signInSchema } from '../src/schemas/auth';
import { createProjectSchema } from '../src/schemas/project';
import { createTaskSchema } from '../src/schemas/task';
import { createInvoiceSchema, computeTotalCents } from '../src/schemas/invoice';

describe('auth schemas', () => {
  it('accepts a strong password', () => {
    expect(signUpSchema.safeParse({ name: 'Jane', email: 'a@b.co', password: 'abcd1234' }).success).toBe(true);
  });
  it('rejects passwords without a number', () => {
    expect(signUpSchema.safeParse({ name: 'Jane', email: 'a@b.co', password: 'abcdefgh' }).success).toBe(false);
  });
  it('rejects malformed email on sign-in', () => {
    expect(signInSchema.safeParse({ email: 'nope', password: 'abcd1234' }).success).toBe(false);
  });
});

describe('project schema', () => {
  it('defaults status to PLANNING', () => {
    const r = createProjectSchema.parse({ name: 'X' });
    expect(r.status).toBe('PLANNING');
  });
  it('rejects empty name', () => {
    expect(createProjectSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('task schema', () => {
  it('parses an empty due date as null', () => {
    const r = createTaskSchema.parse({ title: 'T', projectId: 'cuid_abc' });
    expect(r.dueDate).toBeNull();
  });
});

describe('invoice schema', () => {
  it('requires at least one item', () => {
    expect(
      createInvoiceSchema.safeParse({
        client: 'Acme',
        email: 'a@b.co',
        items: [],
      }).success
    ).toBe(false);
  });
  it('computes totals from items', () => {
    expect(
      computeTotalCents([
        { description: 'a', quantity: 2, unitCents: 500 },
        { description: 'b', quantity: 1, unitCents: 250 },
      ])
    ).toBe(1250);
  });
});
