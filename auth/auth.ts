/**
 * auth/auth.ts
 *
 * Main auth module — exports auth(), signIn(), signOut(), handlers.
 *
 * Uses PrismaAdapter for OAuth account linking (Google etc.) while
 * keeping JWT as the session strategy (required for Socket.IO cookie sharing).
 *
 * Usage:
 *   import { auth, signIn, signOut } from '@/auth/auth'
 *   const session = await auth()
 *   await signIn('credentials', { email, password })
 */

import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/shared/lib/prisma';
import { authConfig } from './auth.config';
import './types'; // import module augmentations

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: process.env.AUTH_SECRET,
  ...authConfig,
});
