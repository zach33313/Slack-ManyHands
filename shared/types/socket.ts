/**
 * shared/types/socket.ts
 *
 * Typed Socket.IO event maps for both client-to-server (ClientToServerEvents)
 * and server-to-client (ServerToClientEvents) communication.
 *
 * Both the server (server/socket-handlers/) and client (shared/lib/socket-client.ts)
 * import from this file to ensure event names and payload shapes stay in sync.
 *
 * Usage (server):
 *   import type { ClientToServerEvents, ServerToClientEvents } from '@/shared/types/socket'
 *   const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer)
 *
 * Usage (client):
 *   import type { ClientToServerEvents, ServerToClientEvents } from '@/shared/types/socket'
 *   const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(...)
 */

import type {
  MessageWithMeta,
  Channel,
  WorkspaceMember,
  ReactionGroup,
  Notification,
  TypingUser,
  PresenceStatus,
  UserSummary,
} from './index';

// ---------------------------------------------------------------------------
// Client → Server event payloads
// ---------------------------------------------------------------------------

export interface WorkspaceJoinPayload {
  workspaceId: string;
}

export interface ChannelJoinPayload {
  channelId: string;
}

export interface ChannelLeavePayload {
  channelId: string;
}

export interface MessageSendPayload {
  channelId: string;
  /** Tiptap JSON serialised as a plain object */
  content: Record<string, unknown>;
  /** ID of parent message when sending a thread reply */
  parentId?: string;
  /** IDs of files previously uploaded via POST /api/files */
  fileIds?: string[];
}

export interface MessageEditPayload {
  messageId: string;
  content: Record<string, unknown>;
}

export interface MessageDeletePayload {
  messageId: string;
}

export interface MessageReactPayload {
  messageId: string;
  emoji: string;
}

export interface MessageUnreactPayload {
  messageId: string;
  emoji: string;
}

export interface TypingStartPayload {
  channelId: string;
}

export interface TypingStopPayload {
  channelId: string;
}

// ---------------------------------------------------------------------------
// Server → Client event payloads
// ---------------------------------------------------------------------------

export interface MessageDeletedPayload {
  messageId: string;
  channelId: string;
}

export interface ReactionsUpdatedPayload {
  messageId: string;
  reactions: ReactionGroup[];
}

export interface TypingUsersPayload {
  channelId: string;
  users: TypingUser[];
}

export interface PresenceUpdatePayload {
  userId: string;
  status: PresenceStatus;
}

export interface ChannelArchivedPayload {
  channelId: string;
}

export interface MemberLeftPayload {
  userId: string;
  workspaceId: string;
}

export interface UnreadUpdatePayload {
  channelId: string;
  unreadCount: number;
  hasMention: boolean;
}

export interface DmParticipantsPayload {
  channelId: string;
  participants: UserSummary[];
}

// ---------------------------------------------------------------------------
// Socket.IO typed event maps
// ---------------------------------------------------------------------------

/**
 * Events the client sends to the server.
 * Key: event name, Value: callback with payload argument(s).
 */
export interface ClientToServerEvents {
  /** Join workspace room to receive workspace-level events */
  'workspace:join': (payload: WorkspaceJoinPayload) => void;

  /** Subscribe to a channel's message and typing events */
  'channel:join': (payload: ChannelJoinPayload) => void;

  /** Unsubscribe from a channel */
  'channel:leave': (payload: ChannelLeavePayload) => void;

  /** Send a new message or thread reply */
  'message:send': (payload: MessageSendPayload) => void;

  /** Edit an existing message */
  'message:edit': (payload: MessageEditPayload) => void;

  /** Soft-delete a message */
  'message:delete': (payload: MessageDeletePayload) => void;

  /** Add an emoji reaction to a message */
  'message:react': (payload: MessageReactPayload) => void;

  /** Remove an emoji reaction from a message */
  'message:unreact': (payload: MessageUnreactPayload) => void;

  /** Notify other members that the current user has started typing */
  'typing:start': (payload: TypingStartPayload) => void;

  /** Notify other members that the current user has stopped typing */
  'typing:stop': (payload: TypingStopPayload) => void;

  /** Heartbeat to keep presence status as online; send every 30s */
  'presence:heartbeat': () => void;
}

/**
 * Events the server sends to clients.
 * Key: event name, Value: callback with payload argument(s).
 */
export interface ServerToClientEvents {
  /** A new message was posted in a subscribed channel */
  'message:new': (message: MessageWithMeta) => void;

  /** A message was edited */
  'message:updated': (message: MessageWithMeta) => void;

  /** A message was soft-deleted */
  'message:deleted': (payload: MessageDeletedPayload) => void;

  /** Reactions on a message changed — full snapshot for simplicity */
  'reaction:updated': (payload: ReactionsUpdatedPayload) => void;

  /** A new reply was added to a thread */
  'thread:reply': (message: MessageWithMeta) => void;

  /** The set of typing users in a channel changed */
  'typing:users': (payload: TypingUsersPayload) => void;

  /** A user's presence status changed */
  'presence:update': (payload: PresenceUpdatePayload) => void;

  /** A new channel was created in the workspace */
  'channel:created': (channel: Channel) => void;

  /** A channel was updated (name, description, topic) */
  'channel:updated': (channel: Channel) => void;

  /** A channel was archived */
  'channel:archived': (payload: ChannelArchivedPayload) => void;

  /** A new member joined the workspace */
  'member:joined': (member: WorkspaceMember & { user: UserSummary }) => void;

  /** A member left or was removed from the workspace */
  'member:left': (payload: MemberLeftPayload) => void;

  /** A new notification (mention, DM, reaction, thread reply) */
  'notification:new': (notification: Notification) => void;

  /** Unread count update for a channel */
  'unread:update': (payload: UnreadUpdatePayload) => void;

  /** DM participant info for a newly created DM/GROUP_DM channel */
  'dm:participants': (payload: DmParticipantsPayload) => void;
}

/**
 * Data attached to each Socket.IO socket after auth middleware runs.
 * Access via socket.data in server handlers.
 */
export interface SocketData {
  /** Authenticated user's ID from NextAuth JWT */
  userId: string;
  /** Authenticated user's email */
  email: string;
  /** Current workspace ID (set after workspace:join) */
  workspaceId?: string;
}
