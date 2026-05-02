import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, handler, requireSession } from '@/lib/api-helpers';
import { canAccessResource } from '@/lib/permissions';
import { getStripe, stripeConfigured } from '@/lib/stripe';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export const POST = handler(async (_req: Request, ctx: { params: { id: string } }) => {
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: 'Stripe is not configured on this server.' },
      { status: 503 }
    );
  }

  const actor = await requireSession();
  const invoice = await prisma.invoice.findUnique({
    where: { id: ctx.params.id },
    include: { items: true },
  });
  if (!invoice || !canAccessResource(actor, invoice.ownerId)) {
    throw new ApiError(404, 'Not found');
  }
  if (invoice.status === 'PAID') throw new ApiError(409, 'Invoice already paid');
  if (invoice.items.length === 0) throw new ApiError(400, 'Invoice has no line items');

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: invoice.email,
    line_items: invoice.items.map((it) => ({
      quantity: it.quantity,
      price_data: {
        currency: invoice.currency,
        unit_amount: it.unitCents,
        product_data: {
          name: `${invoice.number} — ${it.description}`.slice(0, 250),
        },
      },
    })),
    success_url: `${env.NEXT_PUBLIC_APP_URL}/invoices/${invoice.id}?paid=1`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/invoices/${invoice.id}?cancelled=1`,
    metadata: { invoiceId: invoice.id, ownerId: invoice.ownerId },
  });

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: 'SENT',
      stripeSessionId: session.id,
      stripeCheckoutUrl: session.url ?? null,
    },
  });

  logger.info({ invoiceId: invoice.id, sessionId: session.id }, 'invoice.checkout.created');
  return NextResponse.json({ url: updated.stripeCheckoutUrl });
});
