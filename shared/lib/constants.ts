/**
 * shared/lib/constants.ts
 *
 * Application-wide constants, limits, and configuration values.
 * Import from here instead of hard-coding magic numbers.
 */

import { MemberRole } from '@/shared/types';

// ---------------------------------------------------------------------------
// Message limits
// ---------------------------------------------------------------------------

/** Maximum characters in message plain text */
export const MAX_MESSAGE_LENGTH = 4_000;

/** Messages per page in the channel message list */
export const MESSAGES_PER_PAGE = 50;

/** Maximum messages per page (enforced server-side) */
export const MAX_MESSAGES_PER_PAGE = 100;

/** Maximum thread replies shown inline before "View thread" truncation */
export const MAX_INLINE_REPLIES = 3;

// ---------------------------------------------------------------------------
// File upload limits
// ---------------------------------------------------------------------------

/** Maximum file size in bytes (10 MB) */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Maximum files per message */
export const MAX_FILES_PER_MESSAGE = 10;

/** Allowed MIME types for image display (shown inline) */
export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
] as const;

/** Allowed MIME types for video display */
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'] as const;

// ---------------------------------------------------------------------------
// Presence & typing
// ---------------------------------------------------------------------------

/** Client sends presence:heartbeat every N milliseconds */
export const PRESENCE_HEARTBEAT_INTERVAL = 30_000;

/** Server marks user offline after this many milliseconds without a heartbeat */
export const PRESENCE_TIMEOUT = 90_000;

/** Typing indicator cleared after this many milliseconds of inactivity */
export const TYPING_TIMEOUT = 3_000;

// ---------------------------------------------------------------------------
// Workspace / Channel limits
// ---------------------------------------------------------------------------

/** Maximum workspace name length */
export const MAX_WORKSPACE_NAME_LENGTH = 80;

/** Maximum channel name length (no spaces, lowercase) */
export const MAX_CHANNEL_NAME_LENGTH = 80;

/** Maximum channel description length */
export const MAX_CHANNEL_DESCRIPTION_LENGTH = 250;

/** Maximum members in a DM group */
export const MAX_DM_GROUP_SIZE = 9;

/** Default channels created when a new workspace is set up */
export const DEFAULT_CHANNELS = ['general', 'random'] as const;

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Default search results per query */
export const SEARCH_RESULTS_LIMIT = 20;

/** Maximum search results per query */
export const MAX_SEARCH_RESULTS = 50;

/** Minimum query length to trigger full-text search */
export const SEARCH_MIN_QUERY_LENGTH = 2;

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/** Default page size for member/channel lists */
export const DEFAULT_LIST_LIMIT = 50;

// ---------------------------------------------------------------------------
// Roles — ordered by privilege level (higher index = more privilege)
// ---------------------------------------------------------------------------

/** Roles ordered from least to most privileged */
export const ROLE_HIERARCHY: MemberRole[] = [
  MemberRole.MEMBER,
  MemberRole.ADMIN,
  MemberRole.OWNER,
];

/**
 * Returns true if `role` has at least the given `requiredRole` privilege.
 *
 * @example
 *   hasPermission(MemberRole.ADMIN, MemberRole.MEMBER) // true
 *   hasPermission(MemberRole.MEMBER, MemberRole.ADMIN) // false
 */
export function hasPermission(role: MemberRole, requiredRole: MemberRole): boolean {
  return ROLE_HIERARCHY.indexOf(role) >= ROLE_HIERARCHY.indexOf(requiredRole);
}

// ---------------------------------------------------------------------------
// Socket.IO room name helpers
// ---------------------------------------------------------------------------

/** Room for all members of a workspace (workspace-level events) */
export function workspaceRoom(workspaceId: string): string {
  return `workspace:${workspaceId}`;
}

/** Room for all members subscribed to a channel */
export function channelRoom(channelId: string): string {
  return `channel:${channelId}`;
}

/** Private room for a single user (notifications, DM pings) */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

/**
 * Asserts that required environment variables are set.
 * Call at server startup — will throw if any are missing.
 */
export function assertEnv(keys: string[]): void {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/** Required environment variables for the application to start */
export const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'AUTH_SECRET',
] as const;
