import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, handler, parseBody, requireSession } from '@/lib/api-helpers';
import { computeTotalCents, createInvoiceSchema } from '@/schemas/invoice';
import { generateInvoiceNumber } from '@/lib/utils';

export const GET = handler(async () => {
  const actor = await requireSession();
  const invoices = await prisma.invoice.findMany({
    where: actor.role === 'ADMIN' ? {} : { ownerId: actor.id },
    orderBy: { createdAt: 'desc' },
    include: { items: true, project: { select: { id: true, name: true } } },
  });

  // Lazy overdue marking: any DRAFT/SENT past dueDate is reported as OVERDUE.
  const now = Date.now();
  for (const inv of invoices) {
    if (
      inv.status !== 'PAID' &&
      inv.status !== 'VOID' &&
      inv.dueDate &&
      inv.dueDate.getTime() < now
    ) {
      inv.status = 'OVERDUE';
    }
  }
  return NextResponse.json({ invoices });
});

export const POST = handler(async (req: Request) => {
  const actor = await requireSession();
  const input = await parseBody(req, createInvoiceSchema);

  if (input.projectId) {
    const project = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project || (actor.role !== 'ADMIN' && project.ownerId !== actor.id)) {
      throw new ApiError(404, 'Project not found');
    }
  }

  // Server-computed total — client-supplied totals are ignored.
  const amountCents = computeTotalCents(input.items);

  const invoice = await prisma.invoice.create({
    data: {
      number: generateInvoiceNumber(),
      ownerId: actor.id,
      projectId: input.projectId ?? null,
      client: input.client,
      email: input.email,
      currency: input.currency,
      notes: input.notes ?? null,
      dueDate: input.dueDate,
      amountCents,
      items: {
        create: input.items.map((it) => ({
          description: it.description,
          quantity: it.quantity,
          unitCents: it.unitCents,
        })),
      },
    },
    include: { items: true },
  });

  await prisma.activityEvent.create({
    data: {
      userId: actor.id,
      kind: 'create',
      entity: 'invoice',
      entityId: invoice.id,
      message: `Created invoice ${invoice.number} for ${invoice.client}`,
    },
  });

  return NextResponse.json({ invoice }, { status: 201 });
});
