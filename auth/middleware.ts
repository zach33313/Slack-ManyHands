/**
 * auth/middleware.ts
 *
 * Auth helper functions for use in API routes and Server Components.
 *
 * Usage in a Server Component:
 *   const session = await getAuthSession();
 *
 * Usage in an API route:
 *   const session = await requireAuth();  // throws 401 if not authenticated
 */

import { auth } from './auth';

/**
 * Get the current auth session. Returns null if not authenticated.
 * Safe to call in Server Components, Route Handlers, and Server Actions.
 */
export async function getAuthSession() {
  return auth();
}

/**
 * Require authentication. Returns the session or throws an error
 * suitable for API routes (which should catch and return 401).
 *
 * @throws {AuthError} with status 401 if not authenticated
 */
export async function requireAuth() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new AuthError('Unauthorized');
  }

  return session;
}

/**
 * Custom error class for auth failures.
 * Includes HTTP status code for use in Route Handlers.
 */
export class AuthError extends Error {
  public readonly status: number;

  constructor(message = 'Unauthorized', status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}
