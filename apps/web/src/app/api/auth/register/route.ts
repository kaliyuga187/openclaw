import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { signUpSchema } from '@/schemas/auth';
import { applyRateLimit, handler, parseBody } from '@/lib/api-helpers';
import { logger } from '@/lib/logger';

export const POST = handler(async (req: Request) => {
  applyRateLimit(req, 'register', 5);
  const input = await parseBody(req, signUpSchema);

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    // Avoid leaking that the email is taken via timing or message variance.
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: { email: input.email, name: input.name, passwordHash, role: 'USER' },
    select: { id: true, email: true },
  });
  logger.info({ userId: user.id }, 'auth.register');
  return NextResponse.json({ ok: true }, { status: 201 });
});
