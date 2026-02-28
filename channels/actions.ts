'use server';

/**
 * channels/actions.ts
 *
 * Server Actions for channel management.
 * These are called from client components via React Server Actions.
 *
 * All actions require authentication and validate permissions before mutating.
 *
 * Usage:
 *   import { createChannel, joinChannel } from '@/channels/actions'
 *   const channel = await createChannel('workspace-id', { name: 'engineering', type: 'PUBLIC' })
 */

import { prisma } from '@/shared/lib/prisma';
import { auth } from '@/auth/auth';
import { ChannelType, MemberRole } from '@/shared/types';
import type { Channel, CreateChannelInput } from '@/shared/types';
import type { UpdateChannelInput } from './types';
import { channelSlug } from '@/shared/lib/utils';
import { channelRoom, workspaceRoom } from '@/shared/lib/constants';
import { isChannelNameUnique, isChannelMember, getDMChannel } from './queries';

// ---------------------------------------------------------------------------
// Socket.IO emitter helpers
// ---------------------------------------------------------------------------

/**
 * Access the Socket.IO server instance from the global scope.
 * Returns null during build time or when the custom server isn't running.
 */
function getIO(): any | null {
  return (globalThis as any).__socketio ?? null;
}

/** Emit an event to all users subscribed to a channel room */
function emitToChannel(channelId: string, event: string, data: unknown): void {
  const io = getIO();
  if (io) {
    io.to(channelRoom(channelId)).emit(event, data);
  }
}

/** Emit an event to all users in a workspace room */
function emitToWorkspace(workspaceId: string, event: string, data: unknown): void {
  const io = getIO();
  if (io) {
    io.to(workspaceRoom(workspaceId)).emit(event, data);
  }
}

/**
 * Get the authenticated user's ID or throw.
 */
async function requireAuth(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  return session.user.id;
}

/**
 * Verify the user is a member of the workspace.
 */
async function requireWorkspaceMember(
  workspaceId: string,
  userId: string
): Promise<void> {
  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId, userId },
    },
  });
  if (!member) {
    throw new Error('Not a member of this workspace');
  }
}

/**
 * Create a new channel in a workspace.
 *
 * - Validates unique name within workspace
 * - Creates the channel record
 * - Adds the creator as a member
 * - Emits `channel:created` via Socket.IO
 *
 * @param workspaceId - The workspace to create the channel in
 * @param input - Channel creation input (name, type, description, memberIds)
 * @returns The created channel
 */
export async function createChannel(
  workspaceId: string,
  input: Omit<CreateChannelInput, 'workspaceId'>
): Promise<Channel> {
  const userId = await requireAuth();
  await requireWorkspaceMember(workspaceId, userId);

  // Normalize channel name to slug format
  const normalizedName = channelSlug(input.name);

  if (!normalizedName || normalizedName.length === 0) {
    throw new Error('Channel name is required');
  }

  if (normalizedName.length > 80) {
    throw new Error('Channel name must be 80 characters or fewer');
  }

  // Validate type
  if (input.type !== ChannelType.PUBLIC && input.type !== ChannelType.PRIVATE) {
    throw new Error('Channel type must be PUBLIC or PRIVATE');
  }

  // Check uniqueness
  const isUnique = await isChannelNameUnique(workspaceId, normalizedName);
  if (!isUnique) {
    throw new Error(`A channel named "${normalizedName}" already exists in this workspace`);
  }

  // Create channel and add creator as member in a transaction
  const channel = await prisma.$transaction(async (tx) => {
    const newChannel = await tx.channel.create({
      data: {
        workspaceId,
        name: normalizedName,
        description: input.description ?? null,
        type: input.type,
        createdById: userId,
      },
    });

    // Add creator as member
    await tx.channelMember.create({
      data: {
        channelId: newChannel.id,
        userId,
        lastReadAt: new Date(),
      },
    });

    // Add any additional members specified
    if (input.memberIds && input.memberIds.length > 0) {
      const uniqueMembers = [...new Set(input.memberIds)].filter(
        (id) => id !== userId
      );
      for (const memberId of uniqueMembers) {
        // Verify the member belongs to the workspace
        const workspaceMember = await tx.workspaceMember.findUnique({
          where: {
            workspaceId_userId: { workspaceId, userId: memberId },
          },
        });
        if (workspaceMember) {
          await tx.channelMember.create({
            data: {
              channelId: newChannel.id,
              userId: memberId,
            },
          });
        }
      }
    }

    return newChannel;
  });

  const result: Channel = {
    id: channel.id,
    workspaceId: channel.workspaceId,
    name: channel.name,
    description: channel.description,
    type: channel.type as ChannelType,
    isArchived: channel.isArchived,
    createdById: channel.createdById,
    createdAt: channel.createdAt,
  };

  // Emit to workspace so all connected clients see the new channel
  emitToWorkspace(workspaceId, 'channel:created', result);

  return result;
}

/**
 * Archive a channel (soft delete).
 *
 * Only the channel creator or workspace admin/owner can archive.
 * Emits `channel:archived` via Socket.IO.
 *
 * @param channelId - The channel to archive
 * @returns The updated channel
 */
export async function archiveChannel(channelId: string): Promise<Channel> {
  const userId = await requireAuth();

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  });

  if (!channel) {
    throw new Error('Channel not found');
  }

  // Only creator or workspace admin can archive
  const isCreator = channel.createdById === userId;
  const workspaceMember = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: channel.workspaceId,
        userId,
      },
    },
  });

  const isAdmin =
    workspaceMember?.role === 'OWNER' || workspaceMember?.role === 'ADMIN';

  if (!isCreator && !isAdmin) {
    throw new Error('Only the channel creator or workspace admin can archive this channel');
  }

  const updated = await prisma.channel.update({
    where: { id: channelId },
    data: { isArchived: true },
  });

  const result: Channel = {
    id: updated.id,
    workspaceId: updated.workspaceId,
    name: updated.name,
    description: updated.description,
    type: updated.type as ChannelType,
    isArchived: updated.isArchived,
    createdById: updated.createdById,
    createdAt: updated.createdAt,
  };

  emitToWorkspace(channel.workspaceId, 'channel:archived', {
    channelId: channel.id,
  });

  return result;
}

/**
 * Update a channel's name, description, or topic.
 *
 * Only the channel creator or workspace admin/owner can update.
 * Emits `channel:updated` via Socket.IO.
 *
 * @param channelId - The channel to update
 * @param data - Fields to update
 * @returns The updated channel
 */
export async function updateChannel(
  channelId: string,
  data: UpdateChannelInput
): Promise<Channel> {
  const userId = await requireAuth();

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  });

  if (!channel) {
    throw new Error('Channel not found');
  }

  // Verify user is a member of the channel
  const isMember = await isChannelMember(channelId, userId);
  if (!isMember) {
    throw new Error('You are not a member of this channel');
  }

  // Build update payload
  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) {
    const normalizedName = channelSlug(data.name);
    if (!normalizedName) {
      throw new Error('Channel name is required');
    }
    const isUnique = await isChannelNameUnique(
      channel.workspaceId,
      normalizedName,
      channelId
    );
    if (!isUnique) {
      throw new Error(`A channel named "${normalizedName}" already exists`);
    }
    updateData.name = normalizedName;
  }

  // Topic and description map to the same DB column — reject if both provided
  if (data.description !== undefined && data.topic !== undefined) {
    throw new Error(
      'Cannot set both description and topic simultaneously — they share the same field'
    );
  }

  if (data.description !== undefined) {
    updateData.description = data.description;
  }

  if (data.topic !== undefined) {
    updateData.description = data.topic;
  }

  const updated = await prisma.channel.update({
    where: { id: channelId },
    data: updateData,
  });

  const result: Channel = {
    id: updated.id,
    workspaceId: updated.workspaceId,
    name: updated.name,
    description: updated.description,
    type: updated.type as ChannelType,
    isArchived: updated.isArchived,
    createdById: updated.createdById,
    createdAt: updated.createdAt,
  };

  // Emit the updated channel to the workspace
  emitToWorkspace(channel.workspaceId, 'channel:updated', result);

  return result;
}

/**
 * Join a public channel.
 *
 * Only works for PUBLIC channels. For PRIVATE channels, use invites.
 * Creates a ChannelMember record and emits `member:joined`.
 *
 * @param channelId - The channel to join
 */
export async function joinChannel(channelId: string): Promise<void> {
  const userId = await requireAuth();

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  });

  if (!channel) {
    throw new Error('Channel not found');
  }

  if (channel.isArchived) {
    throw new Error('Cannot join an archived channel');
  }

  if (channel.type !== 'PUBLIC') {
    throw new Error('Can only join public channels. Private channels require an invitation.');
  }

  // Verify user is a workspace member
  await requireWorkspaceMember(channel.workspaceId, userId);

  // Check if already a member
  const existing = await prisma.channelMember.findUnique({
    where: {
      channelId_userId: { channelId, userId },
    },
  });

  if (existing) {
    return; // Already a member, no-op
  }

  await prisma.channelMember.create({
    data: {
      channelId,
      userId,
      lastReadAt: new Date(),
    },
  });

  // Fetch user details for the event
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, image: true },
  });

  if (user) {
    emitToChannel(channelId, 'member:joined', {
      id: '', // Not used for channel member events
      workspaceId: channel.workspaceId,
      userId: user.id,
      role: MemberRole.MEMBER,
      joinedAt: new Date(),
      user: {
        id: user.id,
        name: user.name ?? 'Unknown User',
        image: user.image,
      },
    });
  }
}

/**
 * Leave a channel.
 *
 * Deletes the ChannelMember record. Cannot leave DM channels.
 *
 * @param channelId - The channel to leave
 */
export async function leaveChannel(channelId: string): Promise<void> {
  const userId = await requireAuth();

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  });

  if (!channel) {
    throw new Error('Channel not found');
  }

  if (channel.type === 'DM' || channel.type === 'GROUP_DM') {
    throw new Error('Cannot leave a DM channel');
  }

  const membership = await prisma.channelMember.findUnique({
    where: {
      channelId_userId: { channelId, userId },
    },
  });

  if (!membership) {
    throw new Error('You are not a member of this channel');
  }

  await prisma.channelMember.delete({
    where: { id: membership.id },
  });

  emitToChannel(channelId, 'member:left', {
    userId,
    workspaceId: channel.workspaceId,
  });
}

/**
 * Open a DM channel with another user.
 *
 * Finds an existing DM channel between the two users, or creates a new one.
 * Both users are added as members of the DM channel.
 *
 * @param workspaceId - The workspace context
 * @param targetUserId - The user to DM
 * @returns The DM channel
 */
export async function openDM(
  workspaceId: string,
  targetUserId: string
): Promise<Channel> {
  const userId = await requireAuth();

  if (userId === targetUserId) {
    throw new Error('Cannot create a DM with yourself');
  }

  // Verify both users are workspace members
  await requireWorkspaceMember(workspaceId, userId);
  await requireWorkspaceMember(workspaceId, targetUserId);

  // Check for existing DM channel
  const existingDMId = await getDMChannel(workspaceId, userId, targetUserId);
  if (existingDMId) {
    const existing = await prisma.channel.findUnique({
      where: { id: existingDMId },
    });
    if (existing) {
      return {
        id: existing.id,
        workspaceId: existing.workspaceId,
        name: existing.name,
        description: existing.description,
        type: existing.type as ChannelType,
        isArchived: existing.isArchived,
        createdById: existing.createdById,
        createdAt: existing.createdAt,
      };
    }
  }

  // Fetch target user name for the DM channel name
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, image: true },
  });

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, image: true },
  });

  const dmName = `dm-${[userId, targetUserId].sort().join('-')}`;

  // Create new DM channel with both users as members
  const channel = await prisma.$transaction(async (tx) => {
    const newChannel = await tx.channel.create({
      data: {
        workspaceId,
        name: dmName,
        type: 'DM',
        createdById: userId,
        description: null,
      },
    });

    await tx.channelMember.create({
      data: {
        channelId: newChannel.id,
        userId,
        lastReadAt: new Date(),
      },
    });

    await tx.channelMember.create({
      data: {
        channelId: newChannel.id,
        userId: targetUserId,
        lastReadAt: new Date(),
      },
    });

    return newChannel;
  });

  const result: Channel = {
    id: channel.id,
    workspaceId: channel.workspaceId,
    name: channel.name,
    description: channel.description,
    type: channel.type as ChannelType,
    isArchived: channel.isArchived,
    createdById: channel.createdById,
    createdAt: channel.createdAt,
  };

  // Emit channel:created so the DM appears in sidebars immediately
  emitToWorkspace(workspaceId, 'channel:created', result);

  // Emit dm:participants so clients can resolve display names
  const participants = [
    { id: userId, name: currentUser?.name ?? 'Unknown', image: currentUser?.image ?? null },
    { id: targetUserId, name: targetUser?.name ?? 'Unknown', image: targetUser?.image ?? null },
  ];
  emitToWorkspace(workspaceId, 'dm:participants', {
    channelId: channel.id,
    participants,
  });

  return result;
}

/**
 * Create a group DM channel with multiple users.
 *
 * - Validates 2-8 target users, all workspace members
 * - Checks for existing GROUP_DM with exact same member set
 * - Creates channel with type GROUP_DM, adds all members
 * - Emits channel:created + dm:participants to workspace
 *
 * @param workspaceId - The workspace context
 * @param targetUserIds - The users to include in the group DM (not including creator)
 * @returns The group DM channel
 */
export async function createGroupDM(
  workspaceId: string,
  targetUserIds: string[]
): Promise<Channel> {
  const userId = await requireAuth();

  if (targetUserIds.length < 2 || targetUserIds.length > 8) {
    throw new Error('Group DMs require 2-8 other participants');
  }

  // Filter out self from target list
  const uniqueTargets = [...new Set(targetUserIds.filter((id) => id !== userId))];
  if (uniqueTargets.length < 2) {
    throw new Error('Group DMs require at least 2 other participants');
  }

  // Verify all users are workspace members
  await requireWorkspaceMember(workspaceId, userId);
  for (const targetId of uniqueTargets) {
    await requireWorkspaceMember(workspaceId, targetId);
  }

  // Check for existing GROUP_DM with exact same member set
  const allMemberIds = [userId, ...uniqueTargets].sort();
  const existingGroupDMs = await prisma.channel.findMany({
    where: {
      workspaceId,
      type: 'GROUP_DM',
      isArchived: false,
    },
    include: {
      members: { select: { userId: true } },
    },
  });

  for (const existing of existingGroupDMs) {
    const existingMemberIds = existing.members.map((m) => m.userId).sort();
    if (
      existingMemberIds.length === allMemberIds.length &&
      existingMemberIds.every((id, i) => id === allMemberIds[i])
    ) {
      return {
        id: existing.id,
        workspaceId: existing.workspaceId,
        name: existing.name,
        description: existing.description,
        type: existing.type as ChannelType,
        isArchived: existing.isArchived,
        createdById: existing.createdById,
        createdAt: existing.createdAt,
      };
    }
  }

  // Fetch all user info for channel name and participants
  const allUsers = await prisma.user.findMany({
    where: { id: { in: allMemberIds } },
    select: { id: true, name: true, image: true },
  });

  const dmName = `group-dm-${allMemberIds.join('-').slice(0, 60)}`;

  // Create new GROUP_DM channel with all members
  const channel = await prisma.$transaction(async (tx) => {
    const newChannel = await tx.channel.create({
      data: {
        workspaceId,
        name: dmName,
        type: 'GROUP_DM',
        createdById: userId,
        description: null,
      },
    });

    for (const memberId of allMemberIds) {
      await tx.channelMember.create({
        data: {
          channelId: newChannel.id,
          userId: memberId,
          lastReadAt: new Date(),
        },
      });
    }

    return newChannel;
  });

  const result: Channel = {
    id: channel.id,
    workspaceId: channel.workspaceId,
    name: channel.name,
    description: channel.description,
    type: channel.type as ChannelType,
    isArchived: channel.isArchived,
    createdById: channel.createdById,
    createdAt: channel.createdAt,
  };

  // Emit to workspace
  emitToWorkspace(workspaceId, 'channel:created', result);

  // Emit dm:participants
  const participants = allUsers.map((u) => ({
    id: u.id,
    name: u.name ?? 'Unknown',
    image: u.image ?? null,
  }));
  emitToWorkspace(workspaceId, 'dm:participants', {
    channelId: channel.id,
    participants,
  });

  return result;
}

/**
 * Add a member to a private channel.
 *
 * Validates that the inviter is a member of the channel.
 * Only works for PRIVATE channels (PUBLIC channels use joinChannel).
 *
 * @param channelId - The channel to add the member to
 * @param targetUserId - The user to add
 */
export async function addChannelMember(
  channelId: string,
  targetUserId: string
): Promise<void> {
  const userId = await requireAuth();

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  });

  if (!channel) {
    throw new Error('Channel not found');
  }

  if (channel.isArchived) {
    throw new Error('Cannot add members to an archived channel');
  }

  // Verify inviter is a member
  const inviterMember = await isChannelMember(channelId, userId);
  if (!inviterMember) {
    throw new Error('You must be a member of this channel to invite others');
  }

  // Verify target is a workspace member
  await requireWorkspaceMember(channel.workspaceId, targetUserId);

  // Check if already a member
  const existing = await prisma.channelMember.findUnique({
    where: {
      channelId_userId: { channelId, userId: targetUserId },
    },
  });

  if (existing) {
    return; // Already a member
  }

  await prisma.channelMember.create({
    data: {
      channelId,
      userId: targetUserId,
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, image: true },
  });

  if (user) {
    emitToChannel(channelId, 'member:joined', {
      id: '',
      workspaceId: channel.workspaceId,
      userId: user.id,
      role: MemberRole.MEMBER,
      joinedAt: new Date(),
      user: {
        id: user.id,
        name: user.name ?? 'Unknown User',
        image: user.image,
      },
    });
  }
}

/**
 * Update the notification preference for a channel member.
 *
 * @param channelId - The channel
 * @param notifyPref - The notification preference ('ALL' | 'MENTIONS' | 'NOTHING')
 */
export async function updateChannelNotifyPref(
  channelId: string,
  notifyPref: string
): Promise<void> {
  const userId = await requireAuth();

  await prisma.channelMember.update({
    where: {
      channelId_userId: { channelId, userId },
    },
    data: { notifyPref },
  });
}

/**
 * Remove a member from a channel.
 *
 * Only the channel creator or workspace admin can remove members.
 *
 * @param channelId - The channel to remove the member from
 * @param targetUserId - The user to remove
 */
export async function removeChannelMember(
  channelId: string,
  targetUserId: string
): Promise<void> {
  const userId = await requireAuth();

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  });

  if (!channel) {
    throw new Error('Channel not found');
  }

  // Verify the actor is the channel creator or workspace admin
  const isCreator = channel.createdById === userId;
  const workspaceMember = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: channel.workspaceId,
        userId,
      },
    },
  });

  const isAdmin =
    workspaceMember?.role === 'OWNER' || workspaceMember?.role === 'ADMIN';

  if (!isCreator && !isAdmin) {
    throw new Error('Only the channel creator or workspace admin can remove members');
  }

  const membership = await prisma.channelMember.findUnique({
    where: {
      channelId_userId: { channelId, userId: targetUserId },
    },
  });

  if (!membership) {
    throw new Error('User is not a member of this channel');
  }

  await prisma.channelMember.delete({
    where: { id: membership.id },
  });

  emitToChannel(channelId, 'member:left', {
    userId: targetUserId,
    workspaceId: channel.workspaceId,
  });
}
