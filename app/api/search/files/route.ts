/**
 * app/api/search/files/route.ts
 *
 * GET /api/search/files — Search uploaded files within a workspace by filename.
 *
 * Query params:
 *   q           — Search term for filename (required)
 *   workspaceId — Workspace to search within (required)
 *   type        — Optional MIME type filter: 'image' | 'document' | 'audio' | 'video'
 *
 * Response: ApiSuccess<FileResult[]>
 *
 * Only files attached to non-deleted messages in channels belonging to
 * the specified workspace are returned. Results are scoped to workspaces
 * the authenticated user is a member of.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/auth/middleware';
import { ok, err } from '@/shared/types/api';
import { getMemberRole } from '@/workspaces/queries';
import { prisma } from '@/shared/lib/prisma';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface UserSummary {
  id: string;
  name: string | null;
  image: string | null;
}

interface FileResult {
  id: string;
  name: string;
  url: string;
  size: number;
  mimeType: string;
  uploadedBy: UserSummary;
  channelName: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Valid type filter values
// ---------------------------------------------------------------------------

const VALID_TYPES = ['image', 'document', 'audio', 'video'] as const;
type FileTypeFilter = (typeof VALID_TYPES)[number];

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * GET /api/search/files?workspaceId=<id>&q=<term>&type=<image|document|audio|video>
 *
 * Returns up to 20 files whose names contain the query string,
 * ordered by most recently uploaded.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const query = searchParams.get('q') ?? '';
    const typeParam = searchParams.get('type');

    // Validate required workspaceId
    if (!workspaceId) {
      return NextResponse.json(
        err('VALIDATION_ERROR', 'workspaceId query parameter is required'),
        { status: 400 }
      );
    }

    // Validate optional type filter
    if (typeParam && !(VALID_TYPES as readonly string[]).includes(typeParam)) {
      return NextResponse.json(
        err(
          'VALIDATION_ERROR',
          `type must be one of: ${VALID_TYPES.join(', ')}`
        ),
        { status: 400 }
      );
    }

    const type = typeParam as FileTypeFilter | null;

    // Verify the authenticated user is a member of this workspace
    const role = await getMemberRole(workspaceId, session.user.id);
    if (!role) {
      return NextResponse.json(
        err('FORBIDDEN', 'You are not a member of this workspace'),
        { status: 403 }
      );
    }

    // Empty query returns empty results (consistent with /api/search/people)
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return NextResponse.json(ok([] as FileResult[]));
    }

    // Build mimeType filter based on the type param.
    // Documents cover application/* and text/* MIME types.
    // For all other types, filter by a single prefix.
    const mimeTypeWhere =
      type === 'document'
        ? {
            OR: [
              { mimeType: { startsWith: 'application/' } },
              { mimeType: { startsWith: 'text/' } },
            ],
          }
        : type === 'image'
        ? { mimeType: { startsWith: 'image/' } }
        : type === 'audio'
        ? { mimeType: { startsWith: 'audio/' } }
        : type === 'video'
        ? { mimeType: { startsWith: 'video/' } }
        : {};

    const files = await prisma.fileAttachment.findMany({
      where: {
        // Only files attached to messages (messageId IS NOT NULL)
        messageId: { not: null },
        // Filename contains the search term
        name: { contains: trimmedQuery },
        // Scope to non-deleted messages in this workspace's channels
        message: {
          isDeleted: false,
          channel: {
            workspaceId,
          },
        },
        // mimeType filter (empty object {} = no filter)
        ...mimeTypeWhere,
      },
      select: {
        id: true,
        name: true,
        url: true,
        size: true,
        mimeType: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        message: {
          select: {
            channel: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const results: FileResult[] = files.map((f) => ({
      id: f.id,
      name: f.name,
      url: f.url,
      size: f.size,
      mimeType: f.mimeType,
      uploadedBy: {
        id: f.user.id,
        name: f.user.name,
        image: f.user.image,
      },
      // message is guaranteed non-null because messageId IS NOT NULL
      channelName: f.message!.channel.name,
      createdAt: f.createdAt,
    }));

    return NextResponse.json(ok(results));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        err('UNAUTHORIZED', error.message),
        { status: error.status }
      );
    }
    console.error('[GET /api/search/files] Error:', error);
    return NextResponse.json(
      err('INTERNAL_ERROR', 'Failed to search files'),
      { status: 500 }
    );
  }
}
