import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { features } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET() {
  let dbOk = false;
  let dbError: string | undefined;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (e) {
    dbError = e instanceof Error ? e.message : 'unknown';
  }
  return NextResponse.json(
    {
      ok: dbOk,
      uptime: process.uptime(),
      db: { ok: dbOk, error: dbError },
      features,
      time: new Date().toISOString(),
    },
    { status: dbOk ? 200 : 503 }
  );
}
