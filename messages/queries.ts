/**
 * messages/queries.ts
 *
 * Database query functions for the messages domain.
 * All functions use Prisma to query the database and return
 * domain types (MessageWithMeta, ThreadInfo, etc.).
 *
 * These are read-only queries — mutations are in actions.ts.
 */

import { prisma } from '@/shared/lib/prisma';
import type {
  MessageWithMeta,
  ReactionGroup,
  TiptapJSON,
  UserSummary,
} from '@/shared/types';
import {
  MESSAGES_PER_PAGE,
  MAX_MESSAGES_PER_PAGE,
} from '@/shared/lib/constants';
import type { ThreadInfo } from './types';

// ---------------------------------------------------------------------------
// Prisma select/include fragments (reused across queries)
// ---------------------------------------------------------------------------

/** Minimal user fields for author display */
const userSummarySelect = {
  id: true,
  name: true,
  image: true,
} as const;

/** Standard include for loading a message with all relations */
const messageWithRelations = {
  author: { select: userSummarySelect },
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
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Transform a flat array of Reaction rows into grouped ReactionGroup[].
 *
 * @param reactions - Flat reaction records from Prisma (emoji + userId)
 * @returns Array of ReactionGroup with emoji, count, and userIds
 *
 * @example
 *   groupReactions([
 *     { emoji: '👍', userId: 'u1' },
 *     { emoji: '👍', userId: 'u2' },
 *     { emoji: '❤️', userId: 'u1' },
 *   ])
 *   // => [{ emoji: '👍', count: 2, userIds: ['u1','u2'] }, { emoji: '❤️', count: 1, userIds: ['u1'] }]
 */
export function groupReactions(
  reactions: Array<{ emoji: string; userId: string }>
): ReactionGroup[] {
  const groups = new Map<string, string[]>();
  for (const r of reactions) {
    const existing = groups.get(r.emoji);
    if (existing) {
      existing.push(r.userId);
    } else {
      groups.set(r.emoji, [r.userId]);
    }
  }
  return Array.from(groups.entries()).map(([emoji, userIds]) => ({
    emoji,
    count: userIds.length,
    userIds,
  }));
}

/**
 * Transform a Prisma message record (with included relations) into a MessageWithMeta.
 * Parses contentJson from string to TiptapJSON, hides content if soft-deleted.
 */
function toMessageWithMeta(msg: {
  id: string;
  channelId: string;
  userId: string;
  contentJson: string;
  contentPlain: string;
  parentId: string | null;
  replyCount: number;
  isEdited: boolean;
  isDeleted: boolean;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  author: { id: string; name: string | null; image: string | null };
  files: Array<{
    id: string;
    name: string;
    url: string;
    size: number;
    mimeType: string;
    width: number | null;
    height: number | null;
  }>;
  reactions: Array<{ emoji: string; userId: string }>;
}): MessageWithMeta {
  // For soft-deleted messages, hide the content but keep the record
  const isDeleted = msg.isDeleted;

  let parsedContent: TiptapJSON;
  if (isDeleted) {
    parsedContent = { type: 'doc', content: [] };
  } else {
    try {
      parsedContent = JSON.parse(msg.contentJson) as TiptapJSON;
    } catch {
      parsedContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: msg.contentPlain }],
          },
        ],
      };
    }
  }

  return {
    id: msg.id,
    channelId: msg.channelId,
    userId: msg.userId,
    content: parsedContent,
    contentPlain: isDeleted ? '' : msg.contentPlain,
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
      image: msg.author.image ?? null,
    },
    files: msg.files.map((f) => ({
      id: f.id,
      name: f.name,
      url: f.url,
      size: f.size,
      mimeType: f.mimeType,
      width: f.width ?? null,
      height: f.height ?? null,
    })),
    reactions: groupReactions(msg.reactions),
  };
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/**
 * Fetch paginated messages for a channel (cursor-based, ordered by createdAt DESC).
 * Only returns top-level messages (parentId is null). Thread replies are loaded separately.
 *
 * @param channelId - The channel to fetch messages for
 * @param options.cursor - Message ID to start after (for loading older messages)
 * @param options.limit - Number of messages per page (default 50, max 100)
 * @returns Object with messages array, nextCursor for pagination, and hasMore flag
 */
export async function getMessages(
  channelId: string,
  options: { cursor?: string; limit?: number } = {}
): Promise<{
  messages: MessageWithMeta[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const limit = Math.min(
    Math.max(options.limit || MESSAGES_PER_PAGE, 1),
    MAX_MESSAGES_PER_PAGE
  );

  const messages = await prisma.message.findMany({
    where: { channelId, parentId: null },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(options.cursor
      ? { cursor: { id: options.cursor }, skip: 1 }
      : {}),
    include: messageWithRelations,
  });

  const hasMore = messages.length > limit;
  const results = hasMore ? messages.slice(0, limit) : messages;

  return {
    messages: results.map(toMessageWithMeta),
    nextCursor:
      results.length > 0 ? results[results.length - 1].id : null,
    hasMore,
  };
}

/**
 * Fetch all replies to a parent message, ordered by createdAt ASC (oldest first).
 * Includes author, files, and reactions for each reply.
 *
 * @param parentId - The parent message ID
 * @returns Array of MessageWithMeta for each reply
 */
export async function getThreadReplies(
  parentId: string
): Promise<MessageWithMeta[]> {
  const replies = await prisma.message.findMany({
    where: { parentId },
    orderBy: { createdAt: 'asc' },
    include: messageWithRelations,
  });
  return replies.map(toMessageWithMeta);
}

/**
 * Fetch a single message by ID with all relations.
 *
 * @param id - The message ID
 * @returns MessageWithMeta or null if not found
 */
export async function getMessageById(
  id: string
): Promise<MessageWithMeta | null> {
  const msg = await prisma.message.findUnique({
    where: { id },
    include: messageWithRelations,
  });
  if (!msg) return null;
  return toMessageWithMeta(msg);
}

/**
 * Fetch thread metadata for a message: reply count, last reply timestamp,
 * and unique participants (authors of replies).
 *
 * @param messageId - The parent message ID
 * @returns ThreadInfo or null if the message doesn't exist
 */
export async function getThreadInfo(
  messageId: string
): Promise<ThreadInfo | null> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { replyCount: true },
  });
  if (!message) return null;

  if (message.replyCount === 0) {
    return {
      replyCount: 0,
      lastReplyAt: null,
      participants: [],
    };
  }

  // Get all replies to find last reply time and unique participants
  const replies = await prisma.message.findMany({
    where: { parentId: messageId },
    orderBy: { createdAt: 'desc' },
    select: {
      createdAt: true,
      author: { select: userSummarySelect },
    },
  });

  // Deduplicate participants while preserving order (most recent first)
  const seen = new Set<string>();
  const participants: UserSummary[] = [];
  for (const reply of replies) {
    if (!seen.has(reply.author.id)) {
      seen.add(reply.author.id);
      participants.push({
        id: reply.author.id,
        name: reply.author.name ?? 'Unknown',
        image: reply.author.image ?? null,
      });
    }
  }

  return {
    replyCount: message.replyCount,
    lastReplyAt: replies.length > 0 ? replies[0].createdAt : null,
    participants,
  };
}

/**
 * Fetch all pinned messages in a channel, ordered by pin time (newest first).
 *
 * @param channelId - The channel to fetch pins for
 * @returns Array of MessageWithMeta for each pinned message
 */
export async function getPinnedMessages(
  channelId: string
): Promise<MessageWithMeta[]> {
  const pins = await prisma.pin.findMany({
    where: { channelId },
    orderBy: { pinnedAt: 'desc' },
    include: {
      message: {
        include: messageWithRelations,
      },
    },
  });
  return pins.map((pin) => toMessageWithMeta(pin.message));
}
