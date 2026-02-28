/**
 * notifications/queries.ts
 *
 * Database queries for the notifications domain.
 * All functions take a userId and interact with the Prisma Notification model.
 *
 * Usage:
 *   import { getNotifications, getUnreadCount } from '@/notifications/queries'
 */

import { prisma } from '@/shared/lib/prisma';
import { NotificationType } from '@/shared/types';
import type { NotificationWithDetails, GetNotificationsOptions } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// ---------------------------------------------------------------------------
// Helper: resolve notification payload into display fields
// ---------------------------------------------------------------------------

interface ParsedPayload {
  messageId: string | null;
  channelId: string | null;
  actorId: string | null;
  preview: string;
}

function parsePayload(payloadStr: string): ParsedPayload {
  try {
    const payload = JSON.parse(payloadStr);
    return {
      messageId: payload.messageId ?? null,
      channelId: payload.channelId ?? null,
      actorId: payload.actorId ?? null,
      preview: payload.preview ?? payload.emoji ?? '',
    };
  } catch {
    return { messageId: null, channelId: null, actorId: null, preview: '' };
  }
}

// ---------------------------------------------------------------------------
// getNotifications — paginated list of notifications with sender info
// ---------------------------------------------------------------------------

/**
 * Fetches a paginated list of notifications for a user, newest first.
 * Hydrates sender name/image and channel name from the database.
 *
 * @param userId - The user whose notifications to fetch
 * @param options - Pagination and filter options
 * @returns Array of NotificationWithDetails and whether there are more
 */
export async function getNotifications(
  userId: string,
  options: GetNotificationsOptions = {}
): Promise<{ notifications: NotificationWithDetails[]; hasMore: boolean }> {
  const { unreadOnly = false, cursor, limit: rawLimit } = options;
  const limit = Math.min(rawLimit ?? DEFAULT_LIMIT, MAX_LIMIT);

  // Build where clause
  const where: Record<string, unknown> = { userId };
  if (unreadOnly) {
    where.readAt = null;
  }
  if (cursor) {
    const cursorNotification = await prisma.notification.findUnique({
      where: { id: cursor },
      select: { createdAt: true },
    });
    if (!cursorNotification) {
      // Cursor notification was deleted — return empty result to avoid
      // returning all notifications from the beginning
      return { notifications: [], hasMore: false };
    }
    where.createdAt = { lt: cursorNotification.createdAt };
  }

  const rows = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    include: {
      actor: {
        select: { id: true, name: true, image: true },
      },
    },
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  // Collect all unique channel IDs from payloads for batch lookup
  const channelIds = new Set<string>();
  const parsedPayloads = new Map<string, ParsedPayload>();

  for (const row of items) {
    const parsed = parsePayload(row.payload);
    parsedPayloads.set(row.id, parsed);
    if (parsed.channelId) {
      channelIds.add(parsed.channelId);
    }
  }

  // Batch fetch channel names
  const channelMap = new Map<string, string>();
  if (channelIds.size > 0) {
    const channels = await prisma.channel.findMany({
      where: { id: { in: Array.from(channelIds) } },
      select: { id: true, name: true },
    });
    for (const ch of channels) {
      channelMap.set(ch.id, ch.name);
    }
  }

  // Map to NotificationWithDetails
  const notifications: NotificationWithDetails[] = items.map((row) => {
    const parsed = parsedPayloads.get(row.id)!;
    return {
      id: row.id,
      type: row.type as NotificationType,
      userId: row.userId,
      messageId: parsed.messageId,
      channelId: parsed.channelId,
      channelName: parsed.channelId ? (channelMap.get(parsed.channelId) ?? null) : null,
      senderName: row.actor?.name ?? 'Unknown',
      senderImage: row.actor?.image ?? null,
      preview: parsed.preview,
      isRead: row.readAt !== null,
      createdAt: row.createdAt,
    };
  });

  return { notifications, hasMore };
}

// ---------------------------------------------------------------------------
// getUnreadCount — count of unread notifications for a user
// ---------------------------------------------------------------------------

/**
 * Returns the number of unread notifications for the given user.
 *
 * @param userId - The user whose unread count to fetch
 * @returns Number of unread notifications
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: {
      userId,
      readAt: null,
    },
  });
}

// ---------------------------------------------------------------------------
// markNotificationRead — mark a single notification as read
// ---------------------------------------------------------------------------

/**
 * Marks a single notification as read. Verifies ownership.
 *
 * @param notificationId - The notification to mark
 * @param userId - The user making the request (ownership check)
 * @returns true if successfully marked, false if not found or not owned
 */
export async function markNotificationRead(
  notificationId: string,
  userId: string
): Promise<boolean> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification || notification.userId !== userId) {
    return false;
  }

  if (notification.readAt !== null) {
    // Already read
    return true;
  }

  await prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });

  return true;
}

// ---------------------------------------------------------------------------
// markAllRead — mark all of a user's notifications as read
// ---------------------------------------------------------------------------

/**
 * Marks all unread notifications for a user as read.
 *
 * @param userId - The user whose notifications to mark
 * @returns The number of notifications that were marked read
 */
export async function markAllRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: {
      userId,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });

  return result.count;
}
