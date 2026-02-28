'use server';

/**
 * messages/actions.ts
 *
 * Server Actions for the messages domain — sendMessage, editMessage, deleteMessage,
 * pinMessage, unpinMessage, addReaction, removeReaction, bookmarkMessage.
 *
 * All mutations go through here. Server Actions can be called directly from
 * client components (as RPC) or from Route Handlers.
 *
 * Each action validates authentication and authorization before performing writes.
 * Socket.IO events are emitted after successful mutations for real-time updates.
 */

import { prisma } from '@/shared/lib/prisma';
import { auth } from '@/auth/auth';
import type {
  MessageWithMeta,
  SendMessageInput,
  TiptapJSON,
  TiptapNode,
  ReactionGroup,
} from '@/shared/types';
import { channelRoom, userRoom } from '@/shared/lib/constants';
import { getMessageById, groupReactions } from './queries';

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

/** Emit an event to a specific user's private room */
function emitToUser(userId: string, event: string, data: unknown): void {
  const io = getIO();
  if (io) {
    io.to(userRoom(userId)).emit(event, data);
  }
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

/**
 * Require an authenticated session and return the user ID.
 * Throws an error if no session is found.
 */
async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return userId;
}

// ---------------------------------------------------------------------------
// Tiptap JSON helpers
// ---------------------------------------------------------------------------

/**
 * Extract plain text from a Tiptap JSON document.
 * Used to populate the contentPlain field for search indexing and previews.
 */
function extractPlainText(doc: TiptapJSON): string {
  function walkNodes(nodes: TiptapNode[]): string {
    return nodes
      .map((node) => {
        if (node.text) return node.text;
        if (node.type === 'hardBreak') return '\n';
        if (node.content) {
          const inner = walkNodes(node.content);
          // Add newline after block-level nodes
          if (
            ['paragraph', 'heading', 'blockquote', 'codeBlock', 'listItem'].includes(
              node.type
            )
          ) {
            return inner + '\n';
          }
          return inner;
        }
        return '';
      })
      .join('');
  }
  return walkNodes(doc.content || []).trim();
}

/**
 * Extract mentioned user IDs from a Tiptap JSON document.
 * Looks for nodes with type 'mention' and an `id` attribute.
 */
function extractMentionedUserIds(doc: TiptapJSON): string[] {
  const userIds: string[] = [];
  function walk(nodes: TiptapNode[]): void {
    for (const node of nodes) {
      if (node.type === 'mention' && node.attrs?.id) {
        userIds.push(node.attrs.id as string);
      }
      if (node.content) walk(node.content);
    }
  }
  walk(doc.content || []);
  return [...new Set(userIds)];
}

/**
 * Wrap a plain text string in a minimal Tiptap JSON document.
 * Used when content is provided as plain text instead of Tiptap JSON.
 */
function wrapPlainText(text: string): TiptapJSON {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Create a new message or thread reply.
 *
 * - Creates the message record in the database
 * - Connects file attachments if fileIds are provided
 * - If parentId is set, increments the parent's replyCount and emits `thread:reply`
 * - Otherwise emits `message:new` to the channel room
 * - Creates notification records for any @mentioned users
 *
 * @param input - SendMessageInput with channelId, content (TiptapJSON), parentId?, fileIds?
 * @returns The created message with author, files, and reactions
 */
export async function sendMessage(
  input: SendMessageInput
): Promise<MessageWithMeta> {
  const userId = await requireUserId();

  // Verify the sender is a member of the channel
  const channelMembership = await prisma.channelMember.findUnique({
    where: {
      channelId_userId: { channelId: input.channelId, userId },
    },
  });

  if (!channelMembership) {
    throw new Error('You are not a member of this channel');
  }

  // Normalize content — accept either TiptapJSON or plain string
  const contentJson: TiptapJSON =
    typeof input.content === 'object' && input.content?.type === 'doc'
      ? input.content
      : wrapPlainText(String(input.content));

  const contentPlain = extractPlainText(contentJson);

  // Validate parentId exists if provided
  if (input.parentId) {
    const parent = await prisma.message.findUnique({
      where: { id: input.parentId },
      select: { id: true, channelId: true, isDeleted: true },
    });
    if (!parent) {
      throw new Error('Parent message not found');
    }
    if (parent.channelId !== input.channelId) {
      throw new Error('Parent message does not belong to this channel');
    }
    if (parent.isDeleted) {
      throw new Error('Cannot reply to a deleted message');
    }
  }

  // Validate file ownership — only allow attaching files the user uploaded
  let validatedFileIds: string[] = [];
  if (input.fileIds && input.fileIds.length > 0) {
    const ownedFiles = await prisma.fileAttachment.findMany({
      where: {
        id: { in: input.fileIds },
        userId,
      },
      select: { id: true },
    });
    validatedFileIds = ownedFiles.map((f) => f.id);
  }

  // Create the message
  const message = await prisma.message.create({
    data: {
      channelId: input.channelId,
      userId,
      contentJson: JSON.stringify(contentJson),
      contentPlain,
      parentId: input.parentId ?? null,
      ...(validatedFileIds.length > 0
        ? {
            files: {
              connect: validatedFileIds.map((id) => ({ id })),
            },
          }
        : {}),
    },
    include: {
      author: { select: { id: true, name: true, image: true } },
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

  // If this is a thread reply, increment the parent's denormalized replyCount
  if (input.parentId) {
    await prisma.message.update({
      where: { id: input.parentId },
      data: { replyCount: { increment: 1 } },
    });
  }

  // Fetch the full message with all relations for the response
  const messageWithMeta = await getMessageById(message.id);
  if (!messageWithMeta) {
    throw new Error('Failed to retrieve created message');
  }

  // Emit Socket.IO events
  if (input.parentId) {
    emitToChannel(message.channelId, 'thread:reply', messageWithMeta);
  } else {
    emitToChannel(message.channelId, 'message:new', messageWithMeta);
  }

  // --- Notifications ---
  // Fetch channel info for notification context
  const channel = await prisma.channel.findUnique({
    where: { id: input.channelId },
    select: { workspaceId: true, type: true },
  });

  const preview = contentPlain.slice(0, 100);
  const notifiedUserIds = new Set<string>();

  // 1. Create notifications for @mentions
  const mentionedUserIds = extractMentionedUserIds(contentJson);
  const recipientIds = mentionedUserIds.filter((id) => id !== userId);

  for (const recipientId of recipientIds) {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId: recipientId,
          actorId: userId,
          type: 'MENTION',
          payload: JSON.stringify({
            messageId: message.id,
            channelId: input.channelId,
            workspaceId: channel?.workspaceId ?? '',
            actorId: userId,
            preview,
          }),
        },
      });

      emitToUser(recipientId, 'notification:new', {
        id: notification.id,
        userId: notification.userId,
        type: notification.type,
        payload: JSON.parse(notification.payload),
        readAt: notification.readAt,
        createdAt: notification.createdAt,
      });
      notifiedUserIds.add(recipientId);
    } catch {
      // Notification failure should not block message creation
    }
  }

  // 2. Create DM notification for direct messages (DM and GROUP_DM)
  if (channel?.type === 'DM' || channel?.type === 'GROUP_DM') {
    try {
      const dmMembers = await prisma.channelMember.findMany({
        where: { channelId: input.channelId },
        select: { userId: true },
      });

      for (const member of dmMembers) {
        if (member.userId === userId || notifiedUserIds.has(member.userId)) continue;

        const notification = await prisma.notification.create({
          data: {
            userId: member.userId,
            actorId: userId,
            type: 'DM',
            payload: JSON.stringify({
              messageId: message.id,
              channelId: input.channelId,
              workspaceId: channel?.workspaceId ?? '',
              actorId: userId,
              preview,
            }),
          },
        });

        emitToUser(member.userId, 'notification:new', {
          id: notification.id,
          userId: notification.userId,
          type: notification.type,
          payload: JSON.parse(notification.payload),
          readAt: notification.readAt,
          createdAt: notification.createdAt,
        });
        notifiedUserIds.add(member.userId);
      }
    } catch {
      // DM notification failure should not block message creation
    }
  }

  // 3. Create thread reply notifications
  if (input.parentId) {
    try {
      // Notify the parent message author
      const parentMsg = await prisma.message.findUnique({
        where: { id: input.parentId },
        select: { userId: true },
      });

      // Also notify other thread participants
      const threadReplies = await prisma.message.findMany({
        where: { parentId: input.parentId },
        select: { userId: true },
        distinct: ['userId'],
      });

      const threadParticipantIds = new Set(
        threadReplies.map((r) => r.userId)
      );
      if (parentMsg) {
        threadParticipantIds.add(parentMsg.userId);
      }
      // Remove the sender
      threadParticipantIds.delete(userId);

      for (const participantId of threadParticipantIds) {
        if (notifiedUserIds.has(participantId)) continue;

        const notification = await prisma.notification.create({
          data: {
            userId: participantId,
            actorId: userId,
            type: 'THREAD_REPLY',
            payload: JSON.stringify({
              messageId: message.id,
              parentMessageId: input.parentId,
              channelId: input.channelId,
              workspaceId: channel?.workspaceId ?? '',
              actorId: userId,
              preview,
            }),
          },
        });

        emitToUser(participantId, 'notification:new', {
          id: notification.id,
          userId: notification.userId,
          type: notification.type,
          payload: JSON.parse(notification.payload),
          readAt: notification.readAt,
          createdAt: notification.createdAt,
        });
        notifiedUserIds.add(participantId);
      }
    } catch {
      // Thread notification failure should not block message creation
    }
  }

  return messageWithMeta;
}

/**
 * Edit an existing message.
 *
 * - Validates the caller owns the message
 * - Updates content and sets isEdited=true, editedAt=now
 * - Emits `message:updated` to the channel room
 *
 * @param messageId - ID of the message to edit
 * @param content - New Tiptap JSON content
 * @returns The updated message with all relations
 */
export async function editMessage(
  messageId: string,
  content: TiptapJSON
): Promise<MessageWithMeta> {
  const userId = await requireUserId();

  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    select: { userId: true, channelId: true, isDeleted: true },
  });

  if (!existing) {
    throw new Error('Message not found');
  }
  if (existing.isDeleted) {
    throw new Error('Cannot edit a deleted message');
  }
  if (existing.userId !== userId) {
    throw new Error('Not authorized to edit this message');
  }

  const contentPlain = extractPlainText(content);

  await prisma.message.update({
    where: { id: messageId },
    data: {
      contentJson: JSON.stringify(content),
      contentPlain,
      isEdited: true,
      editedAt: new Date(),
    },
  });

  const updated = await getMessageById(messageId);
  if (!updated) {
    throw new Error('Failed to retrieve updated message');
  }

  emitToChannel(existing.channelId, 'message:updated', updated);

  return updated;
}

/**
 * Soft-delete a message.
 *
 * - Validates the caller owns the message OR has admin/owner role in the workspace
 * - Sets isDeleted=true, deletedAt=now (content remains in DB but is hidden in responses)
 * - Emits `message:deleted` to the channel room
 *
 * @param messageId - ID of the message to delete
 */
export async function deleteMessage(messageId: string): Promise<void> {
  const userId = await requireUserId();

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
    throw new Error('Message not found');
  }
  if (existing.isDeleted) {
    throw new Error('Message is already deleted');
  }

  // Check ownership or admin privilege
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
      throw new Error('Not authorized to delete this message');
    }
  }

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

  emitToChannel(existing.channelId, 'message:deleted', {
    messageId,
    channelId: existing.channelId,
  });
}

/**
 * Pin a message in a channel.
 *
 * - Validates the message belongs to the channel
 * - Enforces a maximum of 100 pins per channel
 * - Creates a Pin record linking the channel, message, and pinning user
 *
 * @param channelId - The channel to pin the message in
 * @param messageId - The message to pin
 */
export async function pinMessage(
  channelId: string,
  messageId: string
): Promise<void> {
  const userId = await requireUserId();

  // Validate the message exists and belongs to the channel
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { channelId: true, isDeleted: true },
  });

  if (!message) {
    throw new Error('Message not found');
  }
  if (message.channelId !== channelId) {
    throw new Error('Message does not belong to this channel');
  }
  if (message.isDeleted) {
    throw new Error('Cannot pin a deleted message');
  }

  // Check if already pinned (messageId is unique in pins table)
  const existingPin = await prisma.pin.findUnique({
    where: { messageId },
  });
  if (existingPin) {
    throw new Error('Message is already pinned');
  }

  // Enforce pin limit
  const pinCount = await prisma.pin.count({ where: { channelId } });
  if (pinCount >= 100) {
    throw new Error('Maximum pin limit reached (100 pins per channel)');
  }

  await prisma.pin.create({
    data: {
      channelId,
      messageId,
      pinnedById: userId,
    },
  });
}

/**
 * Unpin a message from a channel.
 *
 * - Validates the pin exists and belongs to the channel
 * - Deletes the Pin record
 *
 * @param channelId - The channel to unpin the message from
 * @param messageId - The message to unpin
 */
export async function unpinMessage(
  channelId: string,
  messageId: string
): Promise<void> {
  await requireUserId();

  const pin = await prisma.pin.findUnique({
    where: { messageId },
  });

  if (!pin) {
    throw new Error('Message is not pinned');
  }
  if (pin.channelId !== channelId) {
    throw new Error('Pin does not belong to this channel');
  }

  await prisma.pin.delete({
    where: { messageId },
  });
}

/**
 * Add an emoji reaction to a message.
 *
 * - Uses upsert to avoid duplicate reactions (same user + message + emoji)
 * - Fetches and returns the full updated reaction groups
 * - Emits `reaction:updated` to the channel room
 *
 * @param messageId - The message to react to
 * @param emoji - The emoji string (e.g. '👍', '❤️')
 * @returns Updated ReactionGroup[] for the message
 */
export async function addReaction(
  messageId: string,
  emoji: string
): Promise<ReactionGroup[]> {
  const userId = await requireUserId();

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { channelId: true },
  });
  if (!message) {
    throw new Error('Message not found');
  }

  // Upsert: create if not exists, no-op if already reacted
  await prisma.reaction.upsert({
    where: {
      userId_messageId_emoji: { userId, messageId, emoji },
    },
    create: { messageId, userId, emoji },
    update: {}, // no-op — reaction already exists
  });

  // Fetch all reactions for the message and group them
  const reactions = await prisma.reaction.findMany({
    where: { messageId },
    select: { emoji: true, userId: true },
  });

  const groups = groupReactions(reactions);

  emitToChannel(message.channelId, 'reaction:updated', {
    messageId,
    reactions: groups,
  });

  return groups;
}

/**
 * Remove an emoji reaction from a message.
 *
 * - Deletes the user's reaction for the given emoji
 * - Fetches and returns the full updated reaction groups
 * - Emits `reaction:updated` to the channel room
 *
 * @param messageId - The message to remove the reaction from
 * @param emoji - The emoji string to remove
 * @returns Updated ReactionGroup[] for the message
 */
export async function removeReaction(
  messageId: string,
  emoji: string
): Promise<ReactionGroup[]> {
  const userId = await requireUserId();

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { channelId: true },
  });
  if (!message) {
    throw new Error('Message not found');
  }

  await prisma.reaction.deleteMany({
    where: { messageId, userId, emoji },
  });

  // Fetch all remaining reactions and group them
  const reactions = await prisma.reaction.findMany({
    where: { messageId },
    select: { emoji: true, userId: true },
  });

  const groups = groupReactions(reactions);

  emitToChannel(message.channelId, 'reaction:updated', {
    messageId,
    reactions: groups,
  });

  return groups;
}

/**
 * Bookmark a message for the current user.
 *
 * - Creates a Bookmark record (unique per user + message)
 * - Silently succeeds if already bookmarked
 *
 * @param messageId - The message to bookmark
 */
export async function bookmarkMessage(messageId: string): Promise<void> {
  const userId = await requireUserId();

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true },
  });
  if (!message) {
    throw new Error('Message not found');
  }

  // Upsert to handle idempotent bookmarking
  await prisma.bookmark.upsert({
    where: {
      messageId_userId: { messageId, userId },
    },
    create: { messageId, userId },
    update: {}, // no-op — already bookmarked
  });
}
