/**
 * app/api/messages/[messageId]/threads/route.ts
 *
 * GET  — Fetch all thread replies for a parent message
 * POST — Send a thread reply to a parent message
 *
 * Request body (POST):
 *   content: TiptapJSON — the reply content
 *   fileIds?: string[]  — file attachment IDs from prior upload
 *
 * Responses use the standard API envelope (shared/types/api.ts).
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth/auth';
import { getThreadReplies, getMessageById } from '@/messages/queries';
import { sendMessage } from '@/messages/actions';
import { ok, err } from '@/shared/types/api';
import type { TiptapJSON } from '@/shared/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: { messageId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      err('UNAUTHORIZED', 'Authentication required'),
      { status: 401 }
    );
  }

  const { messageId } = params;

  try {
    // Verify the parent message exists
    const parent = await getMessageById(messageId);
    if (!parent) {
      return NextResponse.json(err('NOT_FOUND', 'Parent message not found'), {
        status: 404,
      });
    }

    const replies = await getThreadReplies(messageId);
    return NextResponse.json(ok(replies));
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch thread replies';
    return NextResponse.json(err('INTERNAL_ERROR', errorMessage), {
      status: 500,
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { messageId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      err('UNAUTHORIZED', 'Authentication required'),
      { status: 401 }
    );
  }

  const { messageId } = params;

  // Verify the parent message exists and get its channelId
  let parentMessage;
  try {
    parentMessage = await getMessageById(messageId);
  } catch {
    return NextResponse.json(
      err('INTERNAL_ERROR', 'Failed to look up parent message'),
      { status: 500 }
    );
  }

  if (!parentMessage) {
    return NextResponse.json(err('NOT_FOUND', 'Parent message not found'), {
      status: 404,
    });
  }

  let body: { content?: TiptapJSON; fileIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      err('VALIDATION_ERROR', 'Invalid JSON body'),
      { status: 400 }
    );
  }

  const { content, fileIds } = body;

  if (!content) {
    return NextResponse.json(
      err('VALIDATION_ERROR', 'content is required'),
      { status: 400 }
    );
  }

  if (typeof content !== 'object' || content.type !== 'doc') {
    return NextResponse.json(
      err(
        'VALIDATION_ERROR',
        'content must be a valid Tiptap JSON document with type "doc"'
      ),
      { status: 400 }
    );
  }

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
    const reply = await sendMessage({
      channelId: parentMessage.channelId,
      content,
      parentId: messageId,
      fileIds,
    });

    return NextResponse.json(ok(reply), { status: 201 });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to send thread reply';
    return NextResponse.json(err('INTERNAL_ERROR', errorMessage), {
      status: 500,
    });
  }
}
