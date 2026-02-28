/**
 * app/api/channels/[channelId]/members/route.ts
 *
 * API routes for channel membership management.
 *
 * GET    /api/channels/[channelId]/members — List channel members with user details
 * POST   /api/channels/[channelId]/members — Add a member (join public channel, or invite to private)
 * DELETE /api/channels/[channelId]/members — Remove a member or leave the channel
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth/auth';
import { prisma } from '@/shared/lib/prisma';
import { ok, err } from '@/shared/types/api';
import {
  getChannelMembers,
  isChannelMember,
} from '@/channels/queries';
import {
  joinChannel,
  leaveChannel,
  addChannelMember,
  removeChannelMember,
} from '@/channels/actions';
import { z } from 'zod';

const AddMemberSchema = z.object({
  userId: z.string().min(1).optional(),
  email: z.string().email().optional(),
}).refine((data) => data.userId || data.email, {
  message: 'Either userId or email is required',
});

const RemoveMemberSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

/**
 * GET /api/channels/[channelId]/members
 *
 * Returns all members of the channel with their user details.
 * Requires the authenticated user to be a member of the channel.
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

  // Verify channel exists
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  });

  if (!channel) {
    return NextResponse.json(
      err('NOT_FOUND', 'Channel not found'),
      { status: 404 }
    );
  }

  // For private channels, verify membership
  if (channel.type !== 'PUBLIC') {
    const isMember = await isChannelMember(channelId, session.user.id);
    if (!isMember) {
      return NextResponse.json(
        err('FORBIDDEN', 'You do not have access to this channel'),
        { status: 403 }
      );
    }
  }

  try {
    const members = await getChannelMembers(channelId);
    return NextResponse.json(ok(members));
  } catch (error) {
    console.error('[GET /api/channels/[id]/members] Error:', error);
    return NextResponse.json(
      err('INTERNAL_ERROR', 'Failed to list members'),
      { status: 500 }
    );
  }
}

/**
 * POST /api/channels/[channelId]/members
 *
 * Adds a member to the channel.
 *
 * For PUBLIC channels:
 *   - If userId is the current user → self-join (joinChannel)
 *   - If userId is another user → add them (addChannelMember)
 *
 * For PRIVATE channels:
 *   - Validates that the inviter (current user) is already a member
 *   - Then adds the target user
 */
export async function POST(
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

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      err('VALIDATION_ERROR', 'Invalid JSON body'),
      { status: 400 }
    );
  }

  const parsed = AddMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      err('VALIDATION_ERROR', 'Either userId or email is required'),
      { status: 400 }
    );
  }

  let targetUserId = parsed.data.userId;

  // If email provided instead of userId, look up the user
  if (!targetUserId && parsed.data.email) {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json(
        err('NOT_FOUND', `No user found with email ${parsed.data.email}`),
        { status: 404 }
      );
    }
    targetUserId = user.id;
  }

  if (!targetUserId) {
    return NextResponse.json(
      err('VALIDATION_ERROR', 'Could not resolve user'),
      { status: 400 }
    );
  }

  // Check if the channel exists
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  });

  if (!channel) {
    return NextResponse.json(
      err('NOT_FOUND', 'Channel not found'),
      { status: 404 }
    );
  }

  try {
    if (targetUserId === session.user.id && channel.type === 'PUBLIC') {
      // Self-join for public channels
      await joinChannel(channelId);
    } else {
      // Add another user (validates inviter membership for private channels)
      await addChannelMember(channelId, targetUserId);
    }

    return NextResponse.json(ok({ success: true }), { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to add member';

    if (message.includes('not found') || message.includes('Not found')) {
      return NextResponse.json(err('NOT_FOUND', message), { status: 404 });
    }
    if (
      message.includes('not a member') ||
      message.includes('must be a member') ||
      message.includes('Only') ||
      message.includes('archived') ||
      message.includes('public')
    ) {
      return NextResponse.json(err('FORBIDDEN', message), { status: 403 });
    }

    console.error('[POST /api/channels/[id]/members] Error:', error);
    return NextResponse.json(err('INTERNAL_ERROR', message), { status: 500 });
  }
}

/**
 * DELETE /api/channels/[channelId]/members
 *
 * Removes a member from the channel, or leaves the channel.
 *
 * If userId matches the current user → leave channel
 * If userId is another user → remove them (requires creator/admin permission)
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

  // Parse body or query params for userId
  let targetUserId: string | null = null;

  // Try body first
  try {
    const body = await request.json();
    const parsed = RemoveMemberSchema.safeParse(body);
    if (parsed.success) {
      targetUserId = parsed.data.userId;
    }
  } catch {
    // No body — check URL search params
    const url = new URL(request.url);
    targetUserId = url.searchParams.get('userId');
  }

  // Default to leaving self if no userId specified
  if (!targetUserId) {
    targetUserId = session.user.id;
  }

  try {
    if (targetUserId === session.user.id) {
      // Leave the channel
      await leaveChannel(channelId);
    } else {
      // Remove another user (requires permission)
      await removeChannelMember(channelId, targetUserId);
    }

    return NextResponse.json(ok({ success: true }), { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to remove member';

    if (message.includes('not found') || message.includes('Not found')) {
      return NextResponse.json(err('NOT_FOUND', message), { status: 404 });
    }
    if (
      message.includes('creator') ||
      message.includes('admin') ||
      message.includes('DM') ||
      message.includes('not a member')
    ) {
      return NextResponse.json(err('FORBIDDEN', message), { status: 403 });
    }

    console.error('[DELETE /api/channels/[id]/members] Error:', error);
    return NextResponse.json(err('INTERNAL_ERROR', message), { status: 500 });
  }
}
