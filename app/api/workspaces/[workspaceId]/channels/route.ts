/**
 * app/api/workspaces/[workspaceId]/channels/route.ts
 *
 * API routes for listing and creating channels within a workspace.
 *
 * GET  /api/workspaces/[workspaceId]/channels — List workspace channels for the authenticated user
 * POST /api/workspaces/[workspaceId]/channels — Create a new channel
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth/auth';
import { prisma } from '@/shared/lib/prisma';
import { ok, err } from '@/shared/types/api';
import { ChannelType } from '@/shared/types';
import { listWorkspaceChannels } from '@/channels/queries';
import { createChannel } from '@/channels/actions';
import { z } from 'zod';
import { IS_DEMO, demoBlock } from '@/shared/lib/demo';

const CreateChannelSchema = z.object({
  name: z
    .string()
    .min(1, 'Channel name is required')
    .max(80, 'Channel name must be 80 characters or fewer'),
  description: z.string().max(250).optional(),
  type: z.enum(['PUBLIC', 'PRIVATE']),
  memberIds: z.array(z.string()).optional(),
});

/**
 * GET /api/workspaces/[workspaceId]/channels
 *
 * Lists all channels in the workspace that the authenticated user can see:
 * - Channels they are a member of (any type)
 * - Public channels they can join
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      err('UNAUTHORIZED', 'Authentication required'),
      { status: 401 }
    );
  }

  const { workspaceId } = await params;

  // Verify user is a workspace member
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId, userId: session.user.id },
    },
  });

  if (!membership) {
    return NextResponse.json(
      err('FORBIDDEN', 'Not a member of this workspace'),
      { status: 403 }
    );
  }

  try {
    const channels = await listWorkspaceChannels(workspaceId, session.user.id);
    return NextResponse.json(ok(channels));
  } catch (error) {
    console.error('[GET /api/workspaces/[id]/channels] Error:', error);
    return NextResponse.json(
      err('INTERNAL_ERROR', 'Failed to list channels'),
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces/[workspaceId]/channels
 *
 * Creates a new channel in the workspace.
 * The authenticated user becomes the channel creator and first member.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  if (IS_DEMO) return demoBlock('Channel creation');
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      err('UNAUTHORIZED', 'Authentication required'),
      { status: 401 }
    );
  }

  const { workspaceId } = await params;

  // Verify workspace exists and user is a member
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId, userId: session.user.id },
    },
  });

  if (!membership) {
    return NextResponse.json(
      err('FORBIDDEN', 'Not a member of this workspace'),
      { status: 403 }
    );
  }

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

  const parsed = CreateChannelSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path.join('.');
      if (!fieldErrors[field]) fieldErrors[field] = [];
      fieldErrors[field].push(issue.message);
    }
    return NextResponse.json(
      err('VALIDATION_ERROR', 'Invalid channel data', fieldErrors),
      { status: 400 }
    );
  }

  try {
    const channel = await createChannel(workspaceId, {
      name: parsed.data.name,
      description: parsed.data.description,
      type: parsed.data.type as ChannelType.PUBLIC | ChannelType.PRIVATE,
      memberIds: parsed.data.memberIds,
    });

    return NextResponse.json(ok(channel), { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create channel';

    // Check for duplicate name error
    if (message.includes('already exists')) {
      return NextResponse.json(err('CONFLICT', message), { status: 409 });
    }

    console.error('[POST /api/workspaces/[id]/channels] Error:', error);
    return NextResponse.json(err('INTERNAL_ERROR', message), { status: 500 });
  }
}
