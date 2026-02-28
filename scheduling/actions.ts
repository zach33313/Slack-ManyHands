'use server';

/**
 * scheduling/actions.ts
 *
 * Server Actions for the scheduled messages feature.
 * Messages are stored in scheduled_messages table and delivered by server/scheduler.ts.
 */

import { prisma } from '@/shared/lib/prisma';
import { auth } from '@/auth/auth';
import type { ScheduledMessage } from './types';
import type { TiptapJSON } from '@/shared/types';

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return userId;
}

// ---------------------------------------------------------------------------
// Plain text extractor
// ---------------------------------------------------------------------------

function extractPlainText(node: any): string {
  if (node.text) return node.text;
  if (!node.content) return '';
  return node.content.map(extractPlainText).join('');
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Create a new scheduled message.
 * Returns the created ScheduledMessage.
 */
export async function createScheduledMessage(
  channelId: string,
  contentJson: TiptapJSON,
  contentPlain: string,
  scheduledFor: Date
): Promise<ScheduledMessage> {
  const userId = await requireUserId();

  if (!channelId) throw new Error('channelId is required');
  if (!contentJson) throw new Error('contentJson is required');
  if (!scheduledFor) throw new Error('scheduledFor is required');
  if (scheduledFor <= new Date()) {
    throw new Error('scheduledFor must be in the future');
  }

  // Verify user is a member of the channel
  const membership = await prisma.channelMember.findUnique({
    where: { channelId_userId: { channelId, userId } },
  });
  if (!membership) {
    throw new Error('Not a member of this channel');
  }

  const plain = contentPlain || extractPlainText(contentJson);

  const record = await prisma.scheduledMessage.create({
    data: {
      channelId,
      userId,
      contentJson: JSON.stringify(contentJson),
      contentPlain: plain,
      scheduledFor,
    },
  });

  return {
    id: record.id,
    channelId: record.channelId,
    userId: record.userId,
    content: JSON.parse(record.contentJson) as TiptapJSON,
    contentPlain: record.contentPlain,
    scheduledFor: record.scheduledFor,
    sentAt: record.sentAt,
    isCancelled: record.isCancelled,
    createdAt: record.createdAt,
  };
}

/**
 * Cancel a scheduled message.
 * Only the creator can cancel.
 */
export async function cancelScheduledMessage(id: string): Promise<void> {
  const userId = await requireUserId();

  const record = await prisma.scheduledMessage.findUnique({ where: { id } });
  if (!record) throw new Error('Scheduled message not found');
  if (record.userId !== userId) throw new Error('Not authorized to cancel this message');
  if (record.sentAt) throw new Error('Message has already been sent');
  if (record.isCancelled) throw new Error('Message is already cancelled');

  await prisma.scheduledMessage.update({
    where: { id },
    data: { isCancelled: true },
  });
}

/**
 * Get scheduled messages for the current user, optionally filtered by channel.
 */
export async function getScheduledMessages(channelId?: string): Promise<
  Array<
    ScheduledMessage & {
      channel: { id: string; name: string };
    }
  >
> {
  const userId = await requireUserId();

  const records = await prisma.scheduledMessage.findMany({
    where: {
      userId,
      isCancelled: false,
      sentAt: null,
      ...(channelId ? { channelId } : {}),
    },
    include: {
      channel: { select: { id: true, name: true } },
    },
    orderBy: { scheduledFor: 'asc' },
  });

  return records.map((r) => ({
    id: r.id,
    channelId: r.channelId,
    userId: r.userId,
    content: JSON.parse(r.contentJson) as TiptapJSON,
    contentPlain: r.contentPlain,
    scheduledFor: r.scheduledFor,
    sentAt: r.sentAt,
    isCancelled: r.isCancelled,
    createdAt: r.createdAt,
    channel: r.channel,
  }));
}

/**
 * Reschedule a scheduled message to a new time.
 * Only the creator can reschedule. New time must be in the future.
 */
export async function rescheduleMessage(
  id: string,
  newScheduledFor: Date
): Promise<ScheduledMessage> {
  const userId = await requireUserId();

  if (newScheduledFor <= new Date()) {
    throw new Error('newScheduledFor must be in the future');
  }

  const record = await prisma.scheduledMessage.findUnique({ where: { id } });
  if (!record) throw new Error('Scheduled message not found');
  if (record.userId !== userId) throw new Error('Not authorized to reschedule this message');
  if (record.sentAt) throw new Error('Message has already been sent');
  if (record.isCancelled) throw new Error('Message is cancelled');

  const updated = await prisma.scheduledMessage.update({
    where: { id },
    data: { scheduledFor: newScheduledFor },
  });

  return {
    id: updated.id,
    channelId: updated.channelId,
    userId: updated.userId,
    content: JSON.parse(updated.contentJson) as TiptapJSON,
    contentPlain: updated.contentPlain,
    scheduledFor: updated.scheduledFor,
    sentAt: updated.sentAt,
    isCancelled: updated.isCancelled,
    createdAt: updated.createdAt,
  };
}
