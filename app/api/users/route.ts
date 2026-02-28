/**
 * app/api/users/route.ts
 *
 * GET /api/users — Search for users within a workspace.
 * Used for @mention autocomplete and member search.
 *
 * Query params:
 *   q           — Search query (required, min 1 char)
 *   workspaceId — Workspace to search within (required)
 *
 * Response: ApiSuccess<MemberWithUser[]>
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth/auth';
import { ok, err } from '@/shared/types/api';
import { searchMembers } from '@/members/queries';

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        err('UNAUTHORIZED', 'Authentication required'),
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json(
        err('VALIDATION_ERROR', 'workspaceId query param is required'),
        { status: 400 }
      );
    }

    if (!query.trim()) {
      return NextResponse.json(ok([]));
    }

    const members = await searchMembers(workspaceId, query);

    return NextResponse.json(ok(members));
  } catch (error) {
    console.error('[GET /api/users] Error:', error);
    return NextResponse.json(
      err('INTERNAL_ERROR', 'Failed to search users'),
      { status: 500 }
    );
  }
}
