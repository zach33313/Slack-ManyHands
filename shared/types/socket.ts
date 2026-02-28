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
// Existing Client → Server payload types
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
  /** Optional poll to create alongside the message (from /poll slash command) */
  poll?: { question: string; options: string[] };
  /** Optional audio metadata for voice messages recorded in the composer */
  audioMetadata?: { fileName: string; mimeType: string; size: number; duration: number };
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
// Existing Server → Client payload types
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
// NEW: Call signaling — Client → Server payloads
// ---------------------------------------------------------------------------

/** Call type: 1:1 direct call or group huddle */
export type CallType = '1:1' | 'huddle';

export interface CallInitiatePayload {
  channelId: string;
  type: CallType;
}

export interface CallAcceptPayload {
  callId: string;
}

export interface CallDeclinePayload {
  callId: string;
}

export interface CallHangupPayload {
  callId: string;
}

export interface CallSignalPayload {
  callId: string;
  toUserId: string;
  /** simple-peer signal data — opaque, never inspect */
  signal: unknown;
}

export interface CallToggleMediaPayload {
  callId: string;
  isMuted: boolean;
  isCameraOn: boolean;
}

// ---------------------------------------------------------------------------
// NEW: Call signaling — Server → Client payloads
// ---------------------------------------------------------------------------

export interface CallIncomingPayload {
  callId: string;
  channelId: string;
  callerId: string;
  callerName: string;
  type: CallType;
}

export interface CallAcceptedPayload {
  callId: string;
  userId: string;
}

export interface CallDeclinedPayload {
  callId: string;
  userId: string;
}

export interface CallSignalFromServerPayload {
  callId: string;
  fromUserId: string;
  /** simple-peer signal data — opaque, never inspect */
  signal: unknown;
}

export interface CallEndedPayload {
  callId: string;
  /** 'hangup' | 'declined' | 'missed' | 'error' */
  reason: string;
}

export interface CallMediaToggledPayload {
  callId: string;
  userId: string;
  isMuted: boolean;
  isCameraOn: boolean;
}

// ---------------------------------------------------------------------------
// NEW: Huddle events — Client → Server payloads
// ---------------------------------------------------------------------------

export interface HuddleJoinPayload {
  channelId: string;
}

export interface HuddleLeavePayload {
  channelId: string;
}

export interface HuddleSignalPayload {
  channelId: string;
  toUserId: string;
  /** simple-peer signal data — opaque, never inspect */
  signal: unknown;
}

export interface HuddleToggleMediaPayload {
  channelId: string;
  isMuted: boolean;
  isCameraOn: boolean;
}

// ---------------------------------------------------------------------------
// NEW: Huddle events — Server → Client payloads
// ---------------------------------------------------------------------------

export interface HuddleParticipant {
  userId: string;
  user: UserSummary;
  isMuted: boolean;
  isCameraOn: boolean;
  joinedAt: Date;
}

export interface HuddleStartedPayload {
  channelId: string;
  participants: HuddleParticipant[];
}

export interface HuddleUserJoinedPayload {
  channelId: string;
  participant: HuddleParticipant;
}

export interface HuddleUserLeftPayload {
  channelId: string;
  userId: string;
}

export interface HuddleSignalFromServerPayload {
  channelId: string;
  fromUserId: string;
  signal: unknown;
}

export interface HuddleParticipantsPayload {
  channelId: string;
  participants: HuddleParticipant[];
}

export interface HuddleMediaToggledPayload {
  channelId: string;
  userId: string;
  isMuted: boolean;
  isCameraOn: boolean;
}

export interface HuddleEndedPayload {
  channelId: string;
}

// ---------------------------------------------------------------------------
// NEW: Poll events — Client → Server payloads
// ---------------------------------------------------------------------------

export interface PollVotePayload {
  pollId: string;
  option: string;
}

export interface PollUnvotePayload {
  pollId: string;
  option: string;
}

export interface PollEndPayload {
  pollId: string;
}

// ---------------------------------------------------------------------------
// NEW: Poll events — Server → Client payloads
// ---------------------------------------------------------------------------

export interface PollVoteGroup {
  option: string;
  count: number;
  userIds: string[];
  percentage: number;
}

export interface PollUpdatedPayload {
  pollId: string;
  votes: PollVoteGroup[];
  totalVotes: number;
}

export interface PollEndedPayload {
  pollId: string;
}

// ---------------------------------------------------------------------------
// NEW: Canvas events — Client → Server payloads
// ---------------------------------------------------------------------------

export interface CanvasJoinPayload {
  canvasId: string;
}

export interface CanvasLeavePayload {
  canvasId: string;
}

export interface CanvasUpdatePayload {
  canvasId: string;
  /** Yjs binary update encoded as base64 or Uint8Array */
  update: unknown;
}

export interface CanvasAwarenessPayload {
  canvasId: string;
  /** Yjs awareness state for the current user */
  state: unknown;
}

// ---------------------------------------------------------------------------
// NEW: Canvas events — Server → Client payloads
// ---------------------------------------------------------------------------

export interface CanvasInitialStatePayload {
  canvasId: string;
  /** Full Yjs document state for initial sync */
  state: unknown;
}

export interface CanvasUpdateFromServerPayload {
  canvasId: string;
  update: unknown;
}

export interface CanvasAwarenessFromServerPayload {
  canvasId: string;
  /** Map of userId → awareness state for all connected users */
  states: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// NEW: Read receipt events
// ---------------------------------------------------------------------------

export interface ChannelMarkReadPayload {
  channelId: string;
  messageId: string;
}

export interface ChannelUserReadPayload {
  channelId: string;
  messageId: string;
  userId: string;
  readAt: Date;
}

// ---------------------------------------------------------------------------
// NEW: Workflow events — Server → Client payloads
// ---------------------------------------------------------------------------

export interface WorkflowExecutedPayload {
  workflowId: string;
  workspaceId: string;
  triggeredBy: string;
  status: 'success' | 'failed' | 'partial';
}

// ---------------------------------------------------------------------------
// Socket.IO typed event maps
// ---------------------------------------------------------------------------

/**
 * Events the client sends to the server.
 * Key: event name, Value: callback with payload argument(s).
 */
export interface ClientToServerEvents {
  // --- Existing events ---

  /** Join workspace room to receive workspace-level events */
  'workspace:join': (payload: WorkspaceJoinPayload) => void;

  /** Subscribe to a channel's message and typing events */
  'channel:join': (payload: ChannelJoinPayload) => void;

  /** Unsubscribe from a channel */
  'channel:leave': (payload: ChannelLeavePayload) => void;

  /** Send a new message or thread reply */
  'message:send': (payload: MessageSendPayload, ack?: (res: { ok: boolean; error?: string }) => void) => void;

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

  // --- NEW: Call events ---

  /** Initiate a 1:1 call or channel huddle */
  'call:initiate': (payload: CallInitiatePayload) => void;

  /** Accept an incoming call */
  'call:accept': (payload: CallAcceptPayload) => void;

  /** Decline an incoming call */
  'call:decline': (payload: CallDeclinePayload) => void;

  /** Hang up / leave an active call */
  'call:hangup': (payload: CallHangupPayload) => void;

  /** Send a WebRTC signaling message to a specific peer */
  'call:signal': (payload: CallSignalPayload) => void;

  /** Toggle microphone or camera state in a call */
  'call:toggle-media': (payload: CallToggleMediaPayload) => void;

  // --- NEW: Huddle events ---

  /** Join a channel huddle (persistent group audio) */
  'huddle:join': (payload: HuddleJoinPayload) => void;

  /** Leave a channel huddle */
  'huddle:leave': (payload: HuddleLeavePayload) => void;

  /** Send a WebRTC signaling message to a huddle peer */
  'huddle:signal': (payload: HuddleSignalPayload) => void;

  /** Toggle microphone or camera in a huddle */
  'huddle:toggle-media': (payload: HuddleToggleMediaPayload) => void;

  // --- NEW: Poll events ---

  /** Cast a vote on a poll option */
  'poll:vote': (payload: PollVotePayload) => void;

  /** Remove a vote from a poll option */
  'poll:unvote': (payload: PollUnvotePayload) => void;

  /** End a poll early (creator or ADMIN+) */
  'poll:end': (payload: PollEndPayload) => void;

  // --- NEW: Canvas events ---

  /** Join a canvas room to receive Yjs updates */
  'canvas:join': (payload: CanvasJoinPayload) => void;

  /** Leave a canvas room */
  'canvas:leave': (payload: CanvasLeavePayload) => void;

  /** Broadcast a Yjs document update to other canvas editors */
  'canvas:update': (payload: CanvasUpdatePayload) => void;

  /** Broadcast Yjs awareness state (cursor position, selection) */
  'canvas:awareness': (payload: CanvasAwarenessPayload) => void;

  // --- NEW: Read receipts ---

  /** Mark a channel as read up to a specific message */
  'channel:mark-read': (payload: ChannelMarkReadPayload) => void;
}

/**
 * Events the server sends to clients.
 * Key: event name, Value: callback with payload argument(s).
 */
export interface ServerToClientEvents {
  // --- Existing events ---

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

  // --- NEW: Call events ---

  /** Notifies a user of an incoming call */
  'call:incoming': (payload: CallIncomingPayload) => void;

  /** Notifies call participants that a user accepted */
  'call:accepted': (payload: CallAcceptedPayload) => void;

  /** Notifies the caller that the callee declined */
  'call:declined': (payload: CallDeclinedPayload) => void;

  /** Relays a WebRTC signal from one peer to another */
  'call:signal': (payload: CallSignalFromServerPayload) => void;

  /** Notifies call participants that the call has ended */
  'call:ended': (payload: CallEndedPayload) => void;

  /** Notifies of a media toggle (mute/camera) from another participant */
  'call:media-toggled': (payload: CallMediaToggledPayload) => void;

  // --- NEW: Huddle events ---

  /** A huddle was started in a channel */
  'huddle:started': (payload: HuddleStartedPayload) => void;

  /** A user joined the channel huddle */
  'huddle:user-joined': (payload: HuddleUserJoinedPayload) => void;

  /** A user left the channel huddle */
  'huddle:user-left': (payload: HuddleUserLeftPayload) => void;

  /** Relays a WebRTC signal between huddle peers */
  'huddle:signal': (payload: HuddleSignalFromServerPayload) => void;

  /** Full participant list snapshot (sent on join) */
  'huddle:participants': (payload: HuddleParticipantsPayload) => void;

  /** Notifies of a media toggle from another huddle participant */
  'huddle:media-toggled': (payload: HuddleMediaToggledPayload) => void;

  /** The huddle has ended (all participants left) */
  'huddle:ended': (payload: HuddleEndedPayload) => void;

  // --- NEW: Poll events ---

  /** Vote counts changed — full snapshot */
  'poll:updated': (payload: PollUpdatedPayload) => void;

  /** Poll has ended (time expired or ended early) */
  'poll:ended': (payload: PollEndedPayload) => void;

  // --- NEW: Canvas events ---

  /** Initial canvas state for a newly joined editor */
  'canvas:initial-state': (payload: CanvasInitialStatePayload) => void;

  /** A Yjs document update from another editor */
  'canvas:update': (payload: CanvasUpdateFromServerPayload) => void;

  /** Awareness state update from other editors (cursors, selections) */
  'canvas:awareness': (payload: CanvasAwarenessFromServerPayload) => void;

  // --- NEW: Read receipts ---

  /** Another user read up to a specific message in a channel */
  'channel:user-read': (payload: ChannelUserReadPayload) => void;

  // --- NEW: Workflow events ---

  /** A workspace workflow was executed (notifies admins) */
  'workflow:executed': (payload: WorkflowExecutedPayload) => void;
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
