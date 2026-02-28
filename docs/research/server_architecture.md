# Server Architecture & Backend Patterns

**Project**: Slack Clone Real-Time Messaging Platform
**Last Updated**: February 28, 2026
**Scope**: Next.js server, Socket.IO handlers, server actions, authentication patterns

---

## Overview

The backend uses a hybrid server architecture:
- **Next.js API Routes + Server Actions** for traditional request/response
- **Socket.IO Event Handlers** for real-time pub/sub communication
- **Custom HTTP Server** (server.ts) integrating both

This allows features like message edits and reactions to update in real-time across all connected clients while maintaining clean separation of concerns.

---

## Server Architecture

### Custom HTTP Server (server.ts)

The application uses a **custom HTTP server** that combines Next.js with Socket.IO on a single port:

```typescript
import { createServer } from 'http'
import next from 'next'
import { Server as SocketIOServer } from 'socket.io'

const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true)
    handle(req, res, parsedUrl) // Next.js request handler
  })

  // Socket.IO on same HTTP server
  const io = new SocketIOServer(httpServer, { cors: undefined })

  // Auth middleware + handler registration
  applyAuthMiddleware(io)
  registerHandlers(io)

  // Single listen
  httpServer.listen(port)
})
```

**Key Benefits**:
- ✅ Single port for both HTTP + WebSocket (no CORS issues)
- ✅ NextAuth session cookies automatically sent on Socket.IO handshake
- ✅ Session validation works without manual JWT passing
- ✅ Unified logging and monitoring

**Build Process**:
- Development: `tsx watch server.ts` (hot reload)
- Production: `npm run build` builds Next.js + bundles server.ts with tsup → `node dist/server/server.js`

---

## Authentication Flow

### Next.js Authentication (NextAuth v5)

**Location**: `auth/auth.config.ts` + `auth/auth.ts`

**Providers**:
- Email/password with bcrypt hashing
- OAuth (GitHub, Google, etc. - optional)
- NextAuth adapter: Prisma storage

```typescript
// auth/auth.config.ts
import { PrismaAdapter } from "@auth/prisma-adapter"
import CredentialsProvider from "next-auth/providers/credentials"

export const authConfig = {
  providers: [
    CredentialsProvider({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        })
        if (!user) return null

        const validPassword = await bcrypt.compare(
          credentials.password,
          user.password
        )
        if (!validPassword) return null

        return { id: user.id, email: user.email, name: user.name }
      }
    })
  ],
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  jwt: {
    secret: process.env.NEXTAUTH_SECRET,
    maxAge: 30 * 24 * 60 * 60 // 30 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    async session({ session, token }) {
      session.user.id = token.id as string
      return session
    }
  }
}
```

**Usage in Server Actions**:
```typescript
import { auth } from '@/auth/auth'

export async function getUserProfile() {
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')

  return prisma.user.findUnique({
    where: { id: session.user.id }
  })
}
```

### Socket.IO Authentication

**Location**: `server/socket-auth.ts`

**Handshake**: Client connects with NextAuth session cookie (same-origin, automatic)

**Middleware**:
```typescript
export function applyAuthMiddleware(io: AppServer) {
  io.use(async (socket, next) => {
    try {
      // Extract session from handshake auth headers (cookies sent automatically)
      const session = await auth()

      if (!session?.user) {
        return next(new Error('Unauthorized'))
      }

      // Attach user data to socket for use in handlers
      socket.data.userId = session.user.id
      socket.data.email = session.user.email

      next()
    } catch (error) {
      next(new Error('Authentication failed'))
    }
  })
}
```

**Socket Data** (attached to every socket):
```typescript
export interface SocketData {
  userId: string
  email: string
  workspaceId?: string // Set after workspace:join event
}
```

---

## Server Actions Pattern

Server Actions (`'use server'`) are Next.js functions that run **only on the server** and can be called from Client Components.

**Location**: Domain modules (`messages/actions.ts`, `channels/actions.ts`, etc.)

### Server Action Examples

#### Sending a Message

```typescript
// messages/actions.ts
'use server'

import { auth } from '@/auth/auth'
import { prisma } from '@/lib/db'
import { getIO } from '@/server/socket-emitter'

export async function sendMessage(payload: MessageSendPayload) {
  // 1. Authenticate
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')

  // 2. Validate permissions (user is in channel/workspace)
  const channel = await prisma.channel.findUnique({
    where: { id: payload.channelId },
    include: { workspace: true }
  })
  if (!channel) throw new Error('Channel not found')

  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: channel.workspaceId,
        userId: session.user.id
      }
    }
  })
  if (!member) throw new Error('Not a workspace member')

  // 3. Create message in database
  const message = await prisma.message.create({
    data: {
      channelId: payload.channelId,
      userId: session.user.id,
      contentJson: JSON.stringify(payload.content),
      contentPlain: extractPlainText(payload.content),
      parentId: payload.parentId,
      isEdited: false,
      isDeleted: false
    },
    include: {
      author: true,
      reactions: true,
      files: payload.fileIds?.length
        ? { where: { id: { in: payload.fileIds } } }
        : undefined
    }
  })

  // 4. Emit real-time event to all subscribers
  const io = getIO()
  io.to(`channel:${payload.channelId}`).emit('message:new', {
    ...message,
    reactions: [] // Will be populated by Socket.IO handler
  })

  // 5. Emit to parent message (thread notification)
  if (payload.parentId) {
    const parent = await prisma.message.findUnique({
      where: { id: payload.parentId }
    })
    if (parent) {
      io.to(`channel:${payload.channelId}`).emit('thread:reply', message)
      // Increment reply count in store
      io.to(`user:${parent.userId}`).emit('thread:reply', message)
    }
  }

  return message
}
```

#### Query Example

```typescript
// messages/queries.ts
'use server'

import { auth } from '@/auth/auth'
import { prisma } from '@/lib/db'

export async function getChannelMessages(
  channelId: string,
  { page = 1, limit = 50 } = {}
) {
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')

  // Verify user has access
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { workspace: true }
  })
  if (!channel) throw new Error('Channel not found')

  const isMember = await prisma.channelMember.findUnique({
    where: {
      channelId_userId: {
        channelId,
        userId: session.user.id
      }
    }
  })
  if (!isMember && channel.type === 'PRIVATE') {
    throw new Error('No access to private channel')
  }

  // Load messages with deduplication
  const messages = await prisma.message.findMany({
    where: {
      channelId,
      isDeleted: false
    },
    include: {
      author: {
        select: { id: true, name: true, email: true, image: true }
      },
      reactions: {
        include: { user: { select: { id: true, name: true } } }
      },
      files: true
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: (page - 1) * limit
  })

  // Update lastReadAt for this channel
  await prisma.channelMember.update({
    where: {
      channelId_userId: { channelId, userId: session.user.id }
    },
    data: { lastReadAt: new Date() }
  })

  return messages.reverse() // Oldest first for UI
}
```

**Key Patterns**:
1. ✅ Always authenticate first
2. ✅ Always check authorization (user has permission)
3. ✅ Database mutations first, then emit Socket.IO events
4. ✅ Return hydrated data with nested relations
5. ✅ Update secondary data (lastReadAt, reply counts) in same transaction when possible

---

## Socket.IO Handler Pattern

Socket.IO handlers live in `server/socket-handlers/`. Each handler:
1. Listens for client events
2. Validates + mutates database
3. Broadcasts to relevant rooms

### Message Handlers Example

**Location**: `server/socket-handlers/messages.ts`

```typescript
import type { Socket } from 'socket.io'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  MessageSendPayload
} from '@/shared/types/socket'

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>

export function registerMessageHandlers(socket: AppSocket) {
  socket.on('message:send', async (payload: MessageSendPayload) => {
    try {
      // 1. Validate user is in channel
      const channel = await prisma.channel.findUnique({
        where: { id: payload.channelId }
      })
      if (!channel) {
        socket.emit('error', { code: 'CHANNEL_NOT_FOUND' })
        return
      }

      // 2. Create message
      const message = await prisma.message.create({
        data: {
          channelId: payload.channelId,
          userId: socket.data.userId,
          contentJson: JSON.stringify(payload.content),
          contentPlain: extractPlainText(payload.content)
        },
        include: {
          author: { select: { id: true, name: true, image: true } },
          reactions: true
        }
      })

      // 3. Broadcast to channel subscribers
      socket.to(`channel:${payload.channelId}`).emit('message:new', message)

      // 4. Send confirmation back to sender (no duplication in UI)
      socket.emit('message:new', message)
    } catch (error) {
      console.error('[socket] message:send error:', error)
      socket.emit('error', {
        code: 'MESSAGE_SEND_FAILED',
        message: error.message
      })
    }
  })

  socket.on('message:react', async (payload) => {
    try {
      const { messageId, emoji } = payload

      // 1. Check if reaction already exists
      const existing = await prisma.reaction.findUnique({
        where: {
          userId_messageId_emoji: {
            userId: socket.data.userId,
            messageId,
            emoji
          }
        }
      })

      if (existing) {
        // Toggle: remove reaction
        await prisma.reaction.delete({
          where: {
            userId_messageId_emoji: {
              userId: socket.data.userId,
              messageId,
              emoji
            }
          }
        })
      } else {
        // Add reaction
        await prisma.reaction.create({
          data: {
            messageId,
            userId: socket.data.userId,
            emoji
          }
        })
      }

      // 2. Get updated reactions
      const reactions = await prisma.reaction.groupBy({
        by: ['emoji'],
        where: { messageId },
        _count: { id: true }
      })

      // 3. Broadcast updated reactions to channel
      socket.to(`channel:${payload.channelId}`).emit('reaction:updated', {
        messageId,
        reactions: reactions.map(r => ({
          emoji: r.emoji,
          count: r._count.id,
          users: await getReactionUsers(messageId, r.emoji)
        }))
      })
    } catch (error) {
      socket.emit('error', { code: 'REACTION_FAILED' })
    }
  })
}
```

**Handler Registration**:

```typescript
// server/socket-handlers/index.ts
export function registerHandlers(io: AppServer) {
  io.on('connection', (socket) => {
    const userId = socket.data.userId

    // Join personal user room
    socket.join(userRoom(userId))

    // Register all domain handlers
    registerMessageHandlers(socket)
    registerChannelHandlers(socket)
    registerPresenceHandlers(socket)
    registerTypingHandlers(socket, io)

    socket.on('disconnect', (reason) => {
      console.log(`Disconnected: ${userId} (reason: ${reason})`)
    })
  })
}
```

### Channel Join/Leave Pattern

```typescript
// server/socket-handlers/channels.ts
export function registerChannelHandlers(socket: AppSocket) {
  socket.on('channel:join', async (payload) => {
    const { channelId } = payload
    const userId = socket.data.userId

    try {
      // Verify user is channel member
      const membership = await prisma.channelMember.findUnique({
        where: {
          channelId_userId: { channelId, userId }
        }
      })
      if (!membership) {
        socket.emit('error', { code: 'NOT_CHANNEL_MEMBER' })
        return
      }

      // Join Socket.IO room for this channel
      socket.join(`channel:${channelId}`)

      // Optionally, update lastReadAt
      await prisma.channelMember.update({
        where: { channelId_userId: { channelId, userId } },
        data: { lastReadAt: new Date() }
      })

      console.log(`[socket] User ${userId} joined channel ${channelId}`)
    } catch (error) {
      socket.emit('error', { code: 'CHANNEL_JOIN_FAILED' })
    }
  })

  socket.on('channel:leave', async (payload) => {
    const { channelId } = payload
    socket.leave(`channel:${channelId}`)
    console.log(`[socket] User left channel ${channelId}`)
  })
}
```

---

## Socket.IO Emitter for API Routes

To emit Socket.IO events from **API routes** (where you don't have direct socket access):

**Location**: `server/socket-emitter.ts`

```typescript
declare global {
  var __socketio: SocketIOServer | undefined
}

export function getIO(): SocketIOServer {
  if (!globalThis.__socketio) {
    throw new Error('Socket.IO not initialized')
  }
  return globalThis.__socketio
}

// Usage in API Route
import { getIO } from '@/server/socket-emitter'

export async function POST(request: Request) {
  const io = getIO()

  // Emit to specific user
  io.to(`user:${userId}`).emit('notification:new', {
    type: 'MENTION',
    message: 'You were mentioned in #general'
  })

  // Emit to channel
  io.to(`channel:${channelId}`).emit('channel:updated', channel)

  return Response.json({ ok: true })
}
```

The Socket.IO instance is stored in `globalThis.__socketio` (set in server.ts) so it's accessible anywhere.

---

## Error Handling Patterns

### Socket.IO Error Handling

```typescript
socket.on('message:send', async (payload) => {
  try {
    // ... logic
  } catch (error) {
    console.error('[socket] Unhandled error:', error)

    // Emit typed error to client
    socket.emit('error', {
      code: error.code || 'INTERNAL_SERVER_ERROR',
      message: error.message || 'An error occurred',
      timestamp: new Date()
    })
  }
})
```

**Error Codes** (application-specific):
- `UNAUTHORIZED` - User not authenticated
- `FORBIDDEN` - User lacks permissions
- `NOT_FOUND` - Resource doesn't exist
- `CONFLICT` - Conflict (e.g., duplicate entry)
- `VALIDATION_ERROR` - Input validation failed
- `INTERNAL_SERVER_ERROR` - Unexpected server error

### Server Action Error Handling

```typescript
export async function deleteMessage(messageId: string) {
  try {
    const session = await auth()
    if (!session?.user) {
      throw new Error('Unauthorized')
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId }
    })
    if (!message) {
      throw new Error('Message not found')
    }

    if (message.userId !== session.user.id) {
      throw new Error('Only message author can delete')
    }

    // Soft delete
    await prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true, deletedAt: new Date() }
    })

    // Emit to subscribers
    const io = getIO()
    io.to(`channel:${message.channelId}`).emit('message:deleted', {
      messageId,
      channelId: message.channelId
    })

    return { success: true }
  } catch (error) {
    // Return error to client (will be thrown as Error boundary)
    throw error
  }
}
```

---

## Database Patterns

### Transaction Example

For operations requiring atomicity:

```typescript
export async function createChannelWithMembers(
  workspaceId: string,
  name: string,
  memberIds: string[]
) {
  return prisma.$transaction(async (tx) => {
    // 1. Create channel
    const channel = await tx.channel.create({
      data: {
        workspaceId,
        name,
        type: 'PRIVATE',
        createdById: currentUserId
      }
    })

    // 2. Add members (if channel creation fails, none added)
    const members = await tx.channelMember.createMany({
      data: memberIds.map(userId => ({
        channelId: channel.id,
        userId,
        joinedAt: new Date()
      }))
    })

    return { channel, members }
  })
}
```

### Query Optimization

Use `include` + `select` to shape response:

```typescript
// ❌ N+1 problem
const channels = await prisma.channel.findMany()
for (const channel of channels) {
  const members = await prisma.channelMember.findMany({
    where: { channelId: channel.id }
  })
}

// ✅ Optimized
const channels = await prisma.channel.findMany({
  include: {
    members: {
      select: { id: true, userId: true }
    }
  }
})

// ✅ Or select only needed fields
const channelPreview = await prisma.channel.findUnique({
  where: { id: channelId },
  select: {
    id: true,
    name: true,
    memberCount: { _count: true }
  }
})
```

### Pagination Pattern

```typescript
export async function getPaginatedMessages(
  channelId: string,
  { cursor, limit = 50 } = {}
) {
  const messages = await prisma.message.findMany({
    where: {
      channelId,
      isDeleted: false,
      ...(cursor && { id: { lt: cursor } }) // Cursor-based
    },
    include: { author: true, reactions: true },
    orderBy: { createdAt: 'desc' },
    take: limit + 1 // Get +1 to check if more exists
  })

  const hasMore = messages.length > limit
  const items = messages.slice(0, limit)
  const nextCursor = items[items.length - 1]?.id

  return { items, hasMore, nextCursor }
}
```

---

## Testing Patterns

### Socket.IO Handler Test

```typescript
// __tests__/server/socket-handlers/messages.test.ts
import { registerMessageHandlers } from '@/server/socket-handlers/messages'
import { jest } from '@jest/globals'

describe('Message Handlers', () => {
  it('should send message and broadcast to channel', async () => {
    const socket = {
      data: { userId: 'user123' },
      emit: jest.fn(),
      to: jest.fn().mockReturnValue({ emit: jest.fn() })
    }

    registerMessageHandlers(socket as any)

    const payload = {
      channelId: 'ch123',
      content: { type: 'doc', content: [] }
    }

    // Simulate client event
    await socket.on('message:send')

    // Assertions
    expect(prisma.message.create).toHaveBeenCalled()
    expect(socket.to).toHaveBeenCalledWith('channel:ch123')
  })
})
```

### Server Action Test

```typescript
// __tests__/messages.test.ts
import { sendMessage } from '@/messages/actions'
import { auth } from '@/auth/auth'

jest.mock('@/auth/auth')

describe('sendMessage action', () => {
  it('should create message and emit event', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce({
      user: { id: 'user123', email: 'user@example.com' }
    })

    const message = await sendMessage({
      channelId: 'ch123',
      content: { type: 'doc' }
    })

    expect(message).toHaveProperty('id')
    expect(message.userId).toBe('user123')
  })

  it('should fail if user not authenticated', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce(null)

    await expect(
      sendMessage({ channelId: 'ch123', content: {} })
    ).rejects.toThrow('Unauthorized')
  })
})
```

---

## Performance Considerations

### Database Query Performance

1. **Add indexes** for frequently filtered fields:
   ```prisma
   @@index([channelId, createdAt(sort: Desc)])
   @@index([userId])
   ```

2. **Use pagination** - Never load all records:
   ```typescript
   // Load 50 at a time, implement infinite scroll
   const messages = await prisma.message.findMany({
     take: 50,
     skip: (page - 1) * 50
   })
   ```

3. **Defer heavy computations** - Use background jobs for aggregations

### Socket.IO Optimization

1. **Debounce typing indicators** (300ms):
   ```typescript
   const typingTimeout = setTimeout(() => {
     socket.emit('typing:stop', { channelId })
   }, 300)
   ```

2. **Batch presence updates** (30s heartbeat):
   ```typescript
   socket.on('presence:heartbeat', async () => {
     // Update lastSeen timestamp
     // Broadcast presence batch every 30s
   })
   ```

3. **Use room-scoped broadcasting**:
   ```typescript
   // Only broadcast to subscribed clients
   socket.to(`channel:${channelId}`).emit('message:new', message)
   ```

### Memory Management

1. **Clean up disconnected users** from presence map
2. **Limit typing indicator duration** (auto-clear after 5s inactivity)
3. **Paginate message loads** instead of loading all at once

---

## Deployment Checklist

- [ ] Environment variables set (DATABASE_URL, NEXTAUTH_SECRET, AWS credentials)
- [ ] Database migrations applied (`npm run db:migrate`)
- [ ] Session store configured (default: database, consider Redis for scale)
- [ ] S3 bucket and credentials configured
- [ ] CORS properly configured for production domain
- [ ] Logging configured (Winston, Pino, or similar)
- [ ] Error tracking enabled (Sentry, etc.)
- [ ] Database backups configured
- [ ] Health check endpoint working (`GET /api/health`)
- [ ] Build process tested (`npm run build && npm start`)

---

## Summary

This backend architecture provides:

✅ **Unified authentication** - NextAuth + Socket.IO via same-origin cookies
✅ **Flexible API surface** - Server Actions + Socket.IO handlers for different use cases
✅ **Real-time capability** - Socket.IO with typed event handlers
✅ **Type safety** - Full TypeScript coverage across all layers
✅ **Database independence** - Prisma ORM with migration support
✅ **Performance** - Pagination, indexing, debouncing, batching
✅ **Error handling** - Consistent error patterns and codes
✅ **Testing support** - Clear patterns for unit and integration tests

Implementation workers can follow these patterns to add new features consistently and efficiently.
