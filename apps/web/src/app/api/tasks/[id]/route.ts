import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, handler, parseBody, requireSession } from '@/lib/api-helpers';
import { updateTaskSchema } from '@/schemas/task';
import { canAccessResource } from '@/lib/permissions';

async function loadOwned(id: string, actorId: string, role: 'USER' | 'ADMIN') {
  const task = await prisma.task.findUnique({
    where: { id },
    include: { project: { select: { ownerId: true } } },
  });
  if (!task || !canAccessResource({ id: actorId, role }, task.project.ownerId)) {
    throw new ApiError(404, 'Not found');
  }
  return task;
}

export const PATCH = handler(async (req: Request, ctx: { params: { id: string } }) => {
  const actor = await requireSession();
  await loadOwned(ctx.params.id, actor.id, actor.role);
  const input = await parseBody(req, updateTaskSchema);
  // Don't allow re-parenting tasks across projects via this endpoint.
  if ('projectId' in input) delete (input as { projectId?: string }).projectId;
  const task = await prisma.task.update({ where: { id: ctx.params.id }, data: input });
  return NextResponse.json({ task });
});

export const DELETE = handler(async (_req: Request, ctx: { params: { id: string } }) => {
  const actor = await requireSession();
  await loadOwned(ctx.params.id, actor.id, actor.role);
  await prisma.task.delete({ where: { id: ctx.params.id } });
  return NextResponse.json({ ok: true });
});
