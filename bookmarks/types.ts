/**
 * bookmarks/types.ts
 *
 * Types for the saved items / bookmarks feature.
 * Bookmarks reference messages by ID. The Bookmark model in the DB
 * has a unique constraint on messageId+userId (one bookmark per user per message).
 *
 * Core shared types (MessageWithMeta, etc.) live in shared/types/index.ts.
 */

import type { MessageWithMeta } from '@/shared/types';

// ---------------------------------------------------------------------------
// Domain Types
// ---------------------------------------------------------------------------

/** A bookmark with its hydrated message */
export interface BookmarkWithMessage {
  id: string;
  messageId: string;
  userId: string;
  createdAt: Date;
  /** Hydrated message with author, files, reactions */
  message: MessageWithMeta;
  /** Truncated plain-text preview of the bookmarked message content */
  contentPreview: string;
  /** Name of the channel where the message was posted */
  channelName: string;
  /** ID of the channel where the message was posted */
  channelId: string;
}
