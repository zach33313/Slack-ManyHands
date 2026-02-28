/**
 * app/api/messages/[messageId]/reactions/route.ts
 *
 * POST   — Add an emoji reaction to a message
 * DELETE — Remove an emoji reaction from a message
 *
 * Request body (POST):
 *   emoji: string — the emoji to add (e.g. '👍', '❤️')
 *
 * Query params (DELETE):
 *   emoji: string — the emoji to remove
 *
 * Responses use the standard API envelope (shared/types/api.ts).
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth/auth';
import { addReaction, removeReaction } from '@/messages/actions';
import { ok, err } from '@/shared/types/api';

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

  let body: { emoji?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      err('VALIDATION_ERROR', 'Invalid JSON body'),
      { status: 400 }
    );
  }

  const { emoji } = body;

  if (!emoji || typeof emoji !== 'string' || emoji.trim().length === 0) {
    return NextResponse.json(
      err('VALIDATION_ERROR', 'emoji is required and must be a non-empty string'),
      { status: 400 }
    );
  }

  try {
    const reactions = await addReaction(messageId, emoji.trim());
    return NextResponse.json(ok({ messageId, reactions }));
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to add reaction';

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

export async function DELETE(
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

  const emoji = request.nextUrl.searchParams.get('emoji');

  if (!emoji || emoji.trim().length === 0) {
    return NextResponse.json(
      err('VALIDATION_ERROR', 'emoji query parameter is required'),
      { status: 400 }
    );
  }

  try {
    const reactions = await removeReaction(messageId, emoji.trim());
    return NextResponse.json(ok({ messageId, reactions }));
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to remove reaction';

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
