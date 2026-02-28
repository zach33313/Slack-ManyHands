'use server';

/**
 * notifications/actions.ts
 *
 * Server Actions for the notifications domain.
 *
 * - createNotification: creates a notification and emits to Socket.IO
 * - markRead: marks a single notification as read
 * - markAllRead: marks all notifications for the current user as read
 * - updateChannelNotifyPref: updates per-channel notification preferences
 *
 * Usage:
 *   import { createNotification, markRead } from '@/notifications/actions'
 */

import { auth } from '@/auth/auth';
import { prisma } from '@/shared/lib/prisma';
import { NotificationType } from '@/shared/types';
import type { Notification, NotificationPayload } from '@/shared/types';
import { truncate } from '@/shared/lib/utils';
import {
  markNotificationRead,
  markAllRead as markAllReadQuery,
} from './queries';
import type { NotifyPref } from './types';

// ---------------------------------------------------------------------------
// createNotification — creates notification in DB + emits via Socket.IO
// ---------------------------------------------------------------------------

/**
 * Creates a notification record in the database and emits a `notification:new`
 * event via Socket.IO to the recipient's personal room.
 *
 * Called by message handlers when:
 * - A message contains an @mention → MENTION notification
 * - A DM is received → DM notification
 * - A thread reply arrives → THREAD_REPLY for thread participants
 * - A reaction is added → REACTION notification
 *
 * @param type - The notification type
 * @param recipientUserId - User who receives the notification
 * @param payload - The notification payload (varies by type)
 * @param actorId - The user who triggered the notification (sender)
 */
export async function createNotification(
  type: NotificationType,
  recipientUserId: string,
  payload: NotificationPayload,
  actorId: string
): Promise<void> {
  // Don't notify a user about their own actions
  if (recipientUserId === actorId) {
    return;
  }

  // Check channel notification preferences
  const channelId = 'channelId' in payload ? payload.channelId : null;
  if (channelId) {
    const membership = await prisma.channelMember.findUnique({
      where: {
        channelId_userId: {
          channelId,
          userId: recipientUserId,
        },
      },
    });

    if (membership) {
      const pref = membership.notifyPref;
      // If user has opted out of all notifications for this channel
      if (pref === 'NOTHING') {
        return;
      }
      // If user only wants mentions, skip DM and THREAD_REPLY notifications
      if (pref === 'MENTIONS' && type !== NotificationType.MENTION) {
        return;
      }
    }
  }

  // Create the notification record
  const record = await prisma.notification.create({
    data: {
      userId: recipientUserId,
      actorId,
      type,
      payload: JSON.stringify(payload),
    },
    include: {
      actor: {
        select: { id: true, name: true, image: true },
      },
    },
  });

  // Build the typed Notification object for the Socket.IO event
  const notification: Notification = {
    id: record.id,
    userId: record.userId,
    type: record.type as NotificationType,
    payload: payload,
    readAt: null,
    createdAt: record.createdAt,
  };

  // Emit via Socket.IO to the user's personal room
  // Dynamic import to avoid pulling socket server code into client bundles
  try {
    const { emitToUser } = await import('@/server/socket-emitter');
    emitToUser(recipientUserId, 'notification:new', notification);
  } catch {
    // Socket.IO may not be available during tests or when running
    // outside the custom server. Log and continue.
    console.warn(
      `[notifications] Could not emit notification:new to user ${recipientUserId} — Socket.IO may not be initialized`
    );
  }
}

// ---------------------------------------------------------------------------
// Helper: create notifications for @mentions in a message
// ---------------------------------------------------------------------------

/**
 * Scans message content for @mentions and creates MENTION notifications
 * for each mentioned user.
 *
 * @param messageId - The message containing mentions
 * @param channelId - The channel where the message was posted
 * @param workspaceId - The workspace
 * @param senderId - The user who sent the message
 * @param senderName - Display name of the sender
 * @param contentPlain - Plain text content for preview
 * @param mentionedUserIds - Array of user IDs that were @mentioned
 */
export async function createMentionNotifications(
  messageId: string,
  channelId: string,
  workspaceId: string,
  senderId: string,
  contentPlain: string,
  mentionedUserIds: string[]
): Promise<void> {
  const preview = truncate(contentPlain, 100);

  const promises = mentionedUserIds.map((userId) =>
    createNotification(
      NotificationType.MENTION,
      userId,
      {
        messageId,
        channelId,
        workspaceId,
        actorId: senderId,
        preview,
      },
      senderId
    )
  );

  await Promise.allSettled(promises);
}

// ---------------------------------------------------------------------------
// Helper: create DM notification
// ---------------------------------------------------------------------------

/**
 * Creates a DM notification for the recipient of a direct message.
 *
 * @param messageId - The DM message ID
 * @param channelId - The DM channel ID
 * @param workspaceId - The workspace
 * @param senderId - The user who sent the DM
 * @param recipientUserId - The DM recipient
 * @param contentPlain - Plain text content for preview
 */
export async function createDMNotification(
  messageId: string,
  channelId: string,
  workspaceId: string,
  senderId: string,
  recipientUserId: string,
  contentPlain: string
): Promise<void> {
  const preview = truncate(contentPlain, 100);

  await createNotification(
    NotificationType.DM,
    recipientUserId,
    {
      messageId,
      channelId,
      workspaceId,
      actorId: senderId,
      preview,
    },
    senderId
  );
}

// ---------------------------------------------------------------------------
// Helper: create thread reply notifications
// ---------------------------------------------------------------------------

/**
 * Creates THREAD_REPLY notifications for all participants in a thread
 * (excluding the person who just replied).
 *
 * Thread participants are: the original message author + anyone who has
 * previously replied to the thread.
 *
 * @param messageId - The new reply message ID
 * @param parentMessageId - The root thread message ID
 * @param channelId - The channel containing the thread
 * @param workspaceId - The workspace
 * @param senderId - The user who posted the reply
 * @param contentPlain - Plain text content for preview
 */
export async function createThreadReplyNotifications(
  messageId: string,
  parentMessageId: string,
  channelId: string,
  workspaceId: string,
  senderId: string,
  contentPlain: string
): Promise<void> {
  const preview = truncate(contentPlain, 100);

  // Find the parent message author
  const parentMessage = await prisma.message.findUnique({
    where: { id: parentMessageId },
    select: { userId: true },
  });

  // Find all unique users who have replied in this thread
  const threadReplies = await prisma.message.findMany({
    where: {
      parentId: parentMessageId,
      isDeleted: false,
    },
    select: { userId: true },
    distinct: ['userId'],
  });

  // Collect unique participant IDs (parent author + all repliers)
  const participantIds = new Set<string>();
  if (parentMessage) {
    participantIds.add(parentMessage.userId);
  }
  for (const reply of threadReplies) {
    participantIds.add(reply.userId);
  }

  // Remove the sender — don't notify yourself
  participantIds.delete(senderId);

  const promises = Array.from(participantIds).map((userId) =>
    createNotification(
      NotificationType.THREAD_REPLY,
      userId,
      {
        messageId,
        parentMessageId,
        channelId,
        workspaceId,
        actorId: senderId,
        preview,
      },
      senderId
    )
  );

  await Promise.allSettled(promises);
}

// ---------------------------------------------------------------------------
// Helper: create reaction notification
// ---------------------------------------------------------------------------

/**
 * Creates a REACTION notification for the message author when someone
 * reacts to their message.
 *
 * @param messageId - The message that was reacted to
 * @param channelId - The channel containing the message
 * @param workspaceId - The workspace
 * @param reactorId - The user who added the reaction
 * @param messageAuthorId - The author of the message being reacted to
 * @param emoji - The emoji used for the reaction
 */
export async function createReactionNotification(
  messageId: string,
  channelId: string,
  workspaceId: string,
  reactorId: string,
  messageAuthorId: string,
  emoji: string
): Promise<void> {
  await createNotification(
    NotificationType.REACTION,
    messageAuthorId,
    {
      messageId,
      channelId,
      workspaceId,
      actorId: reactorId,
      emoji,
    },
    reactorId
  );
}

// ---------------------------------------------------------------------------
// markRead — marks a single notification as read (with auth)
// ---------------------------------------------------------------------------

/**
 * Marks a single notification as read for the current authenticated user.
 *
 * @param notificationId - The notification to mark as read
 * @returns true if marked, false if not found or unauthorized
 */
export async function markRead(notificationId: string): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  return markNotificationRead(notificationId, session.user.id);
}

// ---------------------------------------------------------------------------
// markAllRead — marks all notifications as read (with auth)
// ---------------------------------------------------------------------------

/**
 * Marks all notifications for the current authenticated user as read.
 *
 * @returns The number of notifications marked as read
 */
export async function markAllNotificationsRead(): Promise<number> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  return markAllReadQuery(session.user.id);
}

// ---------------------------------------------------------------------------
// updateChannelNotifyPref — update per-channel notification preference
// ---------------------------------------------------------------------------

/**
 * Updates the notification preference for the current user on a specific channel.
 *
 * @param channelId - The channel to update preferences for
 * @param pref - The new notification preference
 */
export async function updateChannelNotifyPref(
  channelId: string,
  pref: NotifyPref
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const userId = session.user.id;

  // Verify the user is a member of this channel
  const membership = await prisma.channelMember.findUnique({
    where: {
      channelId_userId: {
        channelId,
        userId,
      },
    },
  });

  if (!membership) {
    throw new Error('Not a member of this channel');
  }

  await prisma.channelMember.update({
    where: { id: membership.id },
    data: { notifyPref: pref },
  });
}
