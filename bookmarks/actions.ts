'use server';

/**
 * bookmarks/actions.ts
 *
 * Server Actions for the bookmarks (saved items) domain.
 * Allows users to bookmark/unbookmark messages and retrieve their saved items.
 */

import { auth } from '@/auth/auth';
import { prisma } from '@/shared/lib/prisma';
import type { BookmarkWithMessage } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a Tiptap JSON content string into a plain-text preview */
function extractTextPreview(contentJson: string, maxLength = 120): string {
  try {
    const doc = JSON.parse(contentJson);
    const texts: string[] = [];

    function traverseNode(node: { type?: string; text?: string; content?: typeof node[] }): void {
      if (node.text) texts.push(node.text);
      if (node.content) node.content.forEach(traverseNode);
    }

    if (doc.content) doc.content.forEach(traverseNode);
    const plain = texts.join(' ').trim();
    return plain.length > maxLength ? plain.slice(0, maxLength) + '…' : plain;
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Add a bookmark for a message.
 * Silently ignores if the bookmark already exists (idempotent).
 */
export async function addBookmark(messageId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  const userId = session.user.id;

  // Verify message exists
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, isDeleted: true },
  });
  if (!message || message.isDeleted) throw new Error('Message not found');

  // Upsert to avoid unique constraint errors
  await prisma.bookmark.upsert({
    where: { messageId_userId: { messageId, userId } },
    create: { messageId, userId },
    update: {},
  });
}

/**
 * Remove a bookmark for a message.
 * Silently ignores if the bookmark does not exist.
 */
export async function removeBookmark(messageId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  const userId = session.user.id;

  await prisma.bookmark.deleteMany({
    where: { messageId, userId },
  });
}

/**
 * Get all bookmarks for the current user within a workspace,
 * enriched with message preview and channel info.
 */
export async function getBookmarks(workspaceId: string): Promise<BookmarkWithMessage[]> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  const userId = session.user.id;

  const bookmarks = await prisma.bookmark.findMany({
    where: {
      userId,
      message: {
        isDeleted: false,
        channel: { workspaceId },
      },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      message: {
        include: {
          author: { select: { id: true, name: true, image: true } },
          channel: { select: { id: true, name: true } },
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
      },
    },
  });

  return bookmarks.map((bm) => {
    const msg = bm.message;
    const reactionMap = new Map<string, string[]>();
    for (const r of msg.reactions) {
      const arr = reactionMap.get(r.emoji) ?? [];
      arr.push(r.userId);
      reactionMap.set(r.emoji, arr);
    }

    const reactions = Array.from(reactionMap.entries()).map(([emoji, userIds]) => ({
      emoji,
      count: userIds.length,
      userIds,
      hasReacted: userIds.includes(userId),
    }));

    return {
      id: bm.id,
      messageId: bm.messageId,
      userId: bm.userId,
      createdAt: bm.createdAt,
      contentPreview: extractTextPreview(msg.contentJson),
      channelName: msg.channel.name,
      channelId: msg.channel.id,
      message: {
        id: msg.id,
        channelId: msg.channelId,
        userId: msg.userId,
        content: JSON.parse(msg.contentJson),
        contentPlain: msg.contentPlain,
        parentId: msg.parentId,
        replyCount: msg.replyCount,
        author: msg.author as { id: string; name: string; image: string | null },
        isEdited: msg.isEdited,
        isDeleted: msg.isDeleted,
        editedAt: msg.editedAt,
        deletedAt: msg.deletedAt,
        createdAt: msg.createdAt,
        files: msg.files,
        reactions,
      },
    };
  });
}

/**
 * Search bookmarks for the current user by content preview.
 */
export async function searchBookmarks(
  workspaceId: string,
  query: string
): Promise<BookmarkWithMessage[]> {
  const all = await getBookmarks(workspaceId);
  const q = query.toLowerCase().trim();
  if (!q) return all;

  return all.filter(
    (bm) =>
      bm.contentPreview.toLowerCase().includes(q) ||
      bm.channelName.toLowerCase().includes(q) ||
      bm.message.author.name.toLowerCase().includes(q)
  );
}
