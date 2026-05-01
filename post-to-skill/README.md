# post-to-skill

Mobile app (iOS + Android, Expo / React Native) that takes an X (Twitter) post or
account and uses Claude's training knowledge to label its factual claims **true**,
**false**, or **uncertain**.

## What it does and does not do

- ✅ Fetches a single post (URL or numeric id) via the public `cdn.syndication.twimg.com`
  endpoint — no X API key required.
- ✅ Fetches up to ~20 most recent posts from a public account via the `syndication.twitter.com`
  embed widget.
- ✅ Sends post text to Claude (default `claude-opus-4-7`); two-call pipeline extracts
  discrete claims, then assigns a verdict + reasoning to each.
- ❌ No web search, no external fact-check APIs, no live sources. Verdicts come from the
  model's training data only — the UI says so on every screen.
- ❌ No backend. The user supplies their own Anthropic API key, stored on-device in
  `expo-secure-store` (Keychain on iOS, Keystore on Android).
- ❌ No interactions with the user's X account. Read-only, public posts only.

## Prerequisites

- Node 22+
- Expo CLI (`npx expo`)
- An Anthropic API key (https://console.anthropic.com/settings/keys)
- For device testing: Expo Go on a real iPhone or Android device

## Run

```sh
pnpm install            # or: npm install / bun install
npx expo start          # opens dev tools; scan QR with Expo Go on your phone
```

Open Settings inside the app, paste your Anthropic API key, then go back and check a post.

## Test

```sh
pnpm test               # vitest, runs unit tests under src/
pnpm typecheck          # tsc --noEmit
```

Unit tests cover URL parsing, syndication URL/token construction, timeline HTML parsing,
and Zod schema validation. Anthropic and X are mocked.

## Smoke test on a real device

1. Settings → paste API key → confirm it persists across app restart.
2. Paste `https://x.com/nasa/status/<id>` for a known historical post → expect `true`.
3. Paste a post with a clear factual error → expect `false`.
4. Paste a post about events past the model cutoff → expect `uncertain`.
5. Enter `@nasa` → expect ~20 posts with per-row verdict badges.
6. Force-quit and relaunch → API key still saved, last screen reachable.

## Notes & caveats

- The X embed widget format is brittle. If `syndication.twitter.com` changes its `__NEXT_DATA__`
  shape, feeds will fail with a clear "X may have changed its embed format" message rather
  than crashing. Single-post fetches via `cdn.syndication.twimg.com/tweet-result` are more
  stable.
- Verdicts are advisory. Claude's training data is incomplete and time-bounded; it can be
  confidently wrong. The on-screen disclaimer is intentional — keep it.
- The `cache_control: "ephemeral"` markers on the system prompts have no effect for short
  prompts (Opus 4.7 minimum cacheable prefix is 4096 tokens). They are kept architecturally
  correct for the future; today they are no-ops.
