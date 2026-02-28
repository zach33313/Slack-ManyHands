/**
 * messages/types.ts
 *
 * Local types for the messages domain — store shape, component props, etc.
 * Core data types (Message, MessageWithMeta, ReactionGroup, etc.) live in shared/types/index.ts.
 */

import type { MessageWithMeta, UserSummary, TiptapJSON } from '@/shared/types';

// ---------------------------------------------------------------------------
// Server-side types (used by queries, actions, and API routes)
// ---------------------------------------------------------------------------

/** Thread metadata for display on parent messages */
export interface ThreadInfo {
  replyCount: number;
  lastReplyAt: Date | null;
  participants: UserSummary[];
}

/** API request body for creating a message */
export interface CreateMessageBody {
  content: TiptapJSON;
  parentId?: string;
  fileIds?: string[];
}

/** API request body for editing a message */
export interface EditMessageBody {
  content: TiptapJSON;
}

/** API request body for adding/removing a reaction */
export interface ReactionBody {
  emoji: string;
}

// ---------------------------------------------------------------------------
// Client-side types (used by components and store)
// ---------------------------------------------------------------------------

/** Grouped messages structure for GroupedVirtuoso date separators */
export interface GroupedMessages {
  /** Display labels for each group ("Today", "Yesterday", "Monday, January 20") */
  dates: string[];
  /** Number of messages in each group */
  groupCounts: number[];
  /** Flat list of all messages in chronological order (oldest first) */
  messages: MessageWithMeta[];
}

/** Shape of the messages Zustand store */
export interface MessagesState {
  /** Messages keyed by channel ID, sorted oldest-first */
  messagesByChannel: Record<string, MessageWithMeta[]>;
  /** Loading state per channel (initial load or pagination) */
  loadingByChannel: Record<string, boolean>;
  /** Whether there are older messages to fetch per channel */
  hasMoreByChannel: Record<string, boolean>;
  /** ID of the currently open thread's parent message */
  activeThreadId: string | null;
  /** Thread replies for the active thread */
  threadMessages: MessageWithMeta[];
  /** Loading state for thread */
  threadLoading: boolean;
  /** Index of the first unread message per channel (null if none) */
  unreadIndexByChannel: Record<string, number | null>;
  /** Whether user is at the bottom of the message list */
  isAtBottom: boolean;
  /** Count of unseen messages while scrolled up */
  unseenCount: number;

  // Actions
  setMessages: (channelId: string, messages: MessageWithMeta[]) => void;
  prependMessages: (channelId: string, messages: MessageWithMeta[]) => void;
  addMessage: (channelId: string, message: MessageWithMeta) => void;
  updateMessage: (channelId: string, message: MessageWithMeta) => void;
  deleteMessage: (channelId: string, messageId: string) => void;
  setReactions: (channelId: string, messageId: string, reactions: MessageWithMeta['reactions']) => void;
  setLoading: (channelId: string, loading: boolean) => void;
  setHasMore: (channelId: string, hasMore: boolean) => void;
  setActiveThread: (messageId: string | null) => void;
  setThreadMessages: (messages: MessageWithMeta[]) => void;
  addThreadMessage: (message: MessageWithMeta) => void;
  setThreadLoading: (loading: boolean) => void;
  setUnreadIndex: (channelId: string, index: number | null) => void;
  setIsAtBottom: (isAtBottom: boolean) => void;
  incrementUnseen: () => void;
  resetUnseen: () => void;
  /** Update the parent message's reply count when a thread reply is added */
  incrementReplyCount: (channelId: string, parentId: string) => void;
}

/** Props for message grouping by author for compact mode */
export interface MessageGroupContext {
  /** Whether this message should show in compact mode (no avatar/name) */
  isCompact: boolean;
  /** Whether this is the first message in a group from the same author */
  isGroupStart: boolean;
}

/** Thread summary info displayed on a parent message */
export interface ThreadSummary {
  replyCount: number;
  participants: UserSummary[];
  lastReplyAt: Date;
}
