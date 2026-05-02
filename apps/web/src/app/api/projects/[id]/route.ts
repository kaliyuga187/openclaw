import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, handler, parseBody, requireSession } from '@/lib/api-helpers';
import { updateProjectSchema } from '@/schemas/project';
import { canAccessResource } from '@/lib/permissions';

async function loadOwned(id: string, actorId: string, role: 'USER' | 'ADMIN') {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || !canAccessResource({ id: actorId, role }, project.ownerId)) {
    // Return 404 (not 403) on IDOR — don't leak existence.
    throw new ApiError(404, 'Not found');
  }
  return project;
}

export const GET = handler(async (_req: Request, ctx: { params: { id: string } }) => {
  const actor = await requireSession();
  const project = await loadOwned(ctx.params.id, actor.id, actor.role);
  const full = await prisma.project.findUnique({
    where: { id: project.id },
    include: {
      tasks: { orderBy: { updatedAt: 'desc' } },
      invoices: { orderBy: { createdAt: 'desc' } },
    },
  });
  return NextResponse.json({ project: full });
});

export const PATCH = handler(async (req: Request, ctx: { params: { id: string } }) => {
  const actor = await requireSession();
  await loadOwned(ctx.params.id, actor.id, actor.role);
  const input = await parseBody(req, updateProjectSchema);
  const project = await prisma.project.update({ where: { id: ctx.params.id }, data: input });
  return NextResponse.json({ project });
});

export const DELETE = handler(async (_req: Request, ctx: { params: { id: string } }) => {
  const actor = await requireSession();
  await loadOwned(ctx.params.id, actor.id, actor.role);
  await prisma.project.delete({ where: { id: ctx.params.id } });
  return NextResponse.json({ ok: true });
});
