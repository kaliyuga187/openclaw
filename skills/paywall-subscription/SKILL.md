---
name: paywall-subscription
description: Add Stripe Checkout + subscription paywalls and gated routes to user-facing web apps. Use when monetizing a Vite/React, Next.js, or Convex app with recurring subscriptions, feature flags by plan, and webhook-driven entitlement updates.
metadata:
  {
    "openclaw":
      {
        "emoji": "💳",
        "homepage": "https://docs.stripe.com/billing/subscriptions",
        "requires":
          {
            "env":
              ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID"],
          },
      },
  }
---

# Paywall + subscription

> **Status: parked.** The current monetization mandate is fee/referral capture on every swap (see `skills/carbium-swap`). This Stripe-paywall skill is **kept as reference for a future SaaS-monetization push**, but it is not actively applied to any build right now. Do not pull this into a build unless the user explicitly re-scopes monetization to subscriptions.

Drop a Stripe-backed paywall into a user-facing web app: Checkout Session for sign-up, webhook for entitlement, gated routes for paid features. One source of truth for plan→feature mapping.

## When to use

- Adding paid tiers or recurring revenue to a user-facing product.
- Gating routes/features behind an active subscription.
- Skip for bots, CLIs, content sites, or anything without a logged-in user.

## Env

| Var                     | Purpose                                                |
| ----------------------- | ------------------------------------------------------ |
| `STRIPE_SECRET_KEY`     | Server-side Stripe API key (never expose to client).   |
| `STRIPE_WEBHOOK_SECRET` | Used to verify `stripe-signature` on webhook payloads. |
| `STRIPE_PRICE_ID`       | Default recurring price; multi-tier apps add more.     |

## Stack-specific guidance

### Vite/React + Convex

Builds: `ai-prompt-free-zone`, `aussie-homeschool-hub`, `vite-react`, `model-vault`, `aerial-estimates`.

- Client → `useAction(api.billing.createCheckoutSession)` → returns a Stripe Checkout URL → `window.location.href = url`.
- Convex HTTP route at `convex/http.ts` handles `POST /stripe/webhook`: verify signature with `stripe.webhooks.constructEvent`, then upsert into a `subscriptions` table keyed by `customer_id` + `user_id`.
- Gate UI on `useQuery(api.subscriptions.current)` — return `null` for free, `{ plan, periodEnd }` for paid.

### Next.js + Drizzle

Builds: `MetaLaunch-AI`, `Aerial-Estimate-Hub`, `ai-website-cloner-template`.

- `app/api/checkout/route.ts` (POST) creates the Checkout Session and returns `{ url }`.
- `app/api/stripe/webhook/route.ts` (POST) verifies signature then upserts `subscriptions` via Drizzle. **Must** use the raw request body (`await req.text()`) — JSON parsing breaks signature verification.
- `middleware.ts` gates `/app/*` on the entitlement check (cookie-based session → DB lookup → redirect to `/pricing` if not entitled).

### Static / content sites

Builds: `k187-bot`, content/marketing pages. Not applicable — link to a paid surface elsewhere instead of bolting on auth+billing.

## Canonical files dropped per build

```
src/lib/stripe.ts                  # `new Stripe(secret, { apiVersion: "2024-…" })`
src/lib/plans.ts                   # PLANS = { free: {...}, pro: {...} } — single source of truth
app/api/checkout/route.ts          # (Next.js) or convex/billing.ts (Convex)
app/api/stripe/webhook/route.ts    # (Next.js) or convex/http.ts route (Convex)
migrations/<n>_subscriptions.sql   # subscriptions(user_id, customer_id, status, plan, current_period_end)
```

## Plan-to-feature mapping pattern

```ts
// src/lib/plans.ts
export const PLANS = {
  free: { priceId: null, features: new Set(["search"]) },
  pro: {
    priceId: process.env.STRIPE_PRICE_ID_PRO!,
    features: new Set(["search", "export", "api"]),
  },
} as const;

export function can(plan: keyof typeof PLANS, feature: string) {
  return PLANS[plan].features.has(feature);
}
```

Every gate (route guard, UI disable, API check) calls `can()` — never inline-compare plan strings, or you'll fork the rules.

## Webhook events to handle

| Event                              | Action                                         |
| ---------------------------------- | ---------------------------------------------- |
| `checkout.session.completed`       | Insert subscription row, set `status=active`.  |
| `customer.subscription.updated`    | Update `plan`, `current_period_end`, `status`. |
| `customer.subscription.deleted`    | Set `status=canceled`; downgrade to free.      |
| `invoice.payment_failed`           | Set `status=past_due`; show banner in app.     |

## Test plan

```bash
# In one tab
stripe listen --forward-to localhost:3000/api/stripe/webhook
# In another
stripe trigger checkout.session.completed
stripe trigger customer.subscription.deleted
```

Verify the DB row appears/updates and the gated route flips access.

## Candidate builds (prioritized)

1. **`MetaLaunch-AI`** — already has `MONETIZATION_STRATEGY.md`, strongest signal.
2. **`Aerial-Estimate-Hub`** — B2B SaaS shape, natural fit for per-seat or usage tiers.
3. **`aussie-homeschool-hub`**, **`ai-prompt-free-zone`** — consumer SaaS shape.
4. **Skip:** `Polyback`, `Polycrack`, `barter-hunter`, `MoneyPrinterV2`, `k187-bot`, `Ai-vault`, `bubble-maps`, `Apex-xepa` — bots/CLIs/content, no user accounts to paywall.

## Guardrails

- Never trust client-side plan claims. Entitlement checks always hit the DB on the server.
- Webhook handlers must be idempotent — Stripe retries. Key upserts on `(customer_id, subscription_id)`.
- Use Stripe **test mode** keys until end-to-end works locally; only swap to live keys after webhook verification passes against `stripe trigger`.
- Store `customer_id` against your user row at first checkout — never re-create a customer for an existing user, or you'll fragment their billing history.
