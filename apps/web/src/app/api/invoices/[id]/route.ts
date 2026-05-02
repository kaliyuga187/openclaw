import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, handler, parseBody, requireSession } from '@/lib/api-helpers';
import { updateInvoiceSchema, computeTotalCents } from '@/schemas/invoice';
import { canAccessResource } from '@/lib/permissions';

async function loadOwned(id: string, actorId: string, role: 'USER' | 'ADMIN') {
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv || !canAccessResource({ id: actorId, role }, inv.ownerId)) {
    throw new ApiError(404, 'Not found');
  }
  return inv;
}

export const GET = handler(async (_req: Request, ctx: { params: { id: string } }) => {
  const actor = await requireSession();
  await loadOwned(ctx.params.id, actor.id, actor.role);
  const invoice = await prisma.invoice.findUnique({
    where: { id: ctx.params.id },
    include: { items: true, project: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ invoice });
});

export const PATCH = handler(async (req: Request, ctx: { params: { id: string } }) => {
  const actor = await requireSession();
  const existing = await loadOwned(ctx.params.id, actor.id, actor.role);
  if (existing.status === 'PAID' || existing.status === 'VOID') {
    throw new ApiError(409, 'Invoice is locked and cannot be modified');
  }
  const input = await parseBody(req, updateInvoiceSchema);

  const data: Record<string, unknown> = {};
  for (const k of ['client', 'email', 'currency', 'notes', 'dueDate', 'projectId', 'status'] as const) {
    if (k in input && input[k] !== undefined) data[k] = input[k];
  }

  // If items are sent, replace them and recompute the total server-side.
  if (input.items) {
    data.amountCents = computeTotalCents(input.items);
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: existing.id } });
    data.items = {
      create: input.items.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unitCents: it.unitCents,
      })),
    };
  }

  const invoice = await prisma.invoice.update({
    where: { id: existing.id },
    data,
    include: { items: true },
  });
  return NextResponse.json({ invoice });
});

export const DELETE = handler(async (_req: Request, ctx: { params: { id: string } }) => {
  const actor = await requireSession();
  const existing = await loadOwned(ctx.params.id, actor.id, actor.role);
  if (existing.status === 'PAID') throw new ApiError(409, 'Paid invoices cannot be deleted');
  await prisma.invoice.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
});
