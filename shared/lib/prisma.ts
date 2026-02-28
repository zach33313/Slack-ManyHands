/**
 * shared/lib/prisma.ts
 *
 * Prisma client singleton.
 *
 * In development, Next.js hot-reload creates new module instances which would
 * exhaust the connection pool. The global singleton pattern prevents this.
 *
 * Usage:
 *   import { prisma } from '@/shared/lib/prisma'
 *   const user = await prisma.user.findUnique({ where: { id } })
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
