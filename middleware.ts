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

const IS_DEMO = process.env.DEMO_MODE === 'true';

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
    // In demo mode, send unauthenticated users to the name picker (/register)
    const authPage = IS_DEMO ? '/register' : '/login';
    const authUrl = new URL(authPage, req.url);
    authUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(authUrl);
  }

  return NextResponse.next();
}) as unknown as (req: NextRequest) => Promise<NextResponse>;

export const config = {
  // Run middleware on all routes except static files and Next.js internals
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|uploads/).*)',
  ],
};
