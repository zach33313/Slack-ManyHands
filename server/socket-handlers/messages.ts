/**
 * server/socket-handlers/messages.ts
 *
 * Message event handlers for Socket.IO.
 *
 * Handles all message-related real-time operations:
 * - message:send   — Create a new message (or thread reply) in the DB, emit to channel
 * - message:edit   — Edit own message, emit update to channel
 * - message:delete — Soft-delete own message, emit deletion to channel
 * - message:react  — Add emoji reaction, emit updated reactions snapshot
 * - message:unreact — Remove emoji reaction, emit updated reactions snapshot
 *
 * All message mutations go through Prisma and emit Socket.IO events to the
 * appropriate channel room so all subscribed clients receive real-time updates.
 */

import type { Socket } from 'socket.io';
import { prisma } from '../../shared/lib/prisma';
import { channelRoom, userRoom } from '../../shared/lib/constants';
import type { MessageWithMeta, MessagePoll, ReactionGroup, NotificationType } from '../../shared/types';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../../shared/types/socket';
import { executeWorkflowsForEvent } from '../../workflows/engine';

type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * Fetches a message with all hydrated relations needed for MessageWithMeta.
 * Used after create/update operations to get the full response shape.
 */
async function getMessageWithMeta(messageId: string): Promise<MessageWithMeta | null> {
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
        select: {
          emoji: true,
          userId: true,
        },
      },
      poll: {
        include: {
          votes: {
            select: { userId: true, option: true },
          },
        },
      },
    },
  });

  if (!msg) return null;

  // Group reactions by emoji
  const reactionGroups = groupReactions(msg.reactions);

  // Parse contentJson from string to object
  let content: Record<string, unknown>;
  try {
    content = JSON.parse(msg.contentJson);
  } catch {
    content = { type: 'doc', content: [] };
  }

  // Build poll with aggregated vote groups if present
  let poll: MessagePoll | undefined;
  if (msg.poll) {
    const voteMap = new Map<string, string[]>();
    for (const v of msg.poll.votes) {
      const arr = voteMap.get(v.option) ?? [];
      arr.push(v.userId);
      voteMap.set(v.option, arr);
    }
    const totalVotes = msg.poll.votes.length;
    const options: string[] = JSON.parse(msg.poll.options) as string[];
    const votes = options.map((opt) => {
      const userIds = voteMap.get(opt) ?? [];
      return {
        option: opt,
        count: userIds.length,
        userIds,
        percentage: totalVotes > 0 ? Math.round((userIds.length / totalVotes) * 100) : 0,
      };
    });
    poll = {
      id: msg.poll.id,
      messageId: msg.poll.messageId,
      question: msg.poll.question,
      options,
      isActive: msg.poll.isActive,
      multiChoice: msg.poll.multiChoice,
      endsAt: msg.poll.endsAt,
      votes,
      totalVotes,
      createdAt: msg.poll.createdAt,
    };
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
      name: msg.author.name || 'Unknown',
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
    reactions: reactionGroups,
    poll,
  };
}

/**
 * Groups raw reaction records into ReactionGroup[] (emoji → count + userIds).
 */
function groupReactions(
  reactions: Array<{ emoji: string; userId: string }>
): ReactionGroup[] {
  const groups = new Map<string, string[]>();
  for (const r of reactions) {
    const existing = groups.get(r.emoji) || [];
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
 * Fetches the current reaction groups for a message.
 */
async function getReactionGroups(messageId: string): Promise<ReactionGroup[]> {
  const reactions = await prisma.reaction.findMany({
    where: { messageId },
    select: { emoji: true, userId: true },
  });
  return groupReactions(reactions);
}

/**
 * Extracts plain text from a Tiptap JSON document.
 * Recursively walks the node tree and concatenates all text nodes,
 * adding newlines after block-level nodes (matches messages/actions.ts behaviour).
 */
function extractPlainText(content: Record<string, unknown>): string {
  const blockTypes = new Set(['paragraph', 'heading', 'blockquote', 'codeBlock', 'listItem']);

  function walk(node: Record<string, unknown>): string {
    if (typeof node.text === 'string') return node.text;
    if (node.type === 'hardBreak') return '\n';
    if (Array.isArray(node.content)) {
      const inner = (node.content as Record<string, unknown>[]).map(walk).join('');
      return blockTypes.has(node.type as string) ? inner + '\n' : inner;
    }
    return '';
  }

  const rootContent = Array.isArray(content.content)
    ? (content.content as Record<string, unknown>[])
    : [];
  return rootContent.map(walk).join('').trim();
}

/**
 * Extracts user IDs from mention nodes in a Tiptap JSON document.
 */
function extractMentionedUserIds(content: Record<string, unknown>): string[] {
  const ids: string[] = [];

  function walk(node: Record<string, unknown>): void {
    if (node.type === 'mention' && node.attrs && typeof (node.attrs as Record<string, unknown>).id === 'string') {
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

/**
 * Registers message event handlers on a connected socket.
 */
export function registerMessageHandlers(socket: AppSocket): void {
  const userId = socket.data.userId;

  /**
   * message:send — Create a new message or thread reply.
   *
   * Creates the message in the database via Prisma, includes the author info
   * in the response, and emits `message:new` to the channel room.
   * If parentId is set, also emits `thread:reply` and increments the parent's replyCount.
   */
  socket.on('message:send', async ({ channelId, content, parentId, fileIds, poll: pollInput, audioMetadata }, ack) => {
    try {
      if (!channelId || !content) {
        console.warn(`[messages] message:send missing required fields from user ${userId}`);
        ack?.({ ok: false, error: 'Missing required fields' });
        return;
      }

      // Verify the sender is a member of the channel
      const membership = await prisma.channelMember.findUnique({
        where: {
          channelId_userId: { channelId, userId },
        },
      });

      if (!membership) {
        console.warn(`[messages] message:send — user ${userId} is not a member of channel ${channelId}`);
        ack?.({ ok: false, error: 'You are not a member of this channel' });
        return;
      }

      // Validate parentId if this is a thread reply
      if (parentId) {
        const parentMessage = await prisma.message.findUnique({
          where: { id: parentId },
          select: { channelId: true, isDeleted: true },
        });
        if (!parentMessage || parentMessage.channelId !== channelId || parentMessage.isDeleted) {
          console.warn(
            `[messages] message:send — invalid parentId ${parentId} for channel ${channelId} from user ${userId}`
          );
          ack?.({ ok: false, error: 'Invalid parent message' });
          return;
        }
      }

      // If audioMetadata was sent as a top-level payload field and the content
      // paragraph does not already carry it in attrs, merge it in so the stored
      // contentJson always has the full voice-message metadata.
      let enrichedContent = content;
      if (audioMetadata) {
        const doc = content as { type?: string; content?: Array<{ type?: string; attrs?: Record<string, unknown> }> };
        if (Array.isArray(doc.content) && doc.content.length > 0) {
          const firstPara = doc.content[0];
          if (firstPara.type === 'paragraph' && !firstPara.attrs?.audioMetadata) {
            enrichedContent = {
              ...doc,
              content: [
                { ...firstPara, attrs: { ...(firstPara.attrs ?? {}), audioMetadata } },
                ...doc.content.slice(1),
              ],
            } as Record<string, unknown>;
          }
        }
      }

      const contentJson = JSON.stringify(enrichedContent);
      const contentPlain = extractPlainText(enrichedContent);

      // Create the message in the database
      const message = await prisma.message.create({
        data: {
          channelId,
          userId,
          contentJson,
          contentPlain,
          parentId: parentId || null,
        },
      });

      // If fileIds provided, associate files with this message
      if (fileIds && fileIds.length > 0) {
        await prisma.fileAttachment.updateMany({
          where: {
            id: { in: fileIds },
            userId, // Only update files owned by this user
          },
          data: { messageId: message.id },
        });
      }

      // If a poll was included, create it linked to this message.
      // Trim and deduplicate options (consistent with polls/actions.ts) to
      // prevent split votes from duplicate or whitespace-padded entries.
      if (pollInput && pollInput.question && Array.isArray(pollInput.options) && pollInput.options.length >= 2) {
        try {
          const dedupedOptions = [
            ...new Set(pollInput.options.map((o: string) => o.trim()).filter(Boolean)),
          ];
          if (dedupedOptions.length >= 2) {
            await prisma.poll.create({
              data: {
                messageId: message.id,
                question: pollInput.question.trim(),
                options: JSON.stringify(dedupedOptions),
                endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7-day default
              },
            });
          }
        } catch (e) {
          console.error('[messages] Failed to create poll for message', message.id, e);
        }
      }

      // If this is a thread reply, increment the parent message's replyCount
      if (parentId) {
        await prisma.message.update({
          where: { id: parentId },
          data: { replyCount: { increment: 1 } },
        });
      }

      // Fetch the full message with author and relations
      const fullMessage = await getMessageWithMeta(message.id);
      if (!fullMessage) {
        ack?.({ ok: false, error: 'Failed to fetch created message' });
        return;
      }

      // Emit to all sockets in the channel room.
      // Thread replies must NOT appear in the main channel feed, so only emit
      // `message:new` for top-level messages. Replies get `thread:reply` only.
      const room = channelRoom(channelId);
      if (parentId) {
        socket.nsp.to(room).emit('thread:reply', fullMessage);
      } else {
        socket.nsp.to(room).emit('message:new', fullMessage);
      }

      // Acknowledge success — the message is created and broadcast.
      ack?.({ ok: true });

      // --- Notifications ---
      const notificationPreview = extractPlainText(content).slice(0, 100);

      // Fetch channel info for workspaceId and type
      const channelInfo = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { workspaceId: true, type: true },
      });

      if (channelInfo) {
        const workspaceId = channelInfo.workspaceId;

        // 1. @mention notifications
        const mentionedUserIds = extractMentionedUserIds(content);
        for (const mentionedId of mentionedUserIds) {
          if (mentionedId === userId) continue; // Don't notify self
          try {
            const mentionPayload = {
              messageId: message.id,
              channelId,
              workspaceId,
              actorId: userId,
              preview: notificationPreview,
            };
            const notification = await prisma.notification.create({
              data: {
                userId: mentionedId,
                type: 'MENTION',
                payload: JSON.stringify(mentionPayload),
              },
            });
            socket.nsp.to(userRoom(mentionedId)).emit('notification:new', {
              id: notification.id,
              userId: mentionedId,
              type: 'MENTION' as NotificationType,
              payload: mentionPayload as any,
              readAt: null,
              createdAt: notification.createdAt,
            });
          } catch (e) {
            console.error(`[messages] Failed to create MENTION notification for ${mentionedId}:`, e);
          }
        }

        // 2. DM notifications
        if (channelInfo.type === 'DM' || channelInfo.type === 'GROUP_DM') {
          const dmMembers = await prisma.channelMember.findMany({
            where: { channelId },
            select: { userId: true },
          });
          for (const member of dmMembers) {
            if (member.userId === userId) continue;
            if (mentionedUserIds.includes(member.userId)) continue; // Already notified via mention
            try {
              const dmPayload = {
                messageId: message.id,
                channelId,
                workspaceId,
                actorId: userId,
                preview: notificationPreview,
              };
              const notification = await prisma.notification.create({
                data: {
                  userId: member.userId,
                  type: 'DM',
                  payload: JSON.stringify(dmPayload),
                },
              });
              socket.nsp.to(userRoom(member.userId)).emit('notification:new', {
                id: notification.id,
                userId: member.userId,
                type: 'DM' as NotificationType,
                payload: dmPayload as any,
                readAt: null,
                createdAt: notification.createdAt,
              });
            } catch (e) {
              console.error(`[messages] Failed to create DM notification for ${member.userId}:`, e);
            }
          }
        }

        // 3. Thread reply notifications
        if (parentId) {
          // Notify all participants in the thread (users who have replied or started it)
          const threadMessages = await prisma.message.findMany({
            where: {
              OR: [
                { id: parentId },
                { parentId },
              ],
              isDeleted: false,
            },
            select: { userId: true },
            distinct: ['userId'],
          });
          const threadParticipantIds = [...new Set(threadMessages.map((m) => m.userId))];
          for (const participantId of threadParticipantIds) {
            if (participantId === userId) continue;
            if (mentionedUserIds.includes(participantId)) continue;
            try {
              const threadPayload = {
                messageId: message.id,
                parentMessageId: parentId,
                channelId,
                workspaceId,
                actorId: userId,
                preview: notificationPreview,
              };
              const notification = await prisma.notification.create({
                data: {
                  userId: participantId,
                  type: 'THREAD_REPLY',
                  payload: JSON.stringify(threadPayload),
                },
              });
              socket.nsp.to(userRoom(participantId)).emit('notification:new', {
                id: notification.id,
                userId: participantId,
                type: 'THREAD_REPLY' as NotificationType,
                payload: threadPayload as any,
                readAt: null,
                createdAt: notification.createdAt,
              });
            } catch (e) {
              console.error(`[messages] Failed to create THREAD_REPLY notification for ${participantId}:`, e);
            }
          }
        }

        // --- Trigger workflow automation (fire-and-forget, non-blocking) ---
        const workflowContext = {
          workspaceId,
          channelId,
          messageId: message.id,
          userId,
          contentPlain,
        };
        void executeWorkflowsForEvent('message_posted', workflowContext).catch((err) => {
          console.error('[messages] workflow execution error (message_posted):', err);
        });
        void executeWorkflowsForEvent('message_contains', workflowContext).catch((err) => {
          console.error('[messages] workflow execution error (message_contains):', err);
        });

        // --- Emit unread:update to all channel members (except sender) ---
        const allMembers = await prisma.channelMember.findMany({
          where: { channelId },
          select: { userId: true, lastReadAt: true },
        });

        const otherMembers = allMembers.filter((m) => m.userId !== userId);
        // Run all count queries concurrently instead of sequentially to avoid
        // blocking the event loop with N round-trips for a channel with N members.
        await Promise.all(
          otherMembers.map(async (member) => {
            const where: Record<string, unknown> = {
              channelId,
              isDeleted: false,
              userId: { not: member.userId },
            };
            if (member.lastReadAt) {
              where.createdAt = { gt: member.lastReadAt };
            }
            const unreadCount = await prisma.message.count({ where });
            const hasMention = mentionedUserIds.includes(member.userId);

            socket.nsp.to(userRoom(member.userId)).emit('unread:update', {
              channelId,
              unreadCount,
              hasMention,
            });
          })
        );
      }
    } catch (err) {
      console.error(`[messages] message:send error for user ${userId}:`, err);
      ack?.({ ok: false, error: 'Server error processing message' });
    }
  });

  /**
   * message:edit — Edit an existing message.
   *
   * Validates that the user owns the message, updates the content in the DB,
   * sets isEdited=true, and emits `message:updated` to the channel room.
   */
  socket.on('message:edit', async ({ messageId, content }) => {
    try {
      if (!messageId || !content) {
        return;
      }

      // Fetch the existing message to validate ownership
      const existing = await prisma.message.findUnique({
        where: { id: messageId },
        select: { userId: true, channelId: true, isDeleted: true },
      });

      if (!existing) {
        console.warn(`[messages] message:edit — message ${messageId} not found`);
        return;
      }

      if (existing.userId !== userId) {
        console.warn(`[messages] message:edit — user ${userId} does not own message ${messageId}`);
        return;
      }

      if (existing.isDeleted) {
        console.warn(`[messages] message:edit — message ${messageId} is deleted`);
        return;
      }

      const contentJson = JSON.stringify(content);
      const contentPlain = extractPlainText(content);

      // Update the message in the database
      await prisma.message.update({
        where: { id: messageId },
        data: {
          contentJson,
          contentPlain,
          isEdited: true,
          editedAt: new Date(),
        },
      });

      // Fetch full updated message with relations
      const fullMessage = await getMessageWithMeta(messageId);
      if (!fullMessage) return;

      // Emit to channel room
      socket.nsp.to(channelRoom(existing.channelId)).emit('message:updated', fullMessage);
    } catch (err) {
      console.error(`[messages] message:edit error for user ${userId}:`, err);
    }
  });

  /**
   * message:delete — Soft-delete a message.
   *
   * Validates ownership or admin/owner role, sets isDeleted=true and deletedAt timestamp,
   * and emits `message:deleted` to the channel room.
   */
  socket.on('message:delete', async ({ messageId }) => {
    try {
      if (!messageId) return;

      // Fetch existing message to validate ownership or admin privilege
      const existing = await prisma.message.findUnique({
        where: { id: messageId },
        select: {
          userId: true,
          channelId: true,
          isDeleted: true,
          parentId: true,
          channel: { select: { workspaceId: true } },
        },
      });

      if (!existing) {
        console.warn(`[messages] message:delete — message ${messageId} not found`);
        return;
      }

      if (existing.isDeleted) {
        return; // Already deleted
      }

      // Check ownership or admin/owner role in the workspace
      if (existing.userId !== userId) {
        const member = await prisma.workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: existing.channel.workspaceId,
              userId,
            },
          },
          select: { role: true },
        });

        if (!member || member.role === 'MEMBER') {
          console.warn(`[messages] message:delete — user ${userId} not authorized to delete message ${messageId}`);
          return;
        }
      }

      // Soft-delete the message
      await prisma.message.update({
        where: { id: messageId },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });

      // If this was a thread reply, decrement the parent's replyCount
      if (existing.parentId) {
        await prisma.message.update({
          where: { id: existing.parentId },
          data: { replyCount: { decrement: 1 } },
        });
      }

      // Emit deletion event to channel room
      socket.nsp
        .to(channelRoom(existing.channelId))
        .emit('message:deleted', {
          messageId,
          channelId: existing.channelId,
        });
    } catch (err) {
      console.error(`[messages] message:delete error for user ${userId}:`, err);
    }
  });

  /**
   * message:react — Add an emoji reaction to a message.
   *
   * Creates a Reaction in the DB (upsert with unique constraint on userId+messageId+emoji).
   * Fetches the updated reaction groups and emits `reaction:updated` with the full
   * reactions snapshot to the channel room.
   */
  socket.on('message:react', async ({ messageId, emoji }) => {
    try {
      if (!messageId || !emoji) return;

      // Look up the message to get its channelId
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { channelId: true },
      });

      if (!message) {
        console.warn(`[messages] message:react — message ${messageId} not found`);
        return;
      }

      // Verify the user is a member of the message's channel
      const membership = await prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId: message.channelId, userId } },
        select: { channelId: true },
      });
      if (!membership) {
        console.warn(`[messages] message:react — user ${userId} is not a member of channel ${message.channelId}`);
        return;
      }

      // Upsert the reaction (unique on userId+messageId+emoji)
      await prisma.reaction.upsert({
        where: {
          userId_messageId_emoji: {
            userId,
            messageId,
            emoji,
          },
        },
        create: {
          userId,
          messageId,
          emoji,
        },
        update: {}, // Already exists, no-op
      });

      // Fetch updated reaction groups
      const reactions = await getReactionGroups(messageId);

      // Emit full reactions snapshot to channel room
      socket.nsp
        .to(channelRoom(message.channelId))
        .emit('reaction:updated', { messageId, reactions });
    } catch (err) {
      console.error(`[messages] message:react error for user ${userId}:`, err);
    }
  });

  /**
   * message:unreact — Remove an emoji reaction from a message.
   *
   * Deletes the Reaction from the DB, fetches updated reaction groups,
   * and emits `reaction:updated` with the full reactions snapshot.
   */
  socket.on('message:unreact', async ({ messageId, emoji }) => {
    try {
      if (!messageId || !emoji) return;

      // Look up the message to get its channelId
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { channelId: true },
      });

      if (!message) {
        console.warn(`[messages] message:unreact — message ${messageId} not found`);
        return;
      }

      // Verify the user is a member of the message's channel
      const membership = await prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId: message.channelId, userId } },
        select: { channelId: true },
      });
      if (!membership) {
        console.warn(`[messages] message:unreact — user ${userId} is not a member of channel ${message.channelId}`);
        return;
      }

      // Delete the reaction (ignore if it doesn't exist)
      await prisma.reaction.deleteMany({
        where: {
          userId,
          messageId,
          emoji,
        },
      });

      // Fetch updated reaction groups
      const reactions = await getReactionGroups(messageId);

      // Emit full reactions snapshot to channel room
      socket.nsp
        .to(channelRoom(message.channelId))
        .emit('reaction:updated', { messageId, reactions });
    } catch (err) {
      console.error(`[messages] message:unreact error for user ${userId}:`, err);
    }
  });
}
