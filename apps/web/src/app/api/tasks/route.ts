import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, handler, parseBody, requireSession } from '@/lib/api-helpers';
import { createTaskSchema } from '@/schemas/task';

export const GET = handler(async (req: Request) => {
  const actor = await requireSession();
  const url = new URL(req.url);
  const projectId = url.searchParams.get('projectId') ?? undefined;

  const where =
    actor.role === 'ADMIN'
      ? projectId
        ? { projectId }
        : {}
      : {
          project: { ownerId: actor.id },
          ...(projectId ? { projectId } : {}),
        };

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    include: { project: { select: { id: true, name: true } } },
    take: 200,
  });
  return NextResponse.json({ tasks });
});

export const POST = handler(async (req: Request) => {
  const actor = await requireSession();
  const input = await parseBody(req, createTaskSchema);

  // Verify caller owns the parent project.
  const project = await prisma.project.findUnique({ where: { id: input.projectId } });
  if (!project || (actor.role !== 'ADMIN' && project.ownerId !== actor.id)) {
    throw new ApiError(404, 'Project not found');
  }

  const task = await prisma.task.create({ data: input });
  return NextResponse.json({ task }, { status: 201 });
});
