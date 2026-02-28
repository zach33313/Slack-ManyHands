/**
 * app/api/channels/[channelId]/route.ts
 *
 * API routes for a single channel.
 *
 * GET    /api/channels/[channelId] — Get channel details (with membership verification)
 * PATCH  /api/channels/[channelId] — Update channel name/description/topic
 * DELETE /api/channels/[channelId] — Archive a channel (soft delete)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth/auth';
import { ok, err } from '@/shared/types/api';
import { getChannelById, isChannelMember } from '@/channels/queries';
import { updateChannel, archiveChannel } from '@/channels/actions';
import { z } from 'zod';

const UpdateChannelSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(250).optional(),
  topic: z.string().max(250).optional(),
});

/**
 * GET /api/channels/[channelId]
 *
 * Returns channel details including member count.
 * Verifies the authenticated user is a member of the channel (or it's public).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      err('UNAUTHORIZED', 'Authentication required'),
      { status: 401 }
    );
  }

  const { channelId } = await params;

  const channel = await getChannelById(channelId);
  if (!channel) {
    return NextResponse.json(
      err('NOT_FOUND', 'Channel not found'),
      { status: 404 }
    );
  }

  // For private channels and DMs, verify membership
  if (channel.type !== 'PUBLIC') {
    const isMember = await isChannelMember(channelId, session.user.id);
    if (!isMember) {
      return NextResponse.json(
        err('FORBIDDEN', 'You do not have access to this channel'),
        { status: 403 }
      );
    }
  }

  return NextResponse.json(ok(channel));
}

/**
 * PATCH /api/channels/[channelId]
 *
 * Updates channel properties (name, description, topic).
 * Requires the user to be a member of the channel.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      err('UNAUTHORIZED', 'Authentication required'),
      { status: 401 }
    );
  }

  const { channelId } = await params;

  // Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      err('VALIDATION_ERROR', 'Invalid JSON body'),
      { status: 400 }
    );
  }

  const parsed = UpdateChannelSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path.join('.');
      if (!fieldErrors[field]) fieldErrors[field] = [];
      fieldErrors[field].push(issue.message);
    }
    return NextResponse.json(
      err('VALIDATION_ERROR', 'Invalid update data', fieldErrors),
      { status: 400 }
    );
  }

  try {
    const updated = await updateChannel(channelId, parsed.data);
    return NextResponse.json(ok(updated));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to update channel';

    if (message.includes('not found') || message.includes('Not found')) {
      return NextResponse.json(err('NOT_FOUND', message), { status: 404 });
    }
    if (message.includes('not a member') || message.includes('Unauthorized')) {
      return NextResponse.json(err('FORBIDDEN', message), { status: 403 });
    }
    if (message.includes('already exists')) {
      return NextResponse.json(err('CONFLICT', message), { status: 409 });
    }

    console.error('[PATCH /api/channels/[id]] Error:', error);
    return NextResponse.json(err('INTERNAL_ERROR', message), { status: 500 });
  }
}

/**
 * DELETE /api/channels/[channelId]
 *
 * Archives a channel (sets isArchived = true).
 * Only the channel creator or workspace admin/owner can archive.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      err('UNAUTHORIZED', 'Authentication required'),
      { status: 401 }
    );
  }

  const { channelId } = await params;

  try {
    const archived = await archiveChannel(channelId);
    return NextResponse.json(ok(archived));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to archive channel';

    if (message.includes('not found') || message.includes('Not found')) {
      return NextResponse.json(err('NOT_FOUND', message), { status: 404 });
    }
    if (
      message.includes('creator') ||
      message.includes('admin') ||
      message.includes('Unauthorized')
    ) {
      return NextResponse.json(err('FORBIDDEN', message), { status: 403 });
    }

    console.error('[DELETE /api/channels/[id]] Error:', error);
    return NextResponse.json(err('INTERNAL_ERROR', message), { status: 500 });
  }
}
