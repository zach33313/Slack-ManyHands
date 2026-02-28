/**
 * search/types.ts
 *
 * Types for the full-text search domain.
 * Used by search queries, the search API, and search UI components.
 */

import type { UserSummary, TiptapJSON } from '@/shared/types';

/** A message result from search with additional context */
export interface SearchResultMessage {
  id: string;
  channelId: string;
  userId: string;
  content: TiptapJSON;
  contentPlain: string;
  parentId: string | null;
  replyCount: number;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
  author: UserSummary;
  fileCount: number;
}

/** A single search result returned to the client */
export interface SearchResult {
  message: SearchResultMessage;
  channelName: string;
  highlights: string[];
}

/** Parsed search filters extracted from the query string */
export interface SearchFilters {
  /** Text query after removing filter prefixes */
  query: string;
  /** Filter to a specific channel by ID */
  channelId?: string;
  /** Filter to a specific channel by name (from `in:#channel` syntax) */
  channelName?: string;
  /** Filter to a specific user by ID */
  userId?: string;
  /** Filter to a specific user by name (from `from:@user` syntax) */
  userName?: string;
  /** Only messages with file attachments */
  hasFile?: boolean;
  /** Only messages containing http/https URLs */
  hasLink?: boolean;
  /** Messages before this date */
  before?: Date;
  /** Messages after this date */
  after?: Date;
}

/** Full search response returned by the API */
export interface SearchResponse {
  results: SearchResult[];
  cursor: string | null;
  hasMore: boolean;
  total: number;
}
