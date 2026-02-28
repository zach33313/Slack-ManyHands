/**
 * app/api/channels/[channelId]/messages/route.ts
 *
 * GET  — Fetch paginated messages for a channel (cursor-based)
 * POST — Send a new message to a channel
 *
 * Query params (GET):
 *   cursor?: string  — message ID for pagination
 *   limit?: number   — items per page (default 50, max 100)
 *
 * Request body (POST):
 *   content: TiptapJSON  — the message content
 *   parentId?: string    — parent message ID for thread replies
 *   fileIds?: string[]   — file attachment IDs from prior upload
 *
 * Responses use the standard API envelope (shared/types/api.ts).
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth/auth';
import { getMessages } from '@/messages/queries';
import { sendMessage } from '@/messages/actions';
import { ok, err, paginated } from '@/shared/types/api';
import type { TiptapJSON } from '@/shared/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { channelId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      err('UNAUTHORIZED', 'Authentication required'),
      { status: 401 }
    );
  }

  const { channelId } = params;
  const { searchParams } = request.nextUrl;
  const cursor = searchParams.get('cursor') ?? undefined;
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  // Validate limit if provided
  if (limit !== undefined && (isNaN(limit) || limit < 1)) {
    return NextResponse.json(
      err('VALIDATION_ERROR', 'limit must be a positive integer'),
      { status: 400 }
    );
  }

  try {
    const result = await getMessages(channelId, { cursor, limit });

    return NextResponse.json(
      paginated(result.messages, result.nextCursor, result.hasMore)
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch messages';
    return NextResponse.json(err('INTERNAL_ERROR', message), {
      status: 500,
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { channelId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      err('UNAUTHORIZED', 'Authentication required'),
      { status: 401 }
    );
  }

  const { channelId } = params;

  let body: { content?: TiptapJSON; parentId?: string; fileIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      err('VALIDATION_ERROR', 'Invalid JSON body'),
      { status: 400 }
    );
  }

  const { content, parentId, fileIds } = body;

  if (!content) {
    return NextResponse.json(
      err('VALIDATION_ERROR', 'content is required'),
      { status: 400 }
    );
  }

  // Validate content is a valid Tiptap JSON shape
  if (typeof content !== 'object' || content.type !== 'doc') {
    return NextResponse.json(
      err(
        'VALIDATION_ERROR',
        'content must be a valid Tiptap JSON document with type "doc"'
      ),
      { status: 400 }
    );
  }

  // Validate fileIds is an array of strings if provided
  if (fileIds !== undefined) {
    if (
      !Array.isArray(fileIds) ||
      !fileIds.every((id) => typeof id === 'string')
    ) {
      return NextResponse.json(
        err('VALIDATION_ERROR', 'fileIds must be an array of strings'),
        { status: 400 }
      );
    }
  }

  try {
    const message = await sendMessage({
      channelId,
      content,
      parentId,
      fileIds,
    });

    return NextResponse.json(ok(message), { status: 201 });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to send message';

    if (errorMessage.includes('not found')) {
      return NextResponse.json(err('NOT_FOUND', errorMessage), {
        status: 404,
      });
    }

    return NextResponse.json(err('INTERNAL_ERROR', errorMessage), {
      status: 500,
    });
  }
}
