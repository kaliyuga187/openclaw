import { describe, expect, it } from 'vitest';
import { buildFeedUrl, buildPostUrl, parseTimelineHtml, tweetResultToken } from './syndication';

describe('tweetResultToken', () => {
  it('produces a deterministic alphanumeric token', () => {
    const t = tweetResultToken('1234567890123456789');
    expect(t).toMatch(/^[a-z0-9]+$/);
    expect(t).toBe(tweetResultToken('1234567890123456789'));
  });

  it('produces different tokens for different ids', () => {
    expect(tweetResultToken('1')).not.toBe(tweetResultToken('2'));
  });
});

describe('buildPostUrl', () => {
  it('targets cdn.syndication.twimg.com tweet-result endpoint', () => {
    const url = buildPostUrl('1234567890');
    expect(url).toContain('https://cdn.syndication.twimg.com/tweet-result');
    expect(url).toContain('id=1234567890');
    expect(url).toContain('token=');
    expect(url).toContain('lang=en');
  });
});

describe('buildFeedUrl', () => {
  it('targets the syndication timeline-profile widget', () => {
    expect(buildFeedUrl('nasa')).toBe(
      'https://syndication.twitter.com/srv/timeline-profile/screen-name/nasa?showHeader=false&showReplies=false',
    );
  });

  it('strips a leading @', () => {
    expect(buildFeedUrl('@nasa')).toContain('/screen-name/nasa?');
  });
});

describe('parseTimelineHtml', () => {
  it('extracts posts from a __NEXT_DATA__ entries array', () => {
    const payload = {
      props: {
        pageProps: {
          timeline: {
            entries: [
              {
                content: {
                  tweet: {
                    id_str: '111',
                    full_text: 'first',
                    user: { screen_name: 'nasa', name: 'NASA' },
                    created_at: 'Wed Apr 01 00:00:00 +0000 2026',
                  },
                },
              },
              {
                content: {
                  tweet: {
                    id_str: '222',
                    full_text: 'second',
                    user: { screen_name: 'nasa', name: 'NASA' },
                  },
                },
              },
            ],
          },
        },
      },
    };
    const html = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script></body></html>`;
    const posts = parseTimelineHtml(html, 'nasa');
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({ id: '111', text: 'first', authorHandle: 'nasa' });
    expect(posts[1].url).toBe('https://x.com/nasa/status/222');
  });

  it('throws when the embed shape is unrecognized', () => {
    expect(() => parseTimelineHtml('<html><body>nope</body></html>', 'nasa')).toThrow(
      /changed its embed format/,
    );
  });

  it('throws when entries are present but contain no tweets', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: { pageProps: { timeline: { entries: [] } } },
    })}</script>`;
    expect(() => parseTimelineHtml(html, 'nasa')).toThrow(/no posts/);
  });
});
