/**
 * middleware.ts (project root)
 *
 * Next.js middleware that protects routes under /(app)/.
 * Unauthenticated users are redirected to /login.
 *
 * Public routes (no auth required):
 *   - /login, /register
 *   - /api/auth/* (NextAuth endpoints)
 *   - Static files, _next assets
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/auth/auth';

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Public routes that don't require authentication
  const publicPaths = ['/login', '/register', '/api/auth'];
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));

  if (isPublic) {
    // If user IS authenticated and tries to access /login or /register,
    // redirect them to the app root
    if (req.auth && (pathname === '/login' || pathname === '/register')) {
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  }

  // For all other routes, require authentication
  if (!req.auth) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}) as unknown as (req: NextRequest) => Promise<NextResponse>;

export const config = {
  // Run middleware on all routes except static files and Next.js internals
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|uploads/).*)',
  ],
};
