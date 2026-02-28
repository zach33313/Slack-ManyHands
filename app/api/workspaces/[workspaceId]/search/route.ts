/**
 * app/api/workspaces/[workspaceId]/search/route.ts
 *
 * GET /api/workspaces/:workspaceId/search?q=...
 *
 * Full-text search across messages in a workspace.
 * Validates the requesting user is a workspace member.
 * Parses the query string for filter prefixes (in:#, from:@, has:, before:, after:).
 *
 * Query params:
 *   q      — search query (required, min 1 char)
 *   cursor — message ID for cursor-based pagination
 *   limit  — results per page (default 20, max 50)
 *
 * Response: ApiSuccess<SearchResponse>
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/shared/lib/prisma';
import { ok, err } from '@/shared/types/api';
import { SEARCH_RESULTS_LIMIT, MAX_SEARCH_RESULTS } from '@/shared/lib/constants';
import { parseSearchQuery, searchMessages } from '@/search/queries';

interface RouteContext {
  params: { workspaceId: string };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { workspaceId } = context.params;

  // Authenticate the user
  let userId: string | null = null;

  try {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
    });
    if (token?.sub) {
      userId = token.sub;
    }
  } catch {
    // Auth not configured yet — handled below
  }

  // Development fallback: use the first workspace member
  if (!userId && process.env.NODE_ENV === 'development') {
    const firstMember = await prisma.workspaceMember.findFirst({
      where: { workspaceId },
      select: { userId: true },
    });
    userId = firstMember?.userId ?? null;
  }

  if (!userId) {
    return NextResponse.json(
      err('UNAUTHORIZED', 'Authentication required'),
      { status: 401 }
    );
  }

  // Verify user is a workspace member
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId, userId },
    },
  });

  if (!membership) {
    return NextResponse.json(
      err('FORBIDDEN', 'Not a member of this workspace'),
      { status: 403 }
    );
  }

  // Parse query params
  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get('q');
  const cursor = searchParams.get('cursor') ?? undefined;
  const limitParam = searchParams.get('limit');

  if (!rawQuery || !rawQuery.trim()) {
    return NextResponse.json(
      err('VALIDATION_ERROR', 'Search query (q) is required'),
      { status: 400 }
    );
  }

  const limit = Math.min(
    Math.max(1, parseInt(limitParam ?? String(SEARCH_RESULTS_LIMIT), 10) || SEARCH_RESULTS_LIMIT),
    MAX_SEARCH_RESULTS
  );

  // Parse filters from query string
  const filters = parseSearchQuery(rawQuery);

  // Execute search
  const searchResponse = await searchMessages(
    workspaceId,
    userId,
    filters,
    cursor,
    limit
  );

  return NextResponse.json(ok(searchResponse));
}
