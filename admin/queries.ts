'use server';

/**
 * admin/queries.ts
 *
 * Prisma aggregate queries for the admin analytics dashboard.
 * All functions require ADMIN+ role (enforced in the route/action layer).
 */

import { prisma } from '@/shared/lib/prisma';
import type { AnalyticsData, AuditLogEntry } from './types';

// ---------------------------------------------------------------------------
// Helper: date N days ago (start of day)
// ---------------------------------------------------------------------------

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// getMessagesPerDay
// ---------------------------------------------------------------------------

/**
 * Messages sent per day for the last N days.
 * Returns array of { date: 'YYYY-MM-DD', count: number }.
 */
export async function getMessagesPerDay(
  workspaceId: string,
  days = 30
): Promise<Array<{ date: string; count: number }>> {
  const since = daysAgo(days);

  // Fetch all message timestamps for this workspace in range
  const messages = await prisma.message.findMany({
    where: {
      channel: { workspaceId },
      createdAt: { gte: since },
      isDeleted: false,
      parentId: null, // Only top-level messages
    },
    select: { createdAt: true },
  });

  // Group by date
  const countMap = new Map<string, number>();
  for (const msg of messages) {
    const date = formatDate(msg.createdAt);
    countMap.set(date, (countMap.get(date) ?? 0) + 1);
  }

  // Fill in missing days with 0
  const result: Array<{ date: string; count: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = formatDate(d);
    result.push({ date, count: countMap.get(date) ?? 0 });
  }

  return result;
}

// ---------------------------------------------------------------------------
// getActiveUsersPerDay
// ---------------------------------------------------------------------------

/**
 * Unique active users (sent at least 1 message) per day for the last N days.
 * Returns array of { date: 'YYYY-MM-DD', count: number }.
 */
export async function getActiveUsersPerDay(
  workspaceId: string,
  days = 30
): Promise<Array<{ date: string; count: number }>> {
  const since = daysAgo(days);

  const messages = await prisma.message.findMany({
    where: {
      channel: { workspaceId },
      createdAt: { gte: since },
      isDeleted: false,
    },
    select: { createdAt: true, userId: true },
  });

  // Group by date → set of userIds
  const dateUserMap = new Map<string, Set<string>>();
  for (const msg of messages) {
    const date = formatDate(msg.createdAt);
    const users = dateUserMap.get(date) ?? new Set<string>();
    users.add(msg.userId);
    dateUserMap.set(date, users);
  }

  // Build result with 0-fill
  const result: Array<{ date: string; count: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = formatDate(d);
    result.push({ date, count: dateUserMap.get(date)?.size ?? 0 });
  }

  return result;
}

// ---------------------------------------------------------------------------
// getTopChannels
// ---------------------------------------------------------------------------

/**
 * Top N channels by message count.
 * Returns array of { channelId, name, messageCount }.
 */
export async function getTopChannels(
  workspaceId: string,
  limit = 10
): Promise<Array<{ channelId: string; name: string; messageCount: number }>> {
  const channels = await prisma.channel.findMany({
    where: { workspaceId, isArchived: false },
    select: {
      id: true,
      name: true,
      _count: { select: { messages: true } },
    },
    orderBy: {
      messages: { _count: 'desc' },
    },
    take: limit,
  });

  return channels.map((c) => ({
    channelId: c.id,
    name: c.name,
    messageCount: c._count.messages,
  }));
}

// ---------------------------------------------------------------------------
// getTopUsers
// ---------------------------------------------------------------------------

/**
 * Top N users by message count (in the workspace's channels).
 * Returns array of { userId, name, image, messageCount }.
 */
export async function getTopUsers(
  workspaceId: string,
  limit = 10
): Promise<Array<{ userId: string; name: string; image: string | null; messageCount: number }>> {
  // Get all message counts per user in this workspace's channels
  const messages = await prisma.message.findMany({
    where: {
      channel: { workspaceId },
      isDeleted: false,
    },
    select: {
      userId: true,
      author: { select: { id: true, name: true, image: true } },
    },
  });

  // Count per userId
  const userMap = new Map<string, { name: string; image: string | null; count: number }>();
  for (const msg of messages) {
    const existing = userMap.get(msg.userId);
    if (existing) {
      existing.count++;
    } else {
      userMap.set(msg.userId, {
        name: msg.author.name ?? 'Unknown',
        image: msg.author.image,
        count: 1,
      });
    }
  }

  return Array.from(userMap.entries())
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, limit)
    .map(([userId, { name, image, count }]) => ({
      userId,
      name,
      image,
      messageCount: count,
    }));
}

// ---------------------------------------------------------------------------
// getTotalStats
// ---------------------------------------------------------------------------

/**
 * Total counts: messages, members, channels, files.
 */
export async function getTotalStats(workspaceId: string): Promise<{
  totalMessages: number;
  totalMembers: number;
  totalChannels: number;
  totalFiles: number;
}> {
  const [totalMessages, totalMembers, totalChannels, totalFiles] = await Promise.all([
    prisma.message.count({
      where: {
        channel: { workspaceId },
        isDeleted: false,
      },
    }),
    prisma.workspaceMember.count({
      where: { workspaceId },
    }),
    prisma.channel.count({
      where: { workspaceId, isArchived: false },
    }),
    prisma.fileAttachment.count({
      where: {
        message: {
          channel: { workspaceId },
        },
      },
    }),
  ]);

  return { totalMessages, totalMembers, totalChannels, totalFiles };
}

// ---------------------------------------------------------------------------
// getAnalyticsData
// ---------------------------------------------------------------------------

/**
 * Aggregate all analytics data for the dashboard.
 */
export async function getAnalyticsData(
  workspaceId: string,
  days = 30
): Promise<AnalyticsData> {
  const [
    messagesPerDay,
    activeUsersPerDay,
    topChannels,
    stats,
  ] = await Promise.all([
    getMessagesPerDay(workspaceId, days),
    getActiveUsersPerDay(workspaceId, days),
    getTopChannels(workspaceId, 10),
    getTotalStats(workspaceId),
  ]);

  // Compute member growth — simplified: just total for now (no daily joins data without audit log)
  const memberGrowth = messagesPerDay.map((d) => ({
    date: d.date,
    totalMembers: stats.totalMembers, // Simplified — real growth requires tracking join dates per day
  }));

  return {
    messagesPerDay,
    activeUsersPerDay,
    topChannels,
    memberGrowth,
    totalMessages: stats.totalMessages,
    totalMembers: stats.totalMembers,
    totalChannels: stats.totalChannels,
  };
}

// ---------------------------------------------------------------------------
// getAuditLog
// ---------------------------------------------------------------------------

/**
 * Paginated audit log entries for a workspace, newest first.
 * Supports cursor-based pagination.
 */
export async function getAuditLog(
  workspaceId: string,
  cursor?: string,
  limit = 50
): Promise<{ entries: AuditLogEntry[]; nextCursor: string | null }> {
  const logs = await prisma.auditLog.findMany({
    where: { workspaceId },
    include: {
      actor: { select: { id: true, name: true, image: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1, // Fetch one extra to determine if there's a next page
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = logs.length > limit;
  const entries = hasMore ? logs.slice(0, limit) : logs;
  const nextCursor = hasMore ? (entries[entries.length - 1]?.id ?? null) : null;

  return {
    entries: entries.map((log) => ({
      id: log.id,
      workspaceId: log.workspaceId,
      actorId: log.actorId,
      actor: {
        id: log.actor.id,
        name: log.actor.name ?? 'Unknown',
        image: log.actor.image,
      },
      action: log.action,
      targetId: log.targetId,
      changes: log.changes ? (JSON.parse(log.changes) as Record<string, unknown>) : null,
      createdAt: log.createdAt,
    })),
    nextCursor,
  };
}
