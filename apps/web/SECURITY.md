# Security

This document describes how OpenClaw handles secrets, authentication,
authorization, data, and abuse prevention.

## Secrets

- All secrets are read from environment variables, validated at boot by
  `src/lib/env.ts` (Zod). The process refuses to start if a required secret
  is missing or malformed.
- `.env`, `.env.local`, `*.pem`, `*.key` are gitignored. Only `.env.example`
  is committed and contains **no real values**.
- Secrets are never logged. The Pino logger in `src/lib/logger.ts` redacts
  `password`, `token`, `authorization`, `cookie`, `stripe*`, and `secret*`
  fields from any log payload.
- Server-only secrets (`STRIPE_SECRET_KEY`, `NEXTAUTH_SECRET`, `DATABASE_URL`,
  `GOOGLE_CLIENT_SECRET`) are imported only from server modules. They are
  never re-exported through anything that could end up in a client bundle.
  The only `NEXT_PUBLIC_*` variable is the public app URL.

## Authentication

- NextAuth v4 with the Prisma adapter and JWT sessions.
- Credentials provider: passwords are hashed with **bcrypt (cost 12)** and
  stored in `User.passwordHash`. Plain passwords are never persisted or
  logged.
- Optional Google OAuth — only enabled when both `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` are set.
- Sessions are signed with `NEXTAUTH_SECRET`. Cookies are `httpOnly`,
  `sameSite=lax`, and `secure` in production.
- The role (`USER` | `ADMIN`) is added to the JWT and the session and re-checked
  server-side on every request — clients cannot self-promote.

## Authorization

- Every API route runs through `requireSession()` (or `requireAdmin()` for
  admin-only routes) in `src/lib/api-helpers.ts` before touching the DB.
- Resource ownership is enforced in `src/lib/permissions.ts` — every read,
  update, and delete checks `ownerId === session.user.id` (or admin role).
  IDOR attempts return `404` (not `403`) to avoid leaking existence.
- The `middleware.ts` guard redirects unauthenticated users away from
  `/dashboard/*` routes.

## Input validation

- Every API route parses its body / query / params through a Zod schema in
  `src/schemas/`. Unknown fields are stripped, types are coerced, and bad
  payloads return a `400` with a structured error — they never reach Prisma.
- IDs are validated as cuids; emails / URLs use Zod's built-in validators.
- Money is stored and accepted only as integer **minor units** (cents) on the
  server side; we never trust client-side totals — `amountCents` is
  recomputed from line items.

## Stripe

- Checkout sessions are created server-side; the client only receives the
  redirect URL.
- The webhook (`/api/stripe/webhook`) verifies the `Stripe-Signature` header
  with `STRIPE_WEBHOOK_SECRET` before doing anything. Unverified payloads are
  rejected with `400`.
- Webhook handlers are idempotent — replaying the same event does not
  double-mark an invoice or create duplicate state.
- The webhook route uses the raw request body (no JSON parsing before
  signature check).

## Rate limiting

- Sensitive endpoints (`/api/auth/register`, sign-in attempts, the webhook)
  are rate-limited per IP via `src/lib/rate-limit.ts` — default **20 / minute**
  configurable via `RATE_LIMIT_PER_MINUTE`.
- The current limiter is in-memory (single instance). For multi-replica
  deploys, swap the `hit()` implementation for Redis. See `SECURITY.md`'s
  "Known limitations" in the README.

## HTTP / transport

- Production responses include `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive
  `Permissions-Policy` (configured in `next.config.mjs`).
- `poweredByHeader: false` removes the `X-Powered-By` fingerprint.
- TLS is **the operator's responsibility** — terminate at the reverse proxy
  (Caddy / Cloudflare / Vercel edge) and force HTTPS.
- CORS is not opened — the app and API are same-origin. If you fork the API
  out, allow only your front-end origin in `middleware.ts`.

## Data

- Postgres credentials are environment-only.
- Cascade deletes are scoped: deleting a user cascades to their projects /
  tasks / invoices. Deleting a project cascades tasks; soft-detaches
  invoices (`SetNull`).
- Backups are the operator's responsibility. Use `pg_dump` and store off-host.
- No PII beyond name / email / OAuth profile data and self-entered client
  details. Passwords are bcrypt-hashed; no plaintext password recovery is
  possible — operators must reset via DB.

## Reporting

Report vulnerabilities privately via GitHub Security Advisories on this
repository. Please do **not** open a public issue with reproduction steps for
an unpatched flaw.

## Audit checklist (pre-prod)

- [ ] All env vars in `.env.example` set in the deploy target
- [ ] `NEXTAUTH_SECRET` is unique and 32+ bytes
- [ ] `NEXTAUTH_URL` matches the public origin (https)
- [ ] Database is reachable only from the app subnet
- [ ] Stripe webhook secret matches the dashboard
- [ ] HTTPS enforced at the proxy (HSTS recommended)
- [ ] `LOG_LEVEL=info` (not `debug`/`trace`) in production
- [ ] Default seeded admin password rotated or seeded user removed
- [ ] `RATE_LIMIT_PER_MINUTE` reviewed for your traffic
- [ ] Backups configured for Postgres
