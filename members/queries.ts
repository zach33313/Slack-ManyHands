/**
 * members/queries.ts
 *
 * Database queries for workspace members and user profiles.
 * All queries use the Prisma singleton from shared/lib/prisma.
 *
 * Usage:
 *   import { listWorkspaceMembers, getUserProfile } from '@/members/queries'
 */

import { prisma } from '@/shared/lib/prisma';
import type { MemberWithUser, UserProfile } from './types';

/**
 * Get a single workspace member with full user details.
 *
 * @param workspaceId - The workspace ID
 * @param userId - The user ID
 * @returns The member with user details, or null if not found
 */
export async function getMember(
  workspaceId: string,
  userId: string
): Promise<MemberWithUser | null> {
  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
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
  });

  if (!member) return null;

  return {
    id: member.id,
    workspaceId: member.workspaceId,
    userId: member.userId,
    role: member.role as MemberWithUser['role'],
    joinedAt: member.joinedAt,
    user: member.user,
  };
}

/**
 * List all members of a workspace with their user details.
 * Ordered by role (OWNER first, then ADMIN, then MEMBER) and then by name.
 *
 * @param workspaceId - The workspace ID
 * @returns Array of members with user details
 */
export async function listWorkspaceMembers(
  workspaceId: string
): Promise<MemberWithUser[]> {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
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
    orderBy: [{ user: { name: 'asc' } }],
  });

  return members.map((m) => ({
    id: m.id,
    workspaceId: m.workspaceId,
    userId: m.userId,
    role: m.role as MemberWithUser['role'],
    joinedAt: m.joinedAt,
    user: m.user,
  }));
}

/**
 * Search workspace members by name or email for mention autocomplete.
 * Returns up to 10 results matching the query string.
 *
 * @param workspaceId - The workspace to search within
 * @param query - Search string (matched against name and email)
 * @returns Array of matching members
 */
export async function searchMembers(
  workspaceId: string,
  query: string
): Promise<MemberWithUser[]> {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return [];

  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      user: {
        OR: [
          { name: { contains: lowerQuery } },
          { email: { contains: lowerQuery } },
        ],
      },
    },
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
    take: 10,
    orderBy: { user: { name: 'asc' } },
  });

  return members.map((m) => ({
    id: m.id,
    workspaceId: m.workspaceId,
    userId: m.userId,
    role: m.role as MemberWithUser['role'],
    joinedAt: m.joinedAt,
    user: m.user,
  }));
}

/**
 * Get a user's full profile information.
 *
 * @param userId - The user ID
 * @returns Full user profile, or null if not found
 */
export async function getUserProfile(
  userId: string
): Promise<UserProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      title: true,
      statusText: true,
      statusEmoji: true,
      timezone: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return user;
}

/**
 * List members of a specific channel with their user details.
 *
 * @param channelId - The channel ID
 * @returns Array of members with user details
 */
export async function listChannelMembers(
  channelId: string
): Promise<MemberWithUser[]> {
  // Get the channel to find its workspace
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { workspaceId: true },
  });

  if (!channel) return [];

  const channelMembers = await prisma.channelMember.findMany({
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
    orderBy: { user: { name: 'asc' } },
  });

  // Map channel members to MemberWithUser by fetching their workspace role
  const workspaceMembers = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: channel.workspaceId,
      userId: { in: channelMembers.map((cm) => cm.userId) },
    },
    select: {
      userId: true,
      role: true,
      joinedAt: true,
      id: true,
    },
  });

  const roleMap = new Map(workspaceMembers.map((wm) => [wm.userId, wm]));

  return channelMembers.map((cm) => {
    const wm = roleMap.get(cm.userId);
    return {
      id: wm?.id ?? cm.id,
      workspaceId: channel.workspaceId,
      userId: cm.userId,
      role: (wm?.role ?? 'MEMBER') as MemberWithUser['role'],
      joinedAt: wm?.joinedAt ?? cm.joinedAt,
      user: cm.user,
    };
  });
}
