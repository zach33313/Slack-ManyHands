/**
 * auth/types.ts
 *
 * Module augmentations for NextAuth v5 types.
 * Adds userId and role to the Session and JWT token interfaces
 * so they are available throughout the app without casting.
 */

import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role?: string;
    } & DefaultSession['user'];
  }

  interface User {
    role?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string;
    role?: string;
  }
}
