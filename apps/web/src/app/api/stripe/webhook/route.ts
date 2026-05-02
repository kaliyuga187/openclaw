import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { getStripe, stripeWebhookConfigured } from '@/lib/stripe';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { applyRateLimit, handler } from '@/lib/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handler(async (req: Request) => {
  applyRateLimit(req, 'stripe-webhook', 120);
  if (!stripeWebhookConfigured()) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : 'unknown' }, 'stripe.webhook.bad_signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const invoiceId = session.metadata?.invoiceId;
      if (!invoiceId) break;
      // Idempotent update — only change if not already paid.
      const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
      if (inv && inv.status !== 'PAID') {
        await prisma.invoice.update({
          where: { id: invoiceId },
          data: {
            status: 'PAID',
            paidAt: new Date(),
            stripePaymentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          },
        });
        await prisma.activityEvent.create({
          data: {
            userId: inv.ownerId,
            kind: 'paid',
            entity: 'invoice',
            entityId: inv.id,
            message: `Invoice ${inv.number} paid`,
          },
        });
        logger.info({ invoiceId }, 'invoice.paid');
      }
      break;
    }
    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      const invoiceId = session.metadata?.invoiceId;
      if (invoiceId) {
        await prisma.invoice.updateMany({
          where: { id: invoiceId, status: 'SENT' },
          data: { status: 'DRAFT', stripeCheckoutUrl: null },
        });
      }
      break;
    }
    default:
      logger.debug({ type: event.type }, 'stripe.webhook.ignored');
  }

  return NextResponse.json({ received: true });
});
