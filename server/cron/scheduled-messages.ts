/**
 * server/cron/scheduled-messages.ts
 *
 * Cron job that polls for scheduled messages due for delivery and sends them.
 *
 * Runs every 60 seconds (every minute). Each tick:
 *   1. Queries ScheduledMessage where sentAt IS NULL, isCancelled=false, scheduledFor <= now()
 *   2. For each due message: atomically claims it via updateMany, creates a real Message record,
 *      emits `message:new` to the channel room, and sends notifications
 *   3. Errors per-message are isolated so one failure doesn't block others
 *
 * Usage:
 *   import { startScheduledMessagesCron } from './server/cron/scheduled-messages'
 *   startScheduledMessagesCron()  // call after Socket.IO is initialized
 */

import cron from 'node-cron';
import { prisma } from '../../shared/lib/prisma';
import { getIO } from '../socket-emitter';
import { channelRoom, userRoom } from '../../shared/lib/constants';
import type { MessageWithMeta, ReactionGroup, NotificationType } from '../../shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Groups raw reaction records into ReactionGroup[] (emoji → count + userIds).
 */
function groupReactions(
  reactions: Array<{ emoji: string; userId: string }>
): ReactionGroup[] {
  const groups = new Map<string, string[]>();
  for (const r of reactions) {
    const existing = groups.get(r.emoji) ?? [];
    existing.push(r.userId);
    groups.set(r.emoji, existing);
  }
  return Array.from(groups.entries()).map(([emoji, userIds]) => ({
    emoji,
    count: userIds.length,
    userIds,
  }));
}

/**
 * Fetches a message with all hydrated relations needed for MessageWithMeta.
 */
async function buildMessageWithMeta(messageId: string): Promise<MessageWithMeta | null> {
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      author: {
        select: { id: true, name: true, image: true },
      },
      files: {
        select: {
          id: true,
          name: true,
          url: true,
          size: true,
          mimeType: true,
          width: true,
          height: true,
        },
      },
      reactions: {
        select: { emoji: true, userId: true },
      },
    },
  });

  if (!msg) return null;

  let content: Record<string, unknown>;
  try {
    content = JSON.parse(msg.contentJson) as Record<string, unknown>;
  } catch {
    content = { type: 'doc', content: [] };
  }

  return {
    id: msg.id,
    channelId: msg.channelId,
    userId: msg.userId,
    content: content as unknown as MessageWithMeta['content'],
    contentPlain: msg.contentPlain,
    parentId: msg.parentId,
    replyCount: msg.replyCount,
    isEdited: msg.isEdited,
    isDeleted: msg.isDeleted,
    editedAt: msg.editedAt,
    deletedAt: msg.deletedAt,
    createdAt: msg.createdAt,
    author: {
      id: msg.author.id,
      name: msg.author.name ?? 'Unknown',
      image: msg.author.image,
    },
    files: msg.files.map((f) => ({
      id: f.id,
      name: f.name,
      url: f.url,
      size: f.size,
      mimeType: f.mimeType,
      width: f.width,
      height: f.height,
    })),
    reactions: groupReactions(msg.reactions),
  };
}

/**
 * Extracts user IDs from mention nodes in a Tiptap JSON document.
 */
function extractMentionedUserIds(content: Record<string, unknown>): string[] {
  const ids: string[] = [];

  function walk(node: Record<string, unknown>): void {
    if (
      node.type === 'mention' &&
      node.attrs &&
      typeof (node.attrs as Record<string, unknown>).id === 'string'
    ) {
      ids.push((node.attrs as Record<string, unknown>).id as string);
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child as Record<string, unknown>);
      }
    }
  }

  walk(content);
  return [...new Set(ids)];
}

// ---------------------------------------------------------------------------
// Cron job
// ---------------------------------------------------------------------------

/**
 * Starts the scheduled-message delivery cron job.
 *
 * Must be called after the Socket.IO server is initialized (so getIO() works).
 * Runs every minute using node-cron schedule `* * * * *`.
 */
export function startScheduledMessagesCron(): void {
  // Run at the start of every minute
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    console.log(`[cron:scheduled-messages] Tick at ${now.toISOString()}`);

    let dueMessages: Array<{
      id: string;
      channelId: string;
      userId: string;
      contentJson: string;
      contentPlain: string;
    }>;

    try {
      dueMessages = await prisma.scheduledMessage.findMany({
        where: {
          sentAt: null,
          isCancelled: false,
          scheduledFor: { lte: now },
        },
        select: {
          id: true,
          channelId: true,
          userId: true,
          contentJson: true,
          contentPlain: true,
        },
      });
    } catch (err) {
      console.error('[cron:scheduled-messages] Failed to query scheduled messages:', err);
      return;
    }

    if (dueMessages.length === 0) {
      return;
    }

    console.log(
      `[cron:scheduled-messages] Processing ${dueMessages.length} due message(s)`
    );

    for (const sm of dueMessages) {
      try {
        // Atomically claim this specific message by setting sentAt only if it is
        // still null. If a concurrent cron tick has already claimed it (set
        // sentAt), updateMany returns count=0 and we skip to avoid duplicates.
        const claimed = await prisma.scheduledMessage.updateMany({
          where: { id: sm.id, sentAt: null },
          data: { sentAt: now },
        });
        if (claimed.count === 0) {
          console.warn(
            `[cron:scheduled-messages] Scheduled message ${sm.id} already claimed by another tick — skipping`
          );
          continue;
        }

        // 1. Create real message record
        const message = await prisma.message.create({
          data: {
            channelId: sm.channelId,
            userId: sm.userId,
            contentJson: sm.contentJson,
            contentPlain: sm.contentPlain,
          },
        });

        // 2. Fetch full message with relations for the socket event
        const fullMessage = await buildMessageWithMeta(message.id);
        if (!fullMessage) {
          console.warn(
            `[cron:scheduled-messages] Could not load message ${message.id} after creation`
          );
          continue;
        }

        // 3. Emit to channel room
        try {
          const io = getIO();
          io.to(channelRoom(sm.channelId)).emit('message:new', fullMessage);
        } catch (emitErr) {
          // Socket.IO may not be ready yet — log but don't fail
          console.warn(
            `[cron:scheduled-messages] Could not emit message:new for scheduled message ${sm.id}:`,
            emitErr
          );
        }

        // 4. Notifications — isolated so failures don't block delivery
        try {
          const channelInfo = await prisma.channel.findUnique({
            where: { id: sm.channelId },
            select: { workspaceId: true, type: true },
          });

          if (channelInfo) {
            const { workspaceId } = channelInfo;
            const preview = sm.contentPlain.slice(0, 100);

            // Parse content JSON for mention extraction
            let contentDoc: Record<string, unknown>;
            try {
              contentDoc = JSON.parse(sm.contentJson) as Record<string, unknown>;
            } catch {
              contentDoc = { type: 'doc', content: [] };
            }
            const mentionedUserIds = extractMentionedUserIds(contentDoc);

            // 4a. @mention notifications
            for (const mentionedId of mentionedUserIds) {
              if (mentionedId === sm.userId) continue;
              try {
                const notification = await prisma.notification.create({
                  data: {
                    userId: mentionedId,
                    actorId: sm.userId,
                    type: 'MENTION',
                    payload: JSON.stringify({
                      messageId: message.id,
                      channelId: sm.channelId,
                      workspaceId,
                      actorId: sm.userId,
                      preview,
                    }),
                  },
                });
                try {
                  const io = getIO();
                  io.to(userRoom(mentionedId)).emit('notification:new', {
                    id: notification.id,
                    userId: notification.userId,
                    type: notification.type as NotificationType,
                    payload: JSON.parse(notification.payload),
                    readAt: notification.readAt,
                    createdAt: notification.createdAt,
                  });
                } catch { /* IO not ready */ }
              } catch { /* notification failure is non-fatal */ }
            }

            // 4b. DM / GROUP_DM notifications for all other members
            if (channelInfo.type === 'DM' || channelInfo.type === 'GROUP_DM') {
              const dmMembers = await prisma.channelMember.findMany({
                where: { channelId: sm.channelId },
                select: { userId: true },
              });
              for (const member of dmMembers) {
                if (member.userId === sm.userId) continue;
                if (mentionedUserIds.includes(member.userId)) continue;
                try {
                  const notification = await prisma.notification.create({
                    data: {
                      userId: member.userId,
                      actorId: sm.userId,
                      type: 'DM',
                      payload: JSON.stringify({
                        messageId: message.id,
                        channelId: sm.channelId,
                        workspaceId,
                        actorId: sm.userId,
                        preview,
                      }),
                    },
                  });
                  try {
                    const io = getIO();
                    io.to(userRoom(member.userId)).emit('notification:new', {
                      id: notification.id,
                      userId: notification.userId,
                      type: notification.type as NotificationType,
                      payload: JSON.parse(notification.payload),
                      readAt: notification.readAt,
                      createdAt: notification.createdAt,
                    });
                  } catch { /* IO not ready */ }
                } catch { /* non-fatal */ }
              }
            }

            // 4c. unread:update for all other channel members
            const allMembers = await prisma.channelMember.findMany({
              where: { channelId: sm.channelId },
              select: { userId: true, lastReadAt: true },
            });
            const otherMembers = allMembers.filter((m) => m.userId !== sm.userId);
            await Promise.all(
              otherMembers.map(async (member) => {
                const where: Record<string, unknown> = {
                  channelId: sm.channelId,
                  isDeleted: false,
                  userId: { not: member.userId },
                };
                if (member.lastReadAt) {
                  where.createdAt = { gt: member.lastReadAt };
                }
                const unreadCount = await prisma.message.count({ where });
                const hasMention = mentionedUserIds.includes(member.userId);
                try {
                  const io = getIO();
                  io.to(userRoom(member.userId)).emit('unread:update', {
                    channelId: sm.channelId,
                    unreadCount,
                    hasMention,
                  });
                } catch { /* IO not ready */ }
              })
            );
          }
        } catch (notifErr) {
          console.warn(
            `[cron:scheduled-messages] Notification error for message ${message.id}:`,
            notifErr
          );
        }

        console.log(
          `[cron:scheduled-messages] Delivered scheduled message ${sm.id} → message ${message.id} in channel ${sm.channelId}`
        );
      } catch (err) {
        // Per-message error isolation: log and continue to the next message
        console.error(
          `[cron:scheduled-messages] Error processing scheduled message ${sm.id}:`,
          err
        );
      }
    }
  });

  console.log('[cron:scheduled-messages] Scheduled messages cron started (runs every 60 seconds)');
}
