/**
 * app/api/messages/[messageId]/route.ts
 *
 * GET    — Fetch a single message by ID
 * PATCH  — Edit a message (content update, marks as edited)
 * DELETE — Soft-delete a message (sets isDeleted=true)
 *
 * Request body (PATCH):
 *   content: TiptapJSON — the updated message content
 *
 * Responses use the standard API envelope (shared/types/api.ts).
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth/auth';
import { getMessageById } from '@/messages/queries';
import { editMessage, deleteMessage } from '@/messages/actions';
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
    const message = await getMessageById(messageId);
    if (!message) {
      return NextResponse.json(err('NOT_FOUND', 'Message not found'), {
        status: 404,
      });
    }
    return NextResponse.json(ok(message));
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch message';
    return NextResponse.json(err('INTERNAL_ERROR', errorMessage), {
      status: 500,
    });
  }
}

export async function PATCH(
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

  let body: { content?: TiptapJSON };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      err('VALIDATION_ERROR', 'Invalid JSON body'),
      { status: 400 }
    );
  }

  const { content } = body;

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

  try {
    const updated = await editMessage(messageId, content);
    return NextResponse.json(ok(updated));
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to edit message';

    if (errorMessage.includes('not found')) {
      return NextResponse.json(err('NOT_FOUND', errorMessage), {
        status: 404,
      });
    }
    if (errorMessage.includes('Not authorized')) {
      return NextResponse.json(err('FORBIDDEN', errorMessage), {
        status: 403,
      });
    }
    if (errorMessage.includes('Cannot edit')) {
      return NextResponse.json(err('BAD_REQUEST', errorMessage), {
        status: 400,
      });
    }

    return NextResponse.json(err('INTERNAL_ERROR', errorMessage), {
      status: 500,
    });
  }
}

export async function DELETE(
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
    await deleteMessage(messageId);
    return NextResponse.json(ok({ deleted: true }));
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to delete message';

    if (errorMessage.includes('not found')) {
      return NextResponse.json(err('NOT_FOUND', errorMessage), {
        status: 404,
      });
    }
    if (errorMessage.includes('Not authorized')) {
      return NextResponse.json(err('FORBIDDEN', errorMessage), {
        status: 403,
      });
    }
    if (errorMessage.includes('already deleted')) {
      return NextResponse.json(err('BAD_REQUEST', errorMessage), {
        status: 400,
      });
    }

    return NextResponse.json(err('INTERNAL_ERROR', errorMessage), {
      status: 500,
    });
  }
}
