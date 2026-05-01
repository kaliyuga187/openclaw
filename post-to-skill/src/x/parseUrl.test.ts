import { describe, expect, it } from 'vitest';
import { parseInput } from './parseUrl';

describe('parseInput', () => {
  it('extracts post id from x.com URL', () => {
    expect(parseInput('https://x.com/nasa/status/1234567890')).toEqual({
      kind: 'post',
      id: '1234567890',
    });
  });

  it('extracts post id from twitter.com URL', () => {
    expect(parseInput('https://twitter.com/nasa/status/1234567890')).toEqual({
      kind: 'post',
      id: '1234567890',
    });
  });

  it('extracts post id from mobile.twitter.com URL', () => {
    expect(parseInput('https://mobile.twitter.com/nasa/status/1234567890')).toEqual({
      kind: 'post',
      id: '1234567890',
    });
  });

  it('handles trailing path/query in post URL', () => {
    expect(parseInput('https://x.com/nasa/status/1234567890?s=20')).toEqual({
      kind: 'post',
      id: '1234567890',
    });
  });

  it('treats a bare numeric id as a post', () => {
    expect(parseInput('1234567890123456789')).toEqual({
      kind: 'post',
      id: '1234567890123456789',
    });
  });

  it('extracts handle from profile URL', () => {
    expect(parseInput('https://x.com/nasa')).toEqual({ kind: 'handle', handle: 'nasa' });
  });

  it('extracts handle from bare @-prefixed string', () => {
    expect(parseInput('@nasa')).toEqual({ kind: 'handle', handle: 'nasa' });
  });

  it('extracts handle from bare string', () => {
    expect(parseInput('nasa')).toEqual({ kind: 'handle', handle: 'nasa' });
  });

  it('rejects reserved profile paths', () => {
    expect(parseInput('https://x.com/home').kind).toBe('invalid');
    expect(parseInput('https://x.com/explore').kind).toBe('invalid');
  });

  it('rejects empty input', () => {
    expect(parseInput('').kind).toBe('invalid');
    expect(parseInput('   ').kind).toBe('invalid');
  });

  it('rejects invalid handle characters', () => {
    expect(parseInput('not a handle').kind).toBe('invalid');
  });

  it('rejects handles longer than 15 chars', () => {
    expect(parseInput('a'.repeat(16)).kind).toBe('invalid');
  });
});
