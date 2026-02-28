# Socket.IO Server Architecture & Event Handler Patterns

**Project**: Slack Clone
**Socket.IO Version**: 4.7.5
**Date**: February 2026
**Status**: Analysis of production architecture

---

## Executive Summary

The Socket.IO server is tightly integrated with Next.js on a single HTTP server, using NextAuth JWT for authentication. The architecture is organized by domain (messages, channels, presence, typing) with a consistent handler registration pattern. All real-time communication flows through typed Socket.IO rooms with specific naming conventions.

**Key characteristics**:
- ✅ Type-safe event definitions (TypeScript interfaces)
- ✅ Same-origin authentication (no CORS needed)
- ✅ Room-based broadcasting for scalability
- ✅ In-memory state for transient data (typing, presence)
- ✅ Clean separation of concerns across handler files

---

## 1. Server Architecture & Initialization

### HTTP Server Setup

**File**: `server.ts`

```typescript
const httpServer = createServer((req, res) => {
  const parsedUrl = parse(req.url!, true);
  handle(req, res, parsedUrl);
});

const io = new SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>(httpServer, {
  cors: undefined, // Same origin — CORS disabled
  pingTimeout: 60_000,
  pingInterval: 25_000,
});

globalThis.__socketio = io;
```

**Key points**:
- Single HTTP server handles both Next.js requests and Socket.IO WebSocket connections
- Socket.IO instance stored on `globalThis.__socketio` for API route access
- CORS disabled (same-origin setup) — session cookies sent automatically
- Ping/pong intervals configured for connection health (25s ping, 60s timeout)
- Fully typed with `ClientToServerEvents`, `ServerToClientEvents`, `SocketData` interfaces

### Startup Sequence

```typescript
app.prepare().then(() => {
  const httpServer = createServer(...);
  const io = new SocketIOServer(...);
  globalThis.__socketio = io;

  applyAuthMiddleware(io);    // 1. Apply authentication
  registerHandlers(io);       // 2. Register event handlers

  httpServer.listen(port, hostname, () => {
    console.log(`> Server listening on ${hostname}:${port}`);
  });
});
```

**Initialization order**:
1. Next.js app prepared
2. HTTP server created
3. Socket.IO server attached to HTTP server
4. Auth middleware applied
5. Event handlers registered
6. HTTP server listening

---

## 2. Authentication Architecture

### NextAuth JWT Validation

**File**: `server/socket-auth.ts`

Every Socket.IO connection is authenticated using NextAuth v5 JWT tokens:

```typescript
export function applyAuthMiddleware(io: AppServer): void {
  io.use(async (socket, next) => {
    try {
      const req = socket.request as typeof socket.request & {
        cookies?: Record<string, string>;
      };

      // NextAuth v5 cookie name depends on environment
      const cookieName =
        process.env.NODE_ENV === 'production'
          ? '__Secure-authjs.session-token'
          : 'authjs.session-token';

      // Parse cookies from raw Cookie header
      if (!req.cookies) {
        const cookieHeader = req.headers.cookie || '';
        req.cookies = Object.fromEntries(
          cookieHeader.split(';').map((c) => {
            const [key, ...rest] = c.trim().split('=');
            return [key, rest.join('=')];
          })
        );
      }

      // Use next-auth/jwt to validate JWT
      const token = await getToken({
        req: req as any,
        secret: process.env.AUTH_SECRET!,
        cookieName,
      });

      if (!token || !token.sub) {
        return next(new Error('unauthorized'));
      }

      // Attach authenticated user to socket.data
      socket.data.userId = token.sub;
      socket.data.email = (token.email as string) || '';

      next();
    } catch (err) {
      console.error('[socket-auth] Authentication error:', err);
      next(new Error('unauthorized'));
    }
  });
}
```

**How it works**:
1. Client connects with HTTP upgrade request (includes cookies)
2. Middleware extracts NextAuth session cookie from `Cookie` header
3. Validates JWT using `getToken()` with the auth secret
4. Attaches `userId` and `email` to `socket.data` for downstream handlers
5. Rejects connection if token is invalid or missing

**No manual token passing needed** — session cookies are sent automatically because Socket.IO runs on the same origin and port.

---

## 3. Room & Namespace Architecture

### Room Naming Conventions

Rooms are defined as constants in `shared/lib/constants.ts`:

```typescript
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
```

### Three-Tier Room Hierarchy

```
┌─ Workspace Room: workspace:${workspaceId}
│  └─ All members in workspace receive workspace-level events
│     - Presence updates (user online/offline)
│     - Channel created/archived
│     - Member joined/left
│
├─ Channel Room: channel:${channelId}
│  └─ All members subscribed to channel receive messages & typing
│     - Message sent/edited/deleted
│     - Typing indicators
│     - Reactions updated
│
└─ User Room: user:${userId}
   └─ Individual user receives personal notifications
      - Mentions (@mentions)
      - Direct messages
      - Thread replies
      - Unread count updates
```

### Socket Membership

When a socket connects:
1. **Always joined**: `user:${userId}` (personal notifications)
2. **On `workspace:join`**: `workspace:${workspaceId}` (workspace events)
3. **On `channel:join`**: `channel:${channelId}` (channel messages)

```typescript
// From server/socket-handlers/index.ts
socket.join(userRoom(userId)); // Always joined to personal room

// From socket-handlers/presence.ts
socket.on('workspace:join', ({ workspaceId }) => {
  socket.join(workspaceRoom(workspaceId));
});

// From socket-handlers/channels.ts
socket.on('channel:join', async ({ channelId }) => {
  const membership = await prisma.channelMember.findUnique(...);
  if (membership) {
    socket.join(channelRoom(channelId));
  }
});
```

---

## 4. Event Handler Registration Pattern

### Central Handler Registration

**File**: `server/socket-handlers/index.ts`

The `registerHandlers()` function is the central hub for registering all domain-specific handlers:

```typescript
export function registerHandlers(io: AppServer): void {
  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    console.log(`[socket] Connected: ${socket.id} (user: ${userId})`);

    // Join personal room
    socket.join(userRoom(userId));

    // Register all domain event handlers
    registerChannelHandlers(socket);
    registerMessageHandlers(socket);
    registerPresenceHandlers(socket);
    registerTypingHandlers(socket, io);

    // Log disconnections
    socket.on('disconnect', (reason) => {
      console.log(
        `[socket] Disconnected: ${socket.id} (user: ${userId}, reason: ${reason})`
      );
    });
  });
}
```

**Flow**:
1. `server.ts` calls `registerHandlers(io)` after auth middleware
2. Registers the global `connection` event listener
3. For each connecting socket, calls all domain-specific registration functions
4. Each domain handler registers its own event listeners on the socket

### Domain Handler Pattern

Each domain has a dedicated file with a registration function:

**Pattern**:
```typescript
// server/socket-handlers/[domain].ts

export function register[Domain]Handlers(socket: AppSocket): void {
  const userId = socket.data.userId;

  socket.on('[domain]:[action]', async (payload) => {
    try {
      // 1. Validate input
      if (!payload.required) return;

      // 2. Check authorization (database lookups)
      const resource = await prisma.[table].findUnique(...);
      if (!resource || !isAuthorized(userId, resource)) {
        console.warn('[domain] Unauthorized');
        return;
      }

      // 3. Mutate state (database writes)
      const result = await prisma.[table].create({...});

      // 4. Broadcast to relevant rooms
      socket.nsp.to(channelRoom(channelId)).emit('[domain]:[event]', result);
    } catch (err) {
      console.error('[domain] error:', err);
    }
  });
}
```

**Key characteristics**:
- Error handling: logs server-side, no client-side error acks (fire-and-forget)
- Authorization: validates user membership/permissions before mutations
- Database-driven: all state changes go through Prisma
- Broadcasting: emits to rooms after successful mutations
- Graceful degradation: handles missing resources silently

---

## 5. Implemented Event Handlers

### Messages (`server/socket-handlers/messages.ts`)

Handles real-time message operations with threading, reactions, and notifications.

**Events (Client → Server)**:

| Event | Payload | Behavior |
|-------|---------|----------|
| `message:send` | `{channelId, content, parentId?, fileIds?}` | Create message, emit `message:new`, trigger notifications |
| `message:edit` | `{messageId, content}` | Edit message, emit `message:updated` |
| `message:delete` | `{messageId}` | Soft-delete, emit `message:deleted` |
| `message:react` | `{messageId, emoji}` | Add reaction, emit `reaction:updated` |
| `message:unreact` | `{messageId, emoji}` | Remove reaction, emit `reaction:updated` |

**Events (Server → Client)**:

| Event | Payload | Trigger |
|-------|---------|---------|
| `message:new` | `MessageWithMeta` | After message created |
| `message:updated` | `MessageWithMeta` | After message edited |
| `message:deleted` | `{messageId, channelId}` | After message deleted |
| `reaction:updated` | `{messageId, reactions: ReactionGroup[]}` | After reaction added/removed |
| `thread:reply` | `MessageWithMeta` | After thread reply sent |

**Notification handling**:
- **@mentions**: Creates `MENTION` notification, emits to `user:${mentionedId}`
- **DMs**: Creates `DM` notification for non-sender members
- **Thread replies**: Creates `THREAD_REPLY` for thread participants
- **Unread updates**: Broadcasts `unread:update` to channel members

**Key implementation details**:
```typescript
// Message creation with full hydration
const fullMessage = await getMessageWithMeta(message.id);
socket.nsp.to(room).emit('message:new', fullMessage);

// Reaction groups (emoji → count + userIds)
const reactions = await getReactionGroups(messageId);
socket.nsp.to(channelRoom(message.channelId))
  .emit('reaction:updated', { messageId, reactions });

// Extract plain text from Tiptap JSON for notifications
const contentPlain = extractPlainText(content);
```

### Channels (`server/socket-handlers/channels.ts`)

Manages channel subscription and room membership.

**Events (Client → Server)**:

| Event | Payload | Behavior |
|-------|---------|----------|
| `channel:join` | `{channelId}` | Verify membership, join room, update `lastReadAt` |
| `channel:leave` | `{channelId}` | Leave room |

**Implementation**:
```typescript
socket.on('channel:join', async ({ channelId }) => {
  // Verify membership
  const membership = await prisma.channelMember.findUnique({
    where: { channelId_userId: { channelId, userId } }
  });

  if (!membership) {
    console.warn(`User ${userId} not a member of ${channelId}`);
    return;
  }

  socket.join(channelRoom(channelId));
  // Mark channel as read
  await prisma.channelMember.update({
    where: { channelId_userId: { channelId, userId } },
    data: { lastReadAt: new Date() }
  });
});
```

**No server→client events** — room join/leave is implicit.

### Presence (`server/socket-handlers/presence.ts`)

Tracks online status with heartbeat-based timeout mechanism.

**Events (Client → Server)**:

| Event | Payload | Behavior |
|-------|---------|----------|
| `workspace:join` | `{workspaceId}` | Join workspace room, store workspaceId on socket.data |
| `presence:heartbeat` | (none) | Reset 90s offline timer, emit `online` on first beat |
| `disconnect` | (reason) | Mark user offline, emit `offline` |

**Events (Server → Client)**:

| Event | Payload | Trigger |
|-------|---------|---------|
| `presence:update` | `{userId, status: PresenceStatus}` | User online/offline |

**In-memory state**:
```typescript
// Map userId → NodeJS.Timeout (expiry timer)
const presenceTimers = new Map<string, NodeJS.Timeout>();

// Client heartbeat every 30s, server marks offline after 90s of silence
socket.on('presence:heartbeat', () => {
  const isFirstHeartbeat = !presenceTimers.has(userId);

  clearTimeout(presenceTimers.get(userId));

  const timer = setTimeout(() => {
    markOffline(socket, userId);
  }, PRESENCE_TIMEOUT); // 90_000ms

  presenceTimers.set(userId, timer);

  if (isFirstHeartbeat) {
    // Broadcast online status to all workspace rooms
    socket.emit('presence:update', {
      userId,
      status: PresenceStatus.ONLINE,
    });
  }
});
```

**Database writes**: Only when user goes offline (`lastSeenAt` → `updatedAt` field)

### Typing (`server/socket-handlers/typing.ts`)

Displays real-time typing indicators with auto-expire.

**Events (Client → Server)**:

| Event | Payload | Behavior |
|-------|---------|----------|
| `typing:start` | `{channelId}` | Add to typing set, 3s auto-expire |
| `typing:stop` | `{channelId}` | Remove from typing set |
| `disconnect` | (reason) | Clean up typing entries |

**Events (Server → Client)**:

| Event | Payload | Trigger |
|-------|---------|---------|
| `typing:users` | `{channelId, users: TypingUser[]}` | Typing state changed |

**In-memory state**:
```typescript
// Map channelId → Map<userId, {userId, name, timeout}>
const typingByChannel = new Map<string, Map<string, TypingEntry>>();

socket.on('typing:start', async ({ channelId }) => {
  let channelTyping = typingByChannel.get(channelId);
  if (!channelTyping) {
    channelTyping = new Map();
    typingByChannel.set(channelId, channelTyping);
  }

  // Fetch user name from DB on first typing
  const user = await prisma.user.findUnique(...);
  const userName = user?.name || 'Someone';

  // Set 3s auto-expire
  const timeout = setTimeout(() => {
    removeTypingUser(channelId, userId);
    io.to(channelRoom(channelId)).emit('typing:users', {
      channelId,
      users: getTypingUsers(channelId),
    });
  }, TYPING_TIMEOUT); // 3_000ms

  channelTyping.set(userId, { userId, name: userName, timeout });

  // Broadcast to others (exclude sender)
  socket.to(channelRoom(channelId)).emit('typing:users', {
    channelId,
    users: getTypingUsers(channelId, userId), // excludes this userId
  });
});
```

**No database writes** — purely in-memory transient state

---

## 6. Event Broadcasting Patterns

### Three Broadcasting Methods

**1. Room broadcast with sender included**:
```typescript
// All sockets in room receive event (including sender)
socket.nsp.to(channelRoom(channelId)).emit('message:new', fullMessage);
```

**2. Room broadcast excluding sender**:
```typescript
// All sockets in room except sender receive event
socket.to(channelRoom(channelId)).emit('typing:users', { ... });
```

**3. Direct user notification**:
```typescript
// Emit to a specific user's personal room
socket.nsp.to(userRoom(mentionedId)).emit('notification:new', notificationData);
```

### Event Emitter Helper Functions

**File**: `server/socket-emitter.ts`

For use from API routes that don't have socket context:

```typescript
// Get the global Socket.IO instance
export function getIO(): AppServer {
  const io = globalThis.__socketio;
  if (!io) {
    throw new Error('Socket.IO server not initialized');
  }
  return io;
}

// Emit to all members of a channel
export function emitToChannel<E extends keyof ServerToClientEvents>(
  channelId: string,
  event: E,
  ...data: Parameters<ServerToClientEvents[E]>
): void {
  getIO().to(channelRoom(channelId)).emit(event, ...data);
}

// Emit to a specific user
export function emitToUser<E extends keyof ServerToClientEvents>(
  userId: string,
  event: E,
  ...data: Parameters<ServerToClientEvents[E]>
): void {
  getIO().to(userRoom(userId)).emit(event, ...data);
}

// Emit to all workspace members
export function emitToWorkspace<E extends keyof ServerToClientEvents>(
  workspaceId: string,
  event: E,
  ...data: Parameters<ServerToClientEvents[E]>
): void {
  getIO().to(workspaceRoom(workspaceId)).emit(event, ...data);
}
```

**Usage from API route**:
```typescript
// app/api/messages/route.ts
import { emitToChannel } from '@/server/socket-emitter';

export async function POST(req: Request) {
  const message = await createMessage(...);
  emitToChannel(channelId, 'message:new', messageWithMeta);
  return Response.json(message);
}
```

---

## 7. Type Safety Architecture

### Event Type Definitions

**File**: `shared/types/socket.ts`

```typescript
/** Client → Server events */
export interface ClientToServerEvents {
  'workspace:join': (payload: WorkspaceJoinPayload) => void;
  'channel:join': (payload: ChannelJoinPayload) => void;
  'message:send': (payload: MessageSendPayload) => void;
  'message:edit': (payload: MessageEditPayload) => void;
  'message:delete': (payload: MessageDeletePayload) => void;
  'message:react': (payload: MessageReactPayload) => void;
  'message:unreact': (payload: MessageUnreactPayload) => void;
  'typing:start': (payload: TypingStartPayload) => void;
  'typing:stop': (payload: TypingStopPayload) => void;
  'presence:heartbeat': () => void;
}

/** Server → Client events */
export interface ServerToClientEvents {
  'message:new': (message: MessageWithMeta) => void;
  'message:updated': (message: MessageWithMeta) => void;
  'message:deleted': (payload: MessageDeletedPayload) => void;
  'reaction:updated': (payload: ReactionsUpdatedPayload) => void;
  'thread:reply': (message: MessageWithMeta) => void;
  'typing:users': (payload: TypingUsersPayload) => void;
  'presence:update': (payload: PresenceUpdatePayload) => void;
  'channel:created': (channel: Channel) => void;
  'channel:updated': (channel: Channel) => void;
  'channel:archived': (payload: ChannelArchivedPayload) => void;
  'member:joined': (member: WorkspaceMember & { user: UserSummary }) => void;
  'member:left': (payload: MemberLeftPayload) => void;
  'notification:new': (notification: Notification) => void;
  'unread:update': (payload: UnreadUpdatePayload) => void;
  'dm:participants': (payload: DmParticipantsPayload) => void;
}

/** Data attached to socket after auth */
export interface SocketData {
  userId: string;
  email: string;
  workspaceId?: string;
}
```

**Benefits**:
- Full type safety on both client and server
- Auto-completion in IDE
- Compile-time checking of event names and payloads
- Single source of truth for event contracts

---

## 8. Data Flow Examples

### Example 1: Send a Message

```
Client: socket.emit('message:send', { channelId, content, parentId?, fileIds? })
  ↓
Server Handler (messages.ts):
  1. Validate: channelId, content provided
  2. Verify: User is member of channel
  3. Extract: Plain text, mentions from Tiptap JSON
  4. Create: Message record in DB + file associations
  5. Fetch: Full message with author, files, reactions
  6. Emit: socket.nsp.to(channelRoom).emit('message:new', fullMessage)
     ↓
All clients in channel room receive full message object
     ↓
If parent message: emit('thread:reply', ...)
     ↓
If @mentions: create MENTION notifications, emit('notification:new', ...) to user room(s)
     ↓
If DM channel: create DM notifications for other members
     ↓
If thread: create THREAD_REPLY for participants
     ↓
Update unread counts: emit('unread:update', ...) to affected user room(s)
```

### Example 2: User Comes Online

```
Client: socket.emit('presence:heartbeat')
  ↓
Server Handler (presence.ts):
  1. Check: Is this first heartbeat (not in presenceTimers)?
  2. Create: NodeJS.Timeout that expires in 90s
  3. Store: presenceTimers.set(userId, timer)
  4. If first: emit('presence:update', { userId, status: 'online' })
     to all workspace rooms this socket is in
     ↓
All workspace members see user as online
     ↓
Client should send heartbeat every 30s (PRESENCE_HEARTBEAT_INTERVAL)
     ↓
If no heartbeat for 90s (PRESENCE_TIMEOUT): markOffline() fires automatically
  - Clears timer
  - Emits ('presence:update', { userId, status: 'offline' })
  - Updates DB: user.updatedAt = now
```

### Example 3: Someone Starts Typing

```
Client: socket.emit('typing:start', { channelId })
  ↓
Server Handler (typing.ts):
  1. Get or create: typingByChannel.get(channelId)
  2. Fetch: User's display name from DB (cached if already fetched)
  3. Set: 3s auto-expire timeout
  4. Store: typingByChannel.get(channelId).set(userId, {userId, name, timeout})
  5. Emit: socket.to(channelRoom).emit('typing:users', {...})
     (excludes the typing user themselves)
     ↓
All other users in channel see typing indicator
     ↓
After 3s without new 'typing:start': auto-expire fires
  - Removes user from typingByChannel
  - Broadcasts updated list: emit('typing:users', { users: [remaining users] })
     ↓
Client should send 'typing:stop' when user stops
  - Or send 'typing:start' every 2s to keep alive
```

---

## 9. Adding New Event Handlers (Call, Huddles, Polls, Canvas, Read Receipts)

### Step-by-Step Guide

#### Step 1: Define Event Types

**Edit** `shared/types/socket.ts`:

```typescript
// Client → Server
export interface [Feature]StartPayload {
  channelId: string;
  // ... other fields
}

export interface [Feature]StopPayload {
  channelId: string;
  // ... other fields
}

// Server → Client
export interface [Feature]UpdatePayload {
  channelId: string;
  // ... updated state
}

// Add to ClientToServerEvents interface
export interface ClientToServerEvents {
  // ... existing events
  '[feature]:start': (payload: [Feature]StartPayload) => void;
  '[feature]:stop': (payload: [Feature]StopPayload) => void;
}

// Add to ServerToClientEvents interface
export interface ServerToClientEvents {
  // ... existing events
  '[feature]:updated': (payload: [Feature]UpdatePayload) => void;
}
```

#### Step 2: Create Handler File

**New file** `server/socket-handlers/[feature].ts`:

```typescript
import type { Socket, Server as SocketIOServer } from 'socket.io';
import { prisma } from '../../shared/lib/prisma';
import { channelRoom } from '../../shared/lib/constants';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../../shared/types/socket';

type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

type AppServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

// In-memory state (if needed)
const [feature]State = new Map<string, [Feature]Entry>();

export function register[Feature]Handlers(
  socket: AppSocket,
  io: AppServer
): void {
  const userId = socket.data.userId;

  socket.on('[feature]:start', async (payload) => {
    try {
      if (!payload.channelId) return;

      // 1. Validate & authorize
      const membership = await prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId: payload.channelId, userId } },
      });
      if (!membership) return;

      // 2. Store state (DB or in-memory)
      // 3. Broadcast update
      socket.nsp.to(channelRoom(payload.channelId)).emit('[feature]:updated', {
        channelId: payload.channelId,
        // ... event data
      });
    } catch (err) {
      console.error('[feature] [feature]:start error:', err);
    }
  });

  socket.on('[feature]:stop', async (payload) => {
    try {
      // ... similar pattern
    } catch (err) {
      console.error('[feature] [feature]:stop error:', err);
    }
  });

  socket.on('disconnect', () => {
    // Clean up any [feature]-related state for this user
  });
}
```

#### Step 3: Register Handler

**Edit** `server/socket-handlers/index.ts`:

```typescript
import { register[Feature]Handlers } from './[feature]';

export function registerHandlers(io: AppServer): void {
  io.on('connection', (socket) => {
    // ... existing code

    register[Feature]Handlers(socket, io);

    // ... existing code
  });
}
```

#### Step 4: Use from API Routes

**In route handlers** that need to push events:

```typescript
// app/api/[feature]/route.ts
import { emitToChannel } from '@/server/socket-emitter';

export async function POST(req: Request) {
  const { channelId } = await req.json();

  // Do work...

  emitToChannel(channelId, '[feature]:updated', {
    channelId,
    // ... event data
  });

  return Response.json({ ok: true });
}
```

### Pattern for Each Feature Type

#### **Calls/Huddles** (real-time presence-based)

```typescript
// In-memory state
const activeHuddles = new Map<string, {
  channelId: string;
  initiatorId: string;
  participants: Set<string>;
  startedAt: Date;
}>();

socket.on('huddle:start', async ({ channelId }) => {
  // Create huddle entry
  // Broadcast to channel: emit('huddle:update', {channelId, status: 'active'})
});

socket.on('huddle:join', async ({ channelId }) => {
  // Add user to huddle.participants
  // Broadcast: emit('huddle:update', {participants: [...]})
});

socket.on('disconnect', () => {
  // Remove from all active huddles
});
```

#### **Polls** (voting mechanism)

```typescript
socket.on('poll:create', async ({ channelId, question, options }) => {
  // Insert Poll record in DB
  // Emit: emit('poll:created', {pollId, question, options, createdBy})
});

socket.on('poll:vote', async ({ pollId, optionId }) => {
  // Insert Vote record in DB
  // Emit: emit('poll:updated', {pollId, votes: {optionId: count}})
});
```

#### **Canvas/Drawing** (collaborative)

```typescript
socket.on('canvas:draw', async ({ channelId, stroke }) => {
  // Save stroke to DB
  // Broadcast: emit('canvas:updated', {stroke, userId})
});

socket.on('canvas:clear', async ({ channelId }) => {
  // Clear canvas in DB
  // Broadcast: emit('canvas:cleared', {channelId})
});
```

#### **Read Receipts** (user awareness)

```typescript
socket.on('message:read', async ({ messageId, channelId }) => {
  // Upsert ReadReceipt in DB
  // Emit: emit('message:read-receipt', {messageId, userId, readAt})
});

// Track which messages user has seen (implicit via typing)
socket.on('channel:scroll-to', ({ channelId, messageId }) => {
  // Mark messages as implicitly read
  // Emit: emit('unread:update', {channelId, unreadCount, hasMention})
});
```

---

## 10. Scheduled Messages & Cron Scheduler Integration

### Current Status

**No scheduler currently implemented** in the codebase. This section provides the recommended integration point.

### Recommended Integration Point

**Location**: `server.ts` startup phase

```typescript
// server.ts
import { initScheduler } from './server/scheduler';

app.prepare().then(() => {
  const httpServer = createServer(...);
  const io = new SocketIOServer(...);
  globalThis.__socketio = io;

  applyAuthMiddleware(io);
  registerHandlers(io);

  // Initialize scheduled message sender
  initScheduler(io);

  httpServer.listen(port, hostname, () => {
    console.log(`> Server listening...`);
  });
});
```

### Scheduler Implementation Pattern

**New file** `server/scheduler.ts`:

```typescript
import type { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../shared/lib/prisma';
import { emitToChannel } from './socket-emitter';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../shared/types/socket';

type AppServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

let schedulerInterval: NodeJS.Timeout | null = null;

export async function initScheduler(io: AppServer): Promise<void> {
  console.log('[scheduler] Initializing scheduled message sender');

  // Check every minute for messages scheduled to send
  schedulerInterval = setInterval(async () => {
    try {
      const now = new Date();

      // Find messages scheduled for this minute
      const scheduledMessages = await prisma.scheduledMessage.findMany({
        where: {
          scheduledFor: {
            lte: now,
          },
          sent: false,
        },
      });

      for (const scheduled of scheduledMessages) {
        try {
          // Create the actual message
          const message = await prisma.message.create({
            data: {
              channelId: scheduled.channelId,
              userId: scheduled.userId,
              contentJson: scheduled.contentJson,
              contentPlain: scheduled.contentPlain,
            },
          });

          // Fetch with full metadata
          const fullMessage = await getMessageWithMeta(message.id);

          // Emit to channel
          emitToChannel(scheduled.channelId, 'message:new', fullMessage);

          // Mark as sent
          await prisma.scheduledMessage.update({
            where: { id: scheduled.id },
            data: { sent: true, sentAt: new Date() },
          });

          console.log(
            `[scheduler] Sent scheduled message ${scheduled.id} to channel ${scheduled.channelId}`
          );
        } catch (err) {
          console.error(`[scheduler] Failed to send scheduled message ${scheduled.id}:`, err);
        }
      }
    } catch (err) {
      console.error('[scheduler] Error checking scheduled messages:', err);
    }
  }, 60_000); // Check every minute
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[scheduler] Stopped');
  }
}
```

### Database Schema

Add to Prisma schema:

```prisma
model ScheduledMessage {
  id        String   @id @default(cuid())
  channelId String
  userId    String

  contentJson  String
  contentPlain String

  scheduledFor DateTime
  sent         Boolean  @default(false)
  sentAt       DateTime?

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  channel   Channel  @relation(fields: [channelId], references: [id])
  user      User     @relation(fields: [userId], references: [id])

  @@index([channelId, sent, scheduledFor])
}
```

### Alternative: Job Queue (Recommended for Production)

For higher scalability, use a job queue library like **Bull** or **BullMQ**:

```bash
npm install bull
npm install @types/bull --save-dev
```

```typescript
import Queue from 'bull';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
const scheduledMessageQueue = new Queue('scheduled-messages', redis);

// Schedule a message from API route
export async function scheduleMessage(
  channelId: string,
  userId: string,
  content: Record<string, unknown>,
  scheduledFor: Date
): Promise<void> {
  await scheduledMessageQueue.add(
    { channelId, userId, content },
    { delay: scheduledFor.getTime() - Date.now() }
  );
}

// Initialize processor in server.ts
export function initScheduler(io: AppServer): void {
  scheduledMessageQueue.process(async (job) => {
    const { channelId, userId, content } = job.data;
    // Create message and emit...
  });
}
```

---

## 11. Constants & Configuration

**File**: `shared/lib/constants.ts`

```typescript
// Presence & Typing
export const PRESENCE_HEARTBEAT_INTERVAL = 30_000;  // Client sends every 30s
export const PRESENCE_TIMEOUT = 90_000;             // Server marks offline after 90s
export const TYPING_TIMEOUT = 3_000;                // Typing indicator clears after 3s

// Server configuration (server.ts)
pingTimeout: 60_000,  // Disconnect if no pong for 60s
pingInterval: 25_000, // Send ping every 25s
```

---

## 12. Error Handling Strategy

The Socket.IO handlers use a **fire-and-forget** pattern:

```typescript
socket.on('message:send', async (payload) => {
  try {
    // Validate, authorize, mutate, broadcast
    socket.nsp.to(room).emit('message:new', data);
  } catch (err) {
    // Log on server, don't send error to client
    console.error('[messages] message:send error:', err);
    // Client will timeout waiting for confirmation
  }
});
```

**Why**:
- Socket.IO events don't have request/response semantics (not like REST)
- Callbacks are fire-and-forget
- Errors are logged server-side for monitoring
- Client detects issues via:
  - Optimistic UI rollback on timeout
  - Re-emitting on reconnect
  - Polling backend for state consistency

**Best practice**: Use acknowledgment callbacks for critical operations:

```typescript
socket.emit('message:send', payload, (ack) => {
  if (ack.error) {
    console.error('Failed to send:', ack.error);
  } else {
    console.log('Message sent:', ack.messageId);
  }
});
```

---

## 13. Security Considerations

✅ **Implemented**:
- NextAuth JWT validation on every connection
- User membership verification before room joins
- Authorization checks before mutations
- Soft-delete for messages (no permanent deletion without audit)
- @mention and thread notifications respect privacy

⚠️ **To consider**:
- Rate limiting on Socket.IO events (prevent spam)
- Message content validation (prevent XSS in Tiptap JSON)
- File upload validation (MIME types, size limits)
- Workspace member role checks (owner vs admin vs member)
- Typing indicator doesn't reveal presence to non-members

---

## 14. Testing Socket.IO Handlers

### Unit Test Example

```typescript
import { io, Socket } from 'socket.io-client';

describe('message:send', () => {
  let socket: Socket;

  beforeEach((done) => {
    socket = io('http://localhost:3000', {
      auth: { token: 'valid-jwt' },
    });
    socket.on('connect', () => done());
  });

  afterEach(() => {
    socket.disconnect();
  });

  it('should emit message:new when message sent', (done) => {
    socket.on('message:new', (message) => {
      expect(message.content).toBeDefined();
      expect(message.author).toBeDefined();
      done();
    });

    socket.emit('channel:join', { channelId: 'ch-123' }, () => {
      socket.emit('message:send', {
        channelId: 'ch-123',
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] },
      });
    });
  });
});
```

---

## 15. Summary & Quick Reference

| Aspect | Details |
|--------|---------|
| **Server** | Single HTTP server, Socket.IO on same origin, stored on `globalThis.__socketio` |
| **Auth** | NextAuth JWT validation on connection via middleware |
| **Rooms** | 3 types: `workspace:${id}`, `channel:${id}`, `user:${id}` |
| **Handlers** | One file per domain, registered in `index.ts`, called from `registerHandlers()` |
| **Broadcasting** | `socket.nsp.to(room).emit()` or `socket.to(room).emit()` (excludes sender) |
| **State** | Messages/reactions in DB; presence/typing in memory with auto-expire |
| **Types** | Fully typed via `ClientToServerEvents`, `ServerToClientEvents`, `SocketData` |
| **Adding handlers** | Create `socket-handlers/[feature].ts`, register in `index.ts`, define types in `socket.ts` |
| **Scheduler** | No current implementation; recommended init point is `server.ts` startup |

---

## Appendix: File Structure

```
server/
├── server.ts                           # Entry point, HTTP server setup
├── socket-auth.ts                      # NextAuth JWT validation middleware
├── socket-emitter.ts                   # Helper functions for emitting from API routes
└── socket-handlers/
    ├── index.ts                        # Central registration point
    ├── messages.ts                     # message:send/edit/delete/react/unreact
    ├── channels.ts                     # channel:join/leave
    ├── presence.ts                     # presence:heartbeat, workspace:join, online/offline
    └── typing.ts                       # typing:start/stop, typing indicator

shared/
├── types/
│   └── socket.ts                       # ClientToServerEvents, ServerToClientEvents, SocketData
└── lib/
    └── constants.ts                    # Room naming, timeouts, helper functions
```
