/**
 * auth/auth.config.ts
 *
 * NextAuth v5 provider configuration.
 *
 * Providers:
 *   - CredentialsProvider: email/password login with bcrypt validation
 *   - Google OAuth: optional, enabled when AUTH_GOOGLE_ID/SECRET are set
 *
 * Strategy: JWT (not database sessions) — cookies are shared with Socket.IO
 *
 * Callbacks:
 *   - jwt: attaches userId to the JWT token on sign-in
 *   - session: exposes userId from the JWT token to the client session
 */

import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { compareSync } from 'bcryptjs';
import { prisma } from '@/shared/lib/prisma';

export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.password) {
          return null;
        }

        const passwordMatch = compareSync(password, user.password);
        if (!passwordMatch) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
    // Google OAuth — only enabled when env vars are set
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
          }),
        ]
      : []),
  ],

  session: {
    strategy: 'jwt',
  },

  pages: {
    signIn: '/login',
    newUser: '/register',
  },

  callbacks: {
    async jwt({ token, user }) {
      // On initial sign-in, `user` is populated from the authorize() return
      if (user) {
        token.userId = user.id as string;
      }
      return token;
    },

    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId;
      }
      if (token.role) {
        session.user.role = token.role;
      }
      return session;
    },
  },
};
