import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const PROTECTED = ['/dashboard', '/projects', '/tasks', '/invoices', '/settings'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const protectedRoute = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!protectedRoute) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/projects/:path*', '/tasks/:path*', '/invoices/:path*', '/settings/:path*'],
};
