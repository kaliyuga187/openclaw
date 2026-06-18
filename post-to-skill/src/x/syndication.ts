import type { XPost } from './types';

export class SyndicationError extends Error {
  constructor(message: string, public readonly code: 'not_found' | 'unavailable' | 'parse_failed' | 'network') {
    super(message);
    this.name = 'SyndicationError';
  }
}

export function tweetResultToken(id: string): string {
  // Documented public formula used by twitter-frame embeds:
  // ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')
  const n = Number(id);
  if (!Number.isFinite(n)) throw new SyndicationError('Invalid tweet id', 'parse_failed');
  return ((n / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

export function buildPostUrl(id: string): string {
  const token = tweetResultToken(id);
  const params = new URLSearchParams({
    id,
    lang: 'en',
    token,
  });
  return `https://cdn.syndication.twimg.com/tweet-result?${params.toString()}`;
}

export function buildFeedUrl(handle: string): string {
  const clean = handle.replace(/^@/, '');
  return `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(clean)}?showHeader=false&showReplies=false`;
}

type FetchLike = typeof fetch;

export async function fetchPost(id: string, fetchImpl: FetchLike = fetch): Promise<XPost> {
  let res: Response;
  try {
    res = await fetchImpl(buildPostUrl(id), { headers: { Accept: 'application/json' } });
  } catch {
    throw new SyndicationError('Network error fetching post', 'network');
  }
  if (res.status === 404) throw new SyndicationError('Post not found or private', 'not_found');
  if (!res.ok) throw new SyndicationError(`Post fetch failed (${res.status})`, 'unavailable');

  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new SyndicationError('Could not parse post response', 'parse_failed');
  }

  const text: string | undefined = json?.text;
  const authorName: string | undefined = json?.user?.name;
  const authorHandle: string | undefined = json?.user?.screen_name;
  const createdAt: string | undefined = json?.created_at;

  if (!text || !authorHandle) throw new SyndicationError('Post payload missing fields', 'parse_failed');

  return {
    id,
    text,
    authorName: authorName ?? authorHandle,
    authorHandle,
    createdAt: createdAt ?? '',
    url: `https://x.com/${authorHandle}/status/${id}`,
  };
}

export async function fetchFeed(handle: string, fetchImpl: FetchLike = fetch): Promise<XPost[]> {
  let res: Response;
  try {
    res = await fetchImpl(buildFeedUrl(handle), {
      headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0' },
    });
  } catch {
    throw new SyndicationError('Network error fetching feed', 'network');
  }
  if (res.status === 404) throw new SyndicationError('Account not found', 'not_found');
  if (!res.ok) throw new SyndicationError(`Feed fetch failed (${res.status})`, 'unavailable');

  const html = await res.text();
  return parseTimelineHtml(html, handle);
}

export function parseTimelineHtml(html: string, handle: string): XPost[] {
  // Embed widget injects `<script id="__NEXT_DATA__" type="application/json">{...}</script>`.
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new SyndicationError(
      'Could not parse feed: X may have changed its embed format',
      'parse_failed',
    );
  }
  let data: any;
  try {
    data = JSON.parse(match[1]);
  } catch {
    throw new SyndicationError('Feed payload is not valid JSON', 'parse_failed');
  }
  const entries: any[] =
    data?.props?.pageProps?.timeline?.entries ??
    data?.props?.pageProps?.contextProvider?.timeline?.entries ??
    [];

  const posts: XPost[] = [];
  for (const entry of entries) {
    const tweet = entry?.content?.tweet ?? entry?.tweet ?? entry?.content?.itemContent?.tweet;
    if (!tweet) continue;
    const id = String(tweet.id_str ?? tweet.id ?? '');
    const text: string | undefined = tweet.full_text ?? tweet.text;
    const authorHandle: string | undefined = tweet.user?.screen_name ?? handle;
    const authorName: string | undefined = tweet.user?.name ?? authorHandle;
    const createdAt: string = tweet.created_at ?? '';
    if (!id || !text || !authorHandle) continue;
    posts.push({
      id,
      text,
      authorName: authorName ?? authorHandle,
      authorHandle,
      createdAt,
      url: `https://x.com/${authorHandle}/status/${id}`,
    });
    if (posts.length >= 20) break;
  }
  if (posts.length === 0) {
    throw new SyndicationError('Feed parsed but contained no posts', 'parse_failed');
  }
  return posts;
}
