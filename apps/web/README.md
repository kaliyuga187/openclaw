# OpenClaw — Web App

Production-ready project, task, and invoicing dashboard for freelancers and small
agencies. Track projects, manage tasks, and bill clients with Stripe Checkout.

Lives in `apps/web/`. Independent of the parent repo's tooling.

## Stack

- **Framework**: Next.js 14 (App Router) + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui-style components + dark mode
- **Auth**: NextAuth v4 (credentials + Google OAuth) with Prisma adapter
- **Database**: PostgreSQL via Prisma
- **Payments**: Stripe Checkout + signed webhooks
- **Validation**: Zod on every API route
- **Logging**: Pino structured logs
- **Tests**: Vitest
- **Deploy**: Vercel-ready and Docker/VPS-ready (multi-stage Dockerfile)

## Quick start (local)

```bash
cd apps/web
cp .env.example .env.local
# edit .env.local — set NEXTAUTH_SECRET (`openssl rand -base64 32`),
# DATABASE_URL, and (optional) STRIPE_SECRET_KEY / GOOGLE_CLIENT_ID

# start a local Postgres (one of):
docker compose up -d db          # uses docker-compose.yml
# OR point DATABASE_URL at any existing Postgres

npm install
npm run db:migrate:dev           # creates schema
npm run db:seed                  # creates admin@example.com / changeme123!
npm run dev                      # http://localhost:3000
```

First-time login: `admin@example.com` / `changeme123!` — **change this immediately**.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next dev server |
| `npm run build` | Prisma generate + production build |
| `npm start` | Run built app |
| `npm run typecheck` | TypeScript check, no emit |
| `npm run lint` | Next.js lint |
| `npm test` | Vitest one-shot |
| `npm run db:migrate:dev` | Create + apply a new dev migration |
| `npm run db:migrate` | Apply pending migrations (production) |
| `npm run db:seed` | Seed sample admin + project + invoice |
| `npm run db:studio` | Prisma Studio GUI |

## Environment variables

See [`.env.example`](./.env.example). Summary:

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | yes | `development` \| `production` \| `test` |
| `NEXT_PUBLIC_APP_URL` | yes | e.g. `https://app.example.com` |
| `DATABASE_URL` | yes | Postgres connection string |
| `NEXTAUTH_SECRET` | yes | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | yes | Same origin as the app |
| `GOOGLE_CLIENT_ID` | optional | Enables Google sign-in if both are set |
| `GOOGLE_CLIENT_SECRET` | optional | |
| `STRIPE_SECRET_KEY` | optional* | Required to create real Checkout sessions |
| `STRIPE_WEBHOOK_SECRET` | optional* | Required for the webhook to verify signatures |
| `STRIPE_DEFAULT_CURRENCY` | optional | Defaults to `usd` |
| `LOG_LEVEL` | optional | `trace`..`fatal`, default `info` |
| `RATE_LIMIT_PER_MINUTE` | optional | Per-IP, default 20 |

\* The app boots without Stripe configured — invoices are creatable but the
  checkout endpoint returns 503 until you add keys. The dashboard shows the
  status as **amber** when unconfigured.

## Deployment

### Vercel

1. Push this repo and import `apps/web` as the project root in Vercel.
2. Set every variable from `.env.example` in **Project → Settings → Env Vars**.
3. Set the Build Command to `npm run build` and the Install Command to `npm ci`.
4. Add a Postgres database (Vercel Postgres, Neon, Supabase, or RDS).
5. After first deploy, run `npx prisma migrate deploy` once against the prod DB
   (Vercel CLI: `vercel env pull .env.production && DATABASE_URL=... npx prisma migrate deploy`).
6. Configure the Stripe webhook to point at
   `https://<your-domain>/api/stripe/webhook` and copy the signing secret into
   `STRIPE_WEBHOOK_SECRET`.

### Docker / Vultr / any VPS

```bash
cd apps/web
cp .env.example .env       # populate it
docker compose up -d --build
```

The compose file launches Postgres + the app, runs `prisma migrate deploy` on
start, and exposes the app on port 3000. Put a TLS-terminating reverse proxy
(Caddy, nginx, Traefik) in front of it.

For a single-container deploy against an external Postgres:

```bash
docker build -t openclaw-web .
docker run -d --name gsd \
  -p 3000:3000 --env-file .env \
  openclaw-web sh -c "npx prisma migrate deploy && node server.js"
```

### Stripe webhook (local)

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
# copy the printed `whsec_...` into STRIPE_WEBHOOK_SECRET
```

## Testing checklist

Unit tests (`npm test`) cover env validation, Zod schemas, and permission
checks. The full dry-run smoke test:

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] `npm run dev` starts; `/` renders the landing page
- [ ] `/sign-up` creates a user and redirects to `/dashboard`
- [ ] `/sign-in` rejects bad passwords and accepts good ones
- [ ] `/dashboard` shows stat cards, status panel, activity feed
- [ ] Create / edit / delete a Project — list updates
- [ ] Create / edit / delete a Task — status badges render correctly
- [ ] Create an Invoice with line items — total is computed server-side
- [ ] If Stripe configured: "Send checkout link" returns a Stripe URL
- [ ] `stripe trigger checkout.session.completed` flips the invoice to PAID
- [ ] Logging out clears the session cookie
- [ ] `/api/health` returns `{ ok: true }` with DB status
- [ ] Rate limit: 21 rapid `/api/auth/register` calls return 429

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `PrismaClientInitializationError` on boot | `DATABASE_URL` missing/wrong, or Postgres not reachable |
| `Invalid \`prisma.user.findUnique\`` after schema change | Run `npm run db:migrate:dev` |
| Sign-in fails silently | `NEXTAUTH_SECRET` or `NEXTAUTH_URL` not set |
| Google button missing | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` blank — expected |
| Checkout returns 503 | `STRIPE_SECRET_KEY` not set |
| Webhook returns 400 "signature" | `STRIPE_WEBHOOK_SECRET` mismatch with `stripe listen` |
| Docker build fails on `prisma generate` | Re-run with `--no-cache`; ensure `prisma/` is copied |
| 429 on legitimate use | Raise `RATE_LIMIT_PER_MINUTE` |

## Known limitations

- Rate limiter is **in-memory** — for multi-instance deploys swap for Redis
  (`lib/rate-limit.ts` has a single replacement point).
- No email sending — invoice "send" generates the Stripe Checkout URL only;
  wire up Resend/SendGrid in `lib/email.ts` to deliver.
- File uploads / attachments not implemented.
- No background workers — overdue-invoice marking happens on read.
- Single-tenant per user account; no team/workspace model yet.

## Next best improvements

1. Email delivery (Resend) for invoice send + password reset.
2. Redis-backed rate limiting + session store.
3. Workspaces / team membership with row-level permissions.
4. PDF invoice rendering (react-pdf) attached to Stripe Checkout.
5. Audit log UI surfaced from `ActivityEvent`.
6. E2E tests with Playwright (currently unit tests only).

See [`SECURITY.md`](./SECURITY.md) for the security posture.
