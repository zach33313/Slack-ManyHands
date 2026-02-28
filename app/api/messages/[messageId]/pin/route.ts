/**
 * app/api/messages/[messageId]/pin/route.ts
 *
 * POST   — Pin a message in its channel
 * DELETE — Unpin a message from its channel
 *
 * The channelId is inferred from the message's channel relationship,
 * so no channelId is needed in the request body.
 *
 * Responses use the standard API envelope (shared/types/api.ts).
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth/auth';
import { pinMessage, unpinMessage } from '@/messages/actions';
import { getMessageById } from '@/messages/queries';
import { ok, err } from '@/shared/types/api';

export async function POST(
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

  // Look up the message to get its channelId
  let message;
  try {
    message = await getMessageById(messageId);
  } catch {
    return NextResponse.json(
      err('INTERNAL_ERROR', 'Failed to look up message'),
      { status: 500 }
    );
  }

  if (!message) {
    return NextResponse.json(err('NOT_FOUND', 'Message not found'), {
      status: 404,
    });
  }

  try {
    await pinMessage(message.channelId, messageId);
    return NextResponse.json(ok({ pinned: true }), { status: 201 });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to pin message';

    if (errorMessage.includes('not found')) {
      return NextResponse.json(err('NOT_FOUND', errorMessage), {
        status: 404,
      });
    }
    if (errorMessage.includes('already pinned')) {
      return NextResponse.json(err('CONFLICT', errorMessage), {
        status: 409,
      });
    }
    if (errorMessage.includes('Maximum pin limit')) {
      return NextResponse.json(err('LIMIT_EXCEEDED', errorMessage), {
        status: 422,
      });
    }
    if (errorMessage.includes('Cannot pin')) {
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

  // Look up the message to get its channelId
  let message;
  try {
    message = await getMessageById(messageId);
  } catch {
    return NextResponse.json(
      err('INTERNAL_ERROR', 'Failed to look up message'),
      { status: 500 }
    );
  }

  if (!message) {
    return NextResponse.json(err('NOT_FOUND', 'Message not found'), {
      status: 404,
    });
  }

  try {
    await unpinMessage(message.channelId, messageId);
    return NextResponse.json(ok({ unpinned: true }));
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to unpin message';

    if (errorMessage.includes('not pinned')) {
      return NextResponse.json(err('NOT_FOUND', errorMessage), {
        status: 404,
      });
    }

    return NextResponse.json(err('INTERNAL_ERROR', errorMessage), {
      status: 500,
    });
  }
}
