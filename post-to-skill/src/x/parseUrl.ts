import type { XParseResult } from './types';

const POST_URL = /^https?:\/\/(?:www\.)?(?:x|twitter|mobile\.twitter)\.com\/[^/]+\/status\/(\d+)/i;
const PROFILE_URL = /^https?:\/\/(?:www\.)?(?:x|twitter|mobile\.twitter)\.com\/(@?[A-Za-z0-9_]{1,15})\/?(?:[?#].*)?$/i;
const BARE_HANDLE = /^@?([A-Za-z0-9_]{1,15})$/;
const NUMERIC_ID = /^\d{5,25}$/;

export function parseInput(raw: string): XParseResult {
  const input = raw.trim();
  if (!input) return { kind: 'invalid', reason: 'Empty input' };

  const postMatch = input.match(POST_URL);
  if (postMatch) return { kind: 'post', id: postMatch[1] };

  if (NUMERIC_ID.test(input)) return { kind: 'post', id: input };

  const profileMatch = input.match(PROFILE_URL);
  if (profileMatch) {
    const reserved = new Set(['home', 'explore', 'search', 'i', 'compose', 'messages', 'notifications']);
    const handle = profileMatch[1].replace(/^@/, '');
    if (!reserved.has(handle.toLowerCase())) return { kind: 'handle', handle };
  }

  const handleMatch = input.match(BARE_HANDLE);
  if (handleMatch) return { kind: 'handle', handle: handleMatch[1] };

  return { kind: 'invalid', reason: 'Not an X post URL or handle' };
}
