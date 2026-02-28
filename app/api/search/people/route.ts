/**
 * app/api/search/people/route.ts
 *
 * GET /api/search/people — Search workspace members by name or email.
 *
 * Query params:
 *   q           — Search term (optional; empty returns no results)
 *   workspaceId — Workspace to search within (required)
 *
 * Response: ApiSuccess<PersonResult[]>
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/auth/middleware';
import { ok, err } from '@/shared/types/api';
import { getMemberRole } from '@/workspaces/queries';
import { prisma } from '@/shared/lib/prisma';

interface PersonResult {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  title: string | null;
  statusText: string | null;
  statusEmoji: string | null;
}

/**
 * GET /api/search/people?workspaceId=<id>&q=<term>
 * Returns up to 20 workspace members whose name or email matches the query.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const query = searchParams.get('q') ?? '';

    if (!workspaceId) {
      return NextResponse.json(
        err('VALIDATION_ERROR', 'workspaceId query parameter is required'),
        { status: 400 }
      );
    }

    // Verify the authenticated user is a member of this workspace
    const role = await getMemberRole(workspaceId, session.user.id);
    if (!role) {
      return NextResponse.json(
        err('FORBIDDEN', 'You are not a member of this workspace'),
        { status: 403 }
      );
    }

    // Empty query returns empty results
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return NextResponse.json(ok([] as PersonResult[]));
    }

    const members = await prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        user: {
          OR: [
            { name: { contains: trimmedQuery } },
            { email: { contains: trimmedQuery } },
          ],
        },
      },
      select: {
        role: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            title: true,
            statusText: true,
            statusEmoji: true,
          },
        },
      },
      take: 20,
      orderBy: { user: { name: 'asc' } },
    });

    const results: PersonResult[] = members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
      role: m.role,
      title: m.user.title,
      statusText: m.user.statusText,
      statusEmoji: m.user.statusEmoji,
    }));

    return NextResponse.json(ok(results));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        err('UNAUTHORIZED', error.message),
        { status: error.status }
      );
    }
    console.error('[GET /api/search/people] Error:', error);
    return NextResponse.json(
      err('INTERNAL_ERROR', 'Failed to search people'),
      { status: 500 }
    );
  }
}
