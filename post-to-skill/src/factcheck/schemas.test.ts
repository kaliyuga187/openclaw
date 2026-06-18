import { describe, expect, it } from 'vitest';
import { ClaimsSchema, VerdictsSchema } from './schemas';

describe('ClaimsSchema', () => {
  it('accepts a non-empty list of claims', () => {
    const result = ClaimsSchema.safeParse({ claims: [{ text: 'The sky is blue.' }] });
    expect(result.success).toBe(true);
  });

  it('accepts an empty list (no factual claims in the post)', () => {
    expect(ClaimsSchema.safeParse({ claims: [] }).success).toBe(true);
  });

  it('rejects empty claim text', () => {
    expect(ClaimsSchema.safeParse({ claims: [{ text: '' }] }).success).toBe(false);
  });
});

describe('VerdictsSchema', () => {
  it('accepts a well-formed verdict', () => {
    const result = VerdictsSchema.safeParse({
      verdicts: [
        { claim: 'x', label: 'true', confidence: 'high', reasoning: 'because' },
        { claim: 'y', label: 'uncertain', confidence: 'low', reasoning: 'unknown' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown label values', () => {
    const result = VerdictsSchema.safeParse({
      verdicts: [{ claim: 'x', label: 'maybe', confidence: 'high', reasoning: 'r' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown confidence values', () => {
    const result = VerdictsSchema.safeParse({
      verdicts: [{ claim: 'x', label: 'true', confidence: 'sure', reasoning: 'r' }],
    });
    expect(result.success).toBe(false);
  });
});
