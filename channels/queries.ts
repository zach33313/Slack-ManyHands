/**
 * channels/queries.ts
 *
 * Database queries for the channels domain.
 * All functions use the Prisma client singleton and return typed results.
 *
 * Usage:
 *   import { getChannelById, listWorkspaceChannels } from '@/channels/queries'
 */

import { prisma } from '@/shared/lib/prisma';
import type { ChannelType } from '@/shared/types';
import type { ChannelListItem, ChannelMemberWithUser, DMChannelItem } from './types';

/**
 * Get a single channel by ID with member count.
 * Returns null if the channel does not exist.
 */
export async function getChannelById(id: string) {
  const channel = await prisma.channel.findUnique({
    where: { id },
    include: {
      _count: {
        select: { members: true },
      },
    },
  });

  if (!channel) return null;

  return {
    id: channel.id,
    workspaceId: channel.workspaceId,
    name: channel.name,
    description: channel.description,
    type: channel.type as ChannelType,
    isArchived: channel.isArchived,
    createdById: channel.createdById,
    createdAt: channel.createdAt,
    memberCount: channel._count.members,
  };
}

/**
 * List channels in a workspace for a specific user.
 * Returns:
 *   - All channels the user is a member of (any type)
 *   - All PUBLIC channels they can join (even if not a member)
 *
 * Each channel includes unread count, starred/muted status, and last message preview.
 */
export async function listWorkspaceChannels(
  workspaceId: string,
  userId: string
): Promise<ChannelListItem[]> {
  // Get all channels in this workspace that are either:
  // 1. Channels the user is a member of
  // 2. Public channels (even if user hasn't joined)
  const channels = await prisma.channel.findMany({
    where: {
      workspaceId,
      isArchived: false,
      OR: [
        { members: { some: { userId } } },
        { type: 'PUBLIC' },
      ],
    },
    include: {
      _count: {
        select: { members: true },
      },
      members: {
        where: { userId },
        select: {
          lastReadAt: true,
          notifyPref: true,
        },
      },
      messages: {
        where: { isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          contentPlain: true,
          createdAt: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  return channels
    .filter((ch) => ch.type !== 'DM' && ch.type !== 'GROUP_DM')
    .map((ch) => {
      const membership = ch.members[0] ?? null;
      const lastMessage = ch.messages[0] ?? null;

      return {
        id: ch.id,
        workspaceId: ch.workspaceId,
        name: ch.name,
        description: ch.description,
        type: ch.type as ChannelType,
        isArchived: ch.isArchived,
        createdById: ch.createdById,
        createdAt: ch.createdAt,
        memberCount: ch._count.members,
        unreadCount: 0, // Will be computed below
        isStarred: false, // Stored in localStorage on client
        isMuted: membership?.notifyPref === 'NOTHING',
        lastMessagePreview: lastMessage
          ? lastMessage.contentPlain.slice(0, 100)
          : null,
        lastMessageAt: lastMessage?.createdAt ?? null,
      };
    });
}

/**
 * List channels the user is a member of (for sidebar — includes unread counts).
 */
export async function listUserChannels(
  workspaceId: string,
  userId: string
): Promise<ChannelListItem[]> {
  const channels = await prisma.channel.findMany({
    where: {
      workspaceId,
      isArchived: false,
      members: { some: { userId } },
      type: { notIn: ['DM', 'GROUP_DM'] },
    },
    include: {
      _count: {
        select: { members: true },
      },
      members: {
        where: { userId },
        select: {
          lastReadAt: true,
          notifyPref: true,
        },
      },
      messages: {
        where: { isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          contentPlain: true,
          createdAt: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const results: ChannelListItem[] = [];

  for (const ch of channels) {
    const membership = ch.members[0] ?? null;
    const lastMessage = ch.messages[0] ?? null;
    let unreadCount = 0;

    if (membership) {
      unreadCount = await getUnreadCount(ch.id, userId, membership.lastReadAt);
    }

    results.push({
      id: ch.id,
      workspaceId: ch.workspaceId,
      name: ch.name,
      description: ch.description,
      type: ch.type as ChannelType,
      isArchived: ch.isArchived,
      createdById: ch.createdById,
      createdAt: ch.createdAt,
      memberCount: ch._count.members,
      unreadCount,
      isStarred: false, // Managed client-side via localStorage
      isMuted: membership?.notifyPref === 'NOTHING',
      lastMessagePreview: lastMessage
        ? lastMessage.contentPlain.slice(0, 100)
        : null,
      lastMessageAt: lastMessage?.createdAt ?? null,
    });
  }

  return results;
}

/**
 * Get all members of a channel with their user details.
 */
export async function getChannelMembers(
  channelId: string
): Promise<ChannelMemberWithUser[]> {
  const members = await prisma.channelMember.findMany({
    where: { channelId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          title: true,
          statusText: true,
          statusEmoji: true,
          timezone: true,
        },
      },
    },
    orderBy: { joinedAt: 'asc' },
  });

  return members.map((m) => ({
    id: m.id,
    channelId: m.channelId,
    userId: m.userId,
    lastReadAt: m.lastReadAt,
    notifyPref: m.notifyPref,
    joinedAt: m.joinedAt,
    user: {
      id: m.user.id,
      name: m.user.name ?? 'Unknown User',
      image: m.user.image,
      email: m.user.email,
      title: m.user.title,
      statusText: m.user.statusText,
      statusEmoji: m.user.statusEmoji,
      timezone: m.user.timezone,
    },
  }));
}

/**
 * Find an existing DM channel between two users in a workspace.
 * Returns the channel ID or null if no DM exists.
 */
export async function getDMChannel(
  workspaceId: string,
  userId1: string,
  userId2: string
): Promise<string | null> {
  // Find a DM channel in this workspace where both users are members
  const channels = await prisma.channel.findMany({
    where: {
      workspaceId,
      type: 'DM',
      AND: [
        { members: { some: { userId: userId1 } } },
        { members: { some: { userId: userId2 } } },
      ],
    },
    include: {
      _count: {
        select: { members: true },
      },
    },
  });

  // A DM channel has exactly 2 members
  const dmChannel = channels.find((ch) => ch._count.members === 2);
  return dmChannel?.id ?? null;
}

/**
 * Get the count of unread messages in a channel for a user.
 * Counts messages created after the user's lastReadAt timestamp.
 * If lastReadAt is null (never read), counts all messages.
 */
export async function getUnreadCount(
  channelId: string,
  userId: string,
  lastReadAt?: Date | null
): Promise<number> {
  // If lastReadAt not provided, look it up
  let readAt = lastReadAt;
  if (readAt === undefined) {
    const membership = await prisma.channelMember.findUnique({
      where: {
        channelId_userId: { channelId, userId },
      },
      select: { lastReadAt: true },
    });

    if (!membership) return 0;
    readAt = membership.lastReadAt;
  }

  const where: Record<string, unknown> = {
    channelId,
    isDeleted: false,
    userId: { not: userId }, // Don't count own messages as unread
  };

  if (readAt) {
    where.createdAt = { gt: readAt };
  }

  return prisma.message.count({ where });
}

/**
 * List all DM channels for a user in a workspace.
 */
export async function listDMChannels(
  workspaceId: string,
  userId: string
): Promise<DMChannelItem[]> {
  const channels = await prisma.channel.findMany({
    where: {
      workspaceId,
      type: { in: ['DM', 'GROUP_DM'] },
      members: { some: { userId } },
      isArchived: false,
    },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      },
      messages: {
        where: { isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          contentPlain: true,
          createdAt: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const results: DMChannelItem[] = [];

  for (const ch of channels) {
    // Get the other participants (everyone except current user)
    const otherMembers = ch.members
      .filter((m) => m.userId !== userId)
      .map((m) => ({
        id: m.user.id,
        name: m.user.name ?? 'Unknown User',
        image: m.user.image,
      }));

    // Get the current user's membership for unread tracking
    const myMembership = ch.members.find((m) => m.userId === userId);
    const lastMessage = ch.messages[0] ?? null;

    let unreadCount = 0;
    if (myMembership) {
      unreadCount = await getUnreadCount(ch.id, userId, myMembership.lastReadAt);
    }

    // Build display name from participants
    const displayName =
      otherMembers.length === 1
        ? otherMembers[0].name
        : otherMembers.map((m) => m.name.split(' ')[0]).join(', ');

    const displayImage =
      otherMembers.length === 1 ? otherMembers[0].image : null;

    results.push({
      id: ch.id,
      workspaceId: ch.workspaceId,
      type: ch.type as ChannelType,
      participants: otherMembers,
      displayName,
      displayImage,
      unreadCount,
      lastMessagePreview: lastMessage
        ? lastMessage.contentPlain.slice(0, 100)
        : null,
      lastMessageAt: lastMessage?.createdAt ?? null,
      createdAt: ch.createdAt,
    });
  }

  // Sort by last message time, most recent first
  results.sort((a, b) => {
    const aTime = a.lastMessageAt?.getTime() ?? a.createdAt.getTime();
    const bTime = b.lastMessageAt?.getTime() ?? b.createdAt.getTime();
    return bTime - aTime;
  });

  return results;
}

/**
 * Check if a user is a member of a channel.
 */
export async function isChannelMember(
  channelId: string,
  userId: string
): Promise<boolean> {
  const member = await prisma.channelMember.findUnique({
    where: {
      channelId_userId: { channelId, userId },
    },
  });
  return member !== null;
}

/**
 * Check if a channel name is unique within a workspace.
 */
export async function isChannelNameUnique(
  workspaceId: string,
  name: string,
  excludeChannelId?: string
): Promise<boolean> {
  const existing = await prisma.channel.findFirst({
    where: {
      workspaceId,
      name: name.toLowerCase(),
      ...(excludeChannelId ? { id: { not: excludeChannelId } } : {}),
    },
  });
  return existing === null;
}

/**
 * Update the lastReadAt timestamp for a channel member.
 * Called when a user views/reads messages in a channel.
 */
export async function markChannelRead(
  channelId: string,
  userId: string
): Promise<void> {
  await prisma.channelMember.update({
    where: {
      channelId_userId: { channelId, userId },
    },
    data: {
      lastReadAt: new Date(),
    },
  });
}
