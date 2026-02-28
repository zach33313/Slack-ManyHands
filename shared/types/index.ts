/**
 * shared/types/index.ts
 *
 * Core domain types used across the entire application.
 * All implementation workers should import from here rather than defining their own types.
 *
 * DO NOT import Prisma types directly in frontend code — use these types instead.
 * The Prisma client types are an implementation detail of the database layer.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Role a user holds within a workspace */
export enum MemberRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

/** Type of a channel */
export enum ChannelType {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE',
  /** Direct message channel between two users */
  DM = 'DM',
  /** Group direct message channel */
  GROUP_DM = 'GROUP_DM',
}

/** User online presence state */
export enum PresenceStatus {
  ONLINE = 'online',
  AWAY = 'away',
  OFFLINE = 'offline',
}

/** Types of notifications a user can receive */
export enum NotificationType {
  MENTION = 'MENTION',
  DM = 'DM',
  THREAD_REPLY = 'THREAD_REPLY',
  REACTION = 'REACTION',
}

// ---------------------------------------------------------------------------
// Tiptap JSON document types
// ---------------------------------------------------------------------------

/**
 * A Tiptap ProseMirror node — stored as JSON in the database `messages.content_json` column.
 * Use renderToReactElement() from @tiptap/static-renderer to render without a ProseMirror instance.
 */
export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

/** Top-level Tiptap document — always has type: 'doc' */
export interface TiptapJSON {
  type: 'doc';
  content: TiptapNode[];
}

// ---------------------------------------------------------------------------
// User types
// ---------------------------------------------------------------------------

/** Minimal user summary embedded in other responses (e.g., message author) */
export interface UserSummary {
  id: string;
  name: string;
  image: string | null;
}

/** Full user record returned by /api/users/[userId]/profile */
export interface User extends UserSummary {
  email: string;
  title: string | null;
  statusText: string | null;
  statusEmoji: string | null;
  timezone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Payload for updating the current user's profile */
export interface UpdateProfileInput {
  name?: string;
  image?: string;
  title?: string;
  statusText?: string;
  statusEmoji?: string;
  timezone?: string;
}

// ---------------------------------------------------------------------------
// Workspace types
// ---------------------------------------------------------------------------

export interface Workspace {
  id: string;
  name: string;
  /** URL-safe identifier e.g. "acme-corp" */
  slug: string;
  iconUrl: string | null;
  ownerId: string;
  createdAt: Date;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: MemberRole;
  joinedAt: Date;
  /** Hydrated user data — always present in list responses */
  user: UserSummary;
}

export interface CreateWorkspaceInput {
  name: string;
  /** If omitted, auto-generated from name */
  slug?: string;
}

// ---------------------------------------------------------------------------
// Channel types
// ---------------------------------------------------------------------------

export interface Channel {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  type: ChannelType;
  isArchived: boolean;
  createdById: string;
  createdAt: Date;
}

/** Channel with computed metadata — used in sidebar */
export interface ChannelWithMeta extends Channel {
  unreadCount: number;
  memberCount: number;
}

export interface ChannelMember {
  id: string;
  channelId: string;
  userId: string;
  lastReadAt: Date | null;
  notifyPref: string;
  joinedAt: Date;
}

export interface CreateChannelInput {
  workspaceId: string;
  name: string;
  description?: string;
  type: ChannelType.PUBLIC | ChannelType.PRIVATE;
  memberIds?: string[];
}

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

/** Grouped emoji reactions on a message */
export interface ReactionGroup {
  emoji: string;
  count: number;
  /** IDs of users who reacted with this emoji */
  userIds: string[];
  /** Whether the currently authenticated user has reacted — populated in client contexts */
  hasReacted?: boolean;
}

/** File attached to a message */
export interface FileAttachment {
  id: string;
  name: string;
  url: string;
  size: number;
  mimeType: string;
  /** Width in pixels (images/video only) */
  width: number | null;
  /** Height in pixels (images/video only) */
  height: number | null;
}

/** Base message object — DB shape without hydrated relations */
export interface Message {
  id: string;
  channelId: string;
  userId: string;
  /** Tiptap JSON document */
  content: TiptapJSON;
  /** Stripped plain text — used for search index and notification previews */
  contentPlain: string;
  /** Non-null when this message is a reply in a thread */
  parentId: string | null;
  /** Denormalized count of direct thread replies */
  replyCount: number;
  isEdited: boolean;
  isDeleted: boolean;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
}

/** A poll vote group as included with a message */
export interface MessagePollVoteGroup {
  option: string;
  count: number;
  userIds: string[];
  percentage: number;
}

/** Poll attached to a message — included when a message was sent with /poll */
export interface MessagePoll {
  id: string;
  messageId: string;
  question: string;
  options: string[];
  isActive: boolean;
  /** When true, voters may select more than one option */
  multiChoice: boolean;
  endsAt: Date;
  votes: MessagePollVoteGroup[];
  totalVotes: number;
  createdAt: Date;
}

/** Message with hydrated relations — used in API responses and Socket.IO events */
export interface MessageWithMeta extends Message {
  /** Hydrated author record */
  author: UserSummary;
  files: FileAttachment[];
  reactions: ReactionGroup[];
  /** Attached poll, if the message was sent with /poll */
  poll?: MessagePoll;
}

/** Input for creating a new message or thread reply */
export interface SendMessageInput {
  channelId: string;
  content: TiptapJSON;
  /** Provide to create a thread reply */
  parentId?: string;
  /** File IDs from a prior /api/files upload */
  fileIds?: string[];
}

// ---------------------------------------------------------------------------
// File types
// ---------------------------------------------------------------------------

export interface FileUploadResult {
  id: string;
  name: string;
  url: string;
  size: number;
  mimeType: string;
}

// ---------------------------------------------------------------------------
// Search types
// ---------------------------------------------------------------------------

export interface SearchResult {
  type: 'message' | 'channel' | 'file';
  score: number;
  message?: MessageWithMeta;
  channel?: Channel;
  file?: FileAttachment;
}

export interface SearchFilters {
  workspaceId: string;
  query: string;
  type?: 'messages' | 'channels' | 'files';
  channelId?: string;
  userId?: string;
  after?: Date;
  before?: Date;
}

// ---------------------------------------------------------------------------
// Notification types
// ---------------------------------------------------------------------------

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  /** JSON payload — shape varies by NotificationType */
  payload: NotificationPayload;
  readAt: Date | null;
  createdAt: Date;
}

export type NotificationPayload =
  | MentionPayload
  | DMPayload
  | ReactionPayload
  | ThreadReplyPayload;

export interface MentionPayload {
  messageId: string;
  channelId: string;
  workspaceId: string;
  actorId: string;
  preview: string;
}

export interface DMPayload {
  messageId: string;
  channelId: string;
  workspaceId: string;
  actorId: string;
  preview: string;
}

export interface ReactionPayload {
  messageId: string;
  channelId: string;
  workspaceId: string;
  actorId: string;
  emoji: string;
}

export interface ThreadReplyPayload {
  messageId: string;
  parentMessageId: string;
  channelId: string;
  workspaceId: string;
  actorId: string;
  preview: string;
}

// ---------------------------------------------------------------------------
// Presence types
// ---------------------------------------------------------------------------

export interface PresenceState {
  userId: string;
  status: PresenceStatus;
  lastSeenAt: Date;
}

export interface TypingUser {
  userId: string;
  name: string;
}
