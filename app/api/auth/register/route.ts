/**
 * app/api/auth/register/route.ts
 *
 * Registration API endpoint.
 *
 * POST /api/auth/register
 * Body: { name: string, email: string, password: string }
 *
 * Validates input with zod, checks email uniqueness, hashes password
 * with bcrypt (12 rounds), creates User in DB via Prisma.
 *
 * Returns:
 *   201: { user: { id, name, email } }
 *   400: { error: string, fieldErrors?: Record<string, string[]> }
 *   409: { error: string, code: 'EMAIL_EXISTS' }
 *   500: { error: string }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hashSync } from 'bcryptjs';
import { prisma } from '@/shared/lib/prisma';

const registerSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less')
    .trim(),
  email: z
    .string()
    .email('Invalid email address')
    .max(255, 'Email must be 255 characters or less')
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be 128 characters or less'),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Validate input
    const result = registerSchema.safeParse(body);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const err of result.error.errors) {
        const field = err.path[0] as string;
        if (!fieldErrors[field]) {
          fieldErrors[field] = [];
        }
        fieldErrors[field].push(err.message);
      }
      return NextResponse.json(
        { ok: false, error: 'Validation failed', code: 'VALIDATION_ERROR', fieldErrors },
        { status: 400 }
      );
    }

    const { name, email, password } = result.data;

    // Check email uniqueness
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { ok: false, error: 'An account with this email already exists', code: 'EMAIL_EXISTS' },
        { status: 409 }
      );
    }

    // Hash password with bcrypt (12 rounds)
    const hashedPassword = hashSync(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    // Auto-add new user to the first workspace and its default channels
    try {
      const defaultWorkspace = await prisma.workspace.findFirst({
        orderBy: { createdAt: 'asc' },
      });

      if (defaultWorkspace) {
        // Add as workspace member
        await prisma.workspaceMember.create({
          data: {
            workspaceId: defaultWorkspace.id,
            userId: user.id,
            role: 'MEMBER',
          },
        });

        // Add to all public channels in the workspace
        const publicChannels = await prisma.channel.findMany({
          where: {
            workspaceId: defaultWorkspace.id,
            type: 'PUBLIC',
            isArchived: false,
          },
        });

        for (const channel of publicChannels) {
          await prisma.channelMember.create({
            data: {
              channelId: channel.id,
              userId: user.id,
            },
          });
        }
      }
    } catch (autoJoinError) {
      // Don't fail registration if auto-join fails
      console.error('[register] Auto-join workspace failed:', autoJoinError);
    }

    return NextResponse.json(
      { ok: true, user },
      { status: 201 }
    );
  } catch (error) {
    console.error('[register] Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
