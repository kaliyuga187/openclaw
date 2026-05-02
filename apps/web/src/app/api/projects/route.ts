import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handler, parseBody, requireSession } from '@/lib/api-helpers';
import { createProjectSchema } from '@/schemas/project';

export const GET = handler(async () => {
  const actor = await requireSession();
  const projects = await prisma.project.findMany({
    where: actor.role === 'ADMIN' ? {} : { ownerId: actor.id },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { tasks: true, invoices: true } } },
  });
  return NextResponse.json({ projects });
});

export const POST = handler(async (req: Request) => {
  const actor = await requireSession();
  const input = await parseBody(req, createProjectSchema);
  const project = await prisma.project.create({
    data: { ...input, ownerId: actor.id },
  });
  await prisma.activityEvent.create({
    data: {
      userId: actor.id,
      kind: 'create',
      entity: 'project',
      entityId: project.id,
      message: `Created project “${project.name}”`,
    },
  });
  return NextResponse.json({ project }, { status: 201 });
});
