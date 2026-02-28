# Slack Clone V2 — Codebase Overview & Architecture

**Last Updated**: February 28, 2026
**Project Status**: Active development
**Tech Stack**: Next.js 14 + TypeScript + Prisma + Socket.IO + Tailwind CSS

---

## 1. Project Summary

A production-ready Slack-like team communication platform built with modern Next.js 14, featuring:
- Real-time messaging with Socket.IO
- Collaborative whiteboarding (Yjs + Tiptap)
- Voice/video calls (WebRTC)
- Polls and surveys
- Scheduled messages with cron delivery
- Admin dashboard with analytics & audit logs
- Multi-workspace support with role-based access control (RBAC)
- Server-side rendering with streaming
- Type-safe end-to-end (Server Actions + Socket.IO + Prisma)

---

## 2. Technology Stack

### Frontend Frameworks & Libraries
| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 14.2.0 | App Router, Server Components, Server Actions |
| TypeScript | 5.4.0 | Type safety (strict mode enabled) |
| React | 18.3.0 | UI library |
| Tailwind CSS | 3.4.0 | Utility-first CSS framework |
| Tailwind Animate | 1.0.7 | Pre-built animation utilities |
| Radix UI | Latest | Accessible headless UI components (10+ packages) |

### Rich Text & Editing
| Technology | Version | Purpose |
|-----------|---------|---------|
| Tiptap | 3.0.0 | Collaborative rich text editor (Slack-style) |
| Tiptap Extensions | 3.0.0 | Code blocks, tables, mentions, emoji, etc. (9 packages) |
| Yjs | 13.6.0 | CRDT for collaborative editing |
| y-prosemirror | 1.2.0 | Yjs + ProseMirror integration |
| Lowlight | 3.1.0 | Syntax highlighting for code blocks |

### UI & Interaction
| Technology | Version | Purpose |
|-----------|---------|---------|
| Framer Motion | 11.0.0 | Smooth animations & micro-interactions |
| Lucide React | 0.400.0 | 400+ SVG icons |
| Radix UI Primitives | Latest | Popovers, dropdowns, dialogs, tabs, etc. |
| @floating-ui | 1.6.0 | Tooltip & popover positioning |
| @dnd-kit | 6.1.0 | Accessible drag-and-drop |
| Sonner | 2.0.7 | Toast notifications |
| emoji-mart | 5.6.0 | Emoji picker component |
| react-colorful | 5.6.0 | Color picker component |

### State Management & Forms
| Technology | Version | Purpose |
|-----------|---------|---------|
| Zustand | 5.0.11 | Lightweight client state (messages, threads, unread) |
| Zod | 3.23.0 | Schema validation for inputs |

### Data & Real-time
| Technology | Version | Purpose |
|-----------|---------|---------|
| Prisma Client | 5.14.0 | Type-safe database queries |
| Socket.IO Client | 4.7.5 | WebSocket + polling for real-time events |
| open-graph-scraper | 6.5.0 | Extract metadata from URLs (link previews) |

### Lists & Data Display
| Technology | Version | Purpose |
|-----------|---------|---------|
| react-virtuoso | 4.18.1 | Virtualized lists (millions of messages) |
| recharts | 2.12.0 | Charts for admin analytics |
| date-fns | 3.6.0 | Date parsing, formatting, math |

### Other Frontend Libraries
| Technology | Version | Purpose |
|-----------|---------|---------|
| next-auth | 5.0.0-beta.25 | Authentication client integration |
| next-themes | 0.4.6 | Dark/light mode switching |
| class-variance-authority | 0.7.0 | Component variants |
| clsx | 2.1.0 | Conditional CSS classes |
| tailwind-merge | 2.3.0 | Merge Tailwind classes intelligently |
| nanoid | 5.0.0 | Unique ID generation |
| canvas-confetti | 1.9.0 | Celebration animations |

### Backend / Server-side
| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 20+ (required) | Runtime |
| Socket.IO | 4.7.5 | Real-time WebSocket server |
| node-cron | 3.0.0 | Task scheduling (scheduled message delivery) |
| bcryptjs | 2.4.3 | Password hashing |
| @aws-sdk/client-s3 | 3.600.0 | AWS S3 file uploads |
| @aws-sdk/s3-request-presigner | 3.600.0 | S3 presigned URLs |
| sharp | 0.33.0 | Image processing (resize, optimize) |
| simple-peer | 9.11.1 | WebRTC peer connections |

### Testing & Development
| Technology | Version | Purpose |
|-----------|---------|---------|
| Jest | 30.2.0 | Test runner |
| ts-jest | 29.4.6 | Jest + TypeScript |
| @testing-library/react | 16.3.2 | Component testing utilities |
| @testing-library/jest-dom | 6.9.1 | DOM matchers |
| @testing-library/user-event | 14.6.1 | User interaction simulation |
| ESLint | 8.57.0 | Code linting |
| Prettier | 3.3.0 | Code formatting |

### Build & Bundling
| Technology | Version | Purpose |
|-----------|---------|---------|
| tsup | 8.1.0 | Bundle server code (TypeScript → CommonJS) |
| tsx | 4.15.0 | Execute TypeScript directly + watch mode |
| Prisma CLI | 5.14.0 | Schema management, migrations |

---

## 3. Architecture Overview

### Request/Response Flow

```
┌─ Browser User ────────────────────────────────────┐
│                                                    │
│  HTTP/HTTPS Requests                              │
│  ↓                                                 │
│  Next.js App Router (14.2.0)                     │
│  ├─ Server Components (zero JS)                   │
│  ├─ Server Actions (/api/actions)                 │
│  ├─ Route Handlers (/api/...)                     │
│  └─ Static/Dynamic pages                          │
│     ↓                                              │
│     Prisma Client → SQLite (dev) / PostgreSQL (prod)
│                                                    │
│  WebSocket Connection (upgrade from HTTP)         │
│  ↓                                                 │
│  Socket.IO Server                                 │
│  ├─ JWT Auth Middleware                           │
│  ├─ Event Handlers (messages, presence, etc.)     │
│  └─ Broadcast to Rooms (channel, user, workspace) │
│     ↓                                              │
│     Prisma mutations → Database                   │
│     Emit events → Connected clients               │
└────────────────────────────────────────────────────┘

Background Job (node-cron, every 60s)
↓
Scheduled Messages Cron
├─ Query ScheduledMessage (sentAt IS NULL)
├─ Atomically claim via updateMany
├─ Create real Message
└─ Emit notifications + unread:update
```

### Directory Structure (Domain-Driven Design)

```
slack-clone/
│
├── server.ts                              # Custom HTTP + Socket.IO entry point
├── server/                                # Node.js server code (NOT imported by frontend)
│   ├── socket-auth.ts                     # JWT validation middleware
│   ├── socket-emitter.ts                  # getIO() + broadcast helpers
│   ├── socket-handlers/                   # Event handlers per domain
│   │   ├── index.ts                       # Registers all handlers
│   │   ├── messages.ts                    # message:send, message:edit, etc.
│   │   ├── presence.ts                    # User online/offline status
│   │   ├── typing.ts                      # Typing indicators
│   │   ├── channels.ts                    # Channel join/leave
│   │   ├── calls.ts                       # WebRTC call handling
│   │   ├── huddles.ts                     # Voice channel huddles
│   │   ├── polls.ts                       # Poll voting
│   │   ├── canvas.ts                      # Collaborative canvas relay
│   │   └── read-receipts.ts               # Message read tracking
│   └── cron/
│       └── scheduled-messages.ts          # Scheduled message delivery job
│
├── prisma/                                # Database schema & migrations
│   ├── schema.prisma                      # 28 models (source of truth)
│   ├── seed.ts                            # Database seeder
│   └── migrations/                        # Auto-generated migration history
│
├── app/                                   # Next.js App Router
│   ├── layout.tsx                         # Root layout (providers)
│   ├── page.tsx                           # Home page (redirect to workspace)
│   ├── globals.css                        # Global styles + CSS variables
│   ├── (auth)/                            # Public routes
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (app)/                             # Protected routes
│   │   ├── layout.tsx                     # Workspace sidebar shell
│   │   └── [workspaceSlug]/               # Workspace route
│   │       ├── layout.tsx                 # Workspace layout
│   │       ├── page.tsx                   # Workspace home
│   │       ├── channel/[channelId]/       # Channel view
│   │       ├── dm/[userId]/               # DM conversation
│   │       ├── canvas/                    # Collaborative canvas
│   │       └── admin/                     # Admin dashboard
│   └── api/                               # Route Handlers
│       ├── auth/[...nextauth]/            # NextAuth endpoints
│       ├── workspaces/                    # Workspace API
│       ├── channels/                      # Channel API
│       ├── messages/                      # Message API
│       ├── files/                         # File upload API
│       ├── link-preview/                  # URL metadata API
│       ├── polls/                         # Poll API
│       ├── scheduled-messages/            # Scheduled message API
│       └── admin/                         # Admin APIs
│
├── shared/                                # Client + Server shared code
│   ├── types/
│   │   ├── index.ts                       # All types (Prisma + custom)
│   │   └── socket.ts                      # Socket.IO event types
│   ├── lib/
│   │   ├── prisma.ts                      # Prisma Client singleton
│   │   ├── constants.ts                   # Room names, enums
│   │   └── animations.ts                  # Framer Motion configs
│   └── hooks/                             # React hooks
│
├── [domain]/                              # Feature domains (organized by feature, not type)
│   ├── actions.ts                         # Server Actions (mutations)
│   ├── queries.ts                         # Server functions (reads)
│   ├── types.ts                           # Domain-specific types
│   ├── store.ts                           # Zustand state (optional)
│   └── components/                        # React components
│
├── auth/                                  # Authentication domain
│   ├── auth.config.ts                     # NextAuth configuration
│   ├── auth.ts                            # Auth utilities
│   ├── middleware.ts                      # Route protection
│   └── types.ts                           # Session types
│
├── components/                            # Shared UI components
│   ├── ui/                                # Radix + custom components
│   ├── editor/                            # Tiptap editor variants
│   ├── layout/                            # Workspace & channel layout
│   └── providers/                         # Context providers
│
├── __tests__/                             # Jest tests
│   ├── server/                            # Socket handler tests
│   ├── [domain]/                          # Domain-specific tests
│   └── ...
│
├── docs/research/                         # Architecture & research docs
│   └── codebase_overview.md               # (This file)
│
├── public/                                # Static assets
├── tailwind.config.ts                     # Tailwind configuration
├── tsconfig.json                          # TypeScript config (frontend)
├── tsconfig.server.json                   # TypeScript config (backend)
├── next.config.mjs                        # Next.js configuration
├── package.json                           # Dependencies & scripts
└── .env.example                           # Environment template
```

**Key Feature Domains** (organized by feature, not file type):
- `admin/` — Admin dashboard, analytics, audit logs
- `auth/` — Authentication via NextAuth
- `bookmarks/` — Save messages for later
- `calls/` — WebRTC voice/video calls
- `canvas/` — Collaborative whiteboarding
- `channels/` — Channel management
- `files/` — File uploads to S3
- `gifs/` — Tenor GIF search proxy
- `link-previews/` — Open Graph metadata caching
- `members/` — User profiles & workspace members
- `messages/` — Core messaging system
- `notifications/` — Notification management
- `polls/` — Surveys and voting
- `presence/` — User online/offline status
- `scheduling/` — Schedule message creation
- `search/` — Full-text search
- `workspaces/` — Workspace & team management
- `workflows/` — Message automation rules

---

## 4. Database Schema (28 Models)

### Authentication & User Management
1. **User** — User account (NextAuth required)
   - Fields: id, email, name, image, password, title, statusText, statusEmoji, timezone, dndUntil
2. **Account** — OAuth provider details (NextAuth required)
3. **Session** — JWT sessions (NextAuth required)
4. **VerificationToken** — Email verification (NextAuth required)

### Workspaces & Organization
5. **Workspace** — Team/organization container
   - Fields: id, slug, name, description, ownerId, createdAt
6. **WorkspaceMember** — User role in workspace
   - Fields: userId, workspaceId, role (ADMIN, MODERATOR, MEMBER)
7. **ChannelCategory** — Folder for organizing channels
8. **CustomEmoji** — Workspace-custom emoji reactions

### Messaging Core
9. **Channel** — Team/DM/GROUP_DM channel
   - Fields: id, name, slug, type, workspaceId, createdAt
10. **ChannelMember** — Channel membership
    - Fields: userId, channelId, mutedUntil, lastReadAt
11. **Message** — Individual message
    - Fields: id, channelId, userId, contentJson (Tiptap), contentPlain, parentId (for threads)
12. **Reaction** — Emoji reactions on messages
    - Fields: userId, messageId, emoji
13. **Pin** — Pinned messages
14. **Bookmark** — User-saved messages

### Advanced Messaging
15. **ScheduledMessage** — Messages queued for future delivery
    - Fields: id, channelId, userId, contentJson, contentPlain, scheduledFor, sentAt, isCancelled
16. **Poll** — Survey/poll with options
    - Fields: messageId, question, options (JSON), isActive, multiChoice, endsAt
17. **PollVote** — Individual votes
18. **LinkPreview** — Cached Open Graph metadata
    - Fields: url, title, description, imageUrl, messageId (optional for cache)
19. **FileAttachment** — Uploaded files
    - Fields: id, name, url, size, mimeType, userId, messageId

### Collaboration Features
20. **Canvas** — Collaborative whiteboard document
21. **CanvasVersion** — Version history snapshots
22. **Call** — Voice/video call session
    - Fields: id, workspaceId, initiatedById, type (VOICE, VIDEO, SCREEN_SHARE)
23. **CallParticipant** — User participation in call

### Notifications & Automation
24. **Notification** — User notifications
    - Fields: userId, actorId (who triggered), type (MENTION, DM, THREAD_REPLY, CALL_MISSED), payload (JSON)
25. **Workflow** — Message automation rules
    - Fields: workspaceId, createdById, trigger (message_posted, message_contains, etc.)
26. **WorkflowAction** — Specific action in workflow
    - Fields: workflowId, type (send_message, post_message, send_dm, add_reaction, post_thread_reply)
27. **WorkflowExecution** — Audit log for workflow runs
28. **AuditLog** — System-wide audit trail
    - Fields: workspaceId, userId, action, entityType, entityId, payload (JSON), createdAt

**Key Relationships**:
- User → many Workspaces (owner) + many Channels (member)
- Workspace → many Channels + many Members + many Workflows
- Channel → many Messages + many Members
- Message → many Reactions + many FileAttachments + optional Poll + optional ScheduledMessage
- ScheduledMessage → scheduled delivery → creates Message record

---

## 5. Key Architectural Patterns

### 5.1 Server Actions (Next.js 14)
All mutations go through Server Actions in domain `actions.ts`:
```typescript
// Example: messages/actions.ts
'use server';

export async function sendMessage(input: SendMessageInput): Promise<MessageWithMeta> {
  const userId = await requireUserId();  // Auth check from NextAuth session
  
  // 1. Validate input (parse channel membership, etc.)
  // 2. Create message in database
  // 3. Emit Socket.IO events to channel room
  // 4. Create notifications (mention, DM, thread reply)
  // 5. Return fully-typed MessageWithMeta
}
```
- **Type Safety**: Input validated via Zod, return type is Promise<T>
- **CSRF Protection**: Automatic (uses same-origin cookies)
- **Automatic Serialization**: Can pass complex objects, automatically JSON-serialized
- **Usage**: Called from Client Components via `'use client'` + direct function call

### 5.2 Socket.IO Real-Time Architecture
All real-time events via Socket.IO event handlers:
```typescript
// Example: server/socket-handlers/messages.ts
export function registerMessageHandlers(socket: AppSocket): void {
  socket.on('message:send', async ({ channelId, content, parentId, fileIds, poll }) => {
    try {
      // 1. Validate membership
      // 2. Create message in DB
      // 3. Broadcast to channel room
      socket.nsp.to(channelRoom(channelId)).emit('message:new', message);
      
      // 4. Emit notifications to individual user rooms
      socket.nsp.to(userRoom(mentionedId)).emit('notification:new', {...});
      
      // 5. Emit unread counts
      socket.nsp.to(userRoom(otherId)).emit('unread:update', {...});
    } catch (err) {
      console.error(err);  // Don't throw (socket events can't return errors)
    }
  });
}
```

**Room Naming Convention**:
- `channel:{channelId}` — All members of a channel
- `user:{userId}` — Private events for one user
- `workspace:{workspaceId}` — All members of a workspace

### 5.3 Atomic Operations & Race Condition Prevention
Use `prisma.$transaction()` for atomic multi-step operations:
```typescript
// Example: poll voting with race condition prevention
const [deleted, created] = await prisma.$transaction([
  prisma.pollVote.deleteMany({ where: { userId, pollId, option: newOption } }),
  prisma.pollVote.create({ data: { userId, pollId, option: newOption } }),
]);
```
- Ensures both operations complete together (no in-between state)
- Prevents double-voting and inconsistent state

**Per-Message Atomic Claiming** (scheduled messages):
```typescript
// Atomically claim scheduled message for delivery
const claimed = await prisma.scheduledMessage.updateMany({
  where: { id: sm.id, sentAt: null },  // Only if not yet sent
  data: { sentAt: now },
});
if (claimed.count === 0) continue;  // Another cron tick beat us to it
```

### 5.4 Authentication (NextAuth v5)
- **Providers**: Credentials (email/password) + Google OAuth
- **Session Storage**: HttpOnly cookie + JWT payload
- **Socket.IO Auth**: Validate JWT token on connection handshake
- **Protected Pages**: Wrap in `Suspense` + check `session` from `auth()`

### 5.5 Type Safety End-to-End
1. **Database**: Prisma auto-generates types from `schema.prisma`
2. **API Routes**: Input validated via Zod, return types explicit
3. **Server Actions**: Same as API routes
4. **Socket.IO**: Fully typed events via `ClientToServerEvents` + `ServerToClientEvents`
5. **Components**: Props typed via TypeScript interfaces
6. **Zustand**: Store state typed via generic `create<T>()`

### 5.6 Client State Management (Zustand)
```typescript
// Example: useMessagesStore
export const useMessagesStore = create<MessagesState>((set) => ({
  messagesByChannel: {},  // Map of channelId → Message[]
  threads: {},            // Map of parentMessageId → Message[]
  unreadCounts: {},       // Map of channelId → number
  
  addMessage: (message) => set((state) => ({
    messagesByChannel: {
      ...state.messagesByChannel,
      [message.channelId]: [...(state.messagesByChannel[message.channelId] || []), message],
    },
  })),
}));
```
- **Real-time Updates**: Socket.IO listeners call store mutations
- **Cursor Pagination**: Load older messages in chunks
- **Thread Isolation**: Separate store key for thread replies

### 5.7 File Upload Flow
1. User selects file → Client calls `/api/files` with file metadata
2. Server returns S3 presigned URL
3. Client uploads directly to S3 (not through server = faster)
4. Client sends message with `fileIds: [...]` array
5. Server connects File records to Message

### 5.8 Scheduled Messages Delivery
```
User creates scheduled message
  ↓
INSERT ScheduledMessage { scheduledFor: future, sentAt: null }
  ↓
Every 60 seconds (node-cron):
  ↓
1. Query ScheduledMessage WHERE sentAt IS NULL AND scheduledFor ≤ now
2. FOR EACH scheduled message:
   a. Atomically claim: UPDATE ... WHERE id=X AND sentAt=null SET sentAt=now
   b. If count=0, skip (already claimed by concurrent cron)
   c. Create real Message record
   d. Emit message:new to channel room
   e. Create notifications (@mention, DM, unread:update)
```

**Why Atomic Claiming?**: Prevents duplicate delivery if multiple cron processes run concurrently.

### 5.9 Notifications System
Created in three contexts:
1. **Server Actions** (`sendMessage` in `messages/actions.ts`)
   - @mention notifications
   - DM notifications (for DM + GROUP_DM channels)
   - Thread reply notifications

2. **Socket Handlers** (`message:send` in `server/socket-handlers/messages.ts`)
   - Same logic as Server Actions (for real-time socket connections)

3. **Cron Job** (scheduled message delivery)
   - Same notification logic as Server Actions + Socket handlers

**Notification Types**:
- `MENTION` — User was @mentioned in a message
- `DM` — Message in a direct message / group DM channel
- `THREAD_REPLY` — Reply to user's message in a thread
- `CALL_MISSED` — User missed an incoming call

---

## 6. Development Workflow

### Initial Setup
```bash
# Clone and install
git clone <repo>
cd slack-clone
pnpm install

# Setup environment
cp .env.example .env
# Edit .env with:
# - DATABASE_URL=file:./dev.db (SQLite)
# - GOOGLE_CLIENT_ID=xxx
# - GOOGLE_CLIENT_SECRET=xxx
# - AWS_ACCESS_KEY_ID=xxx
# - AWS_SECRET_ACCESS_KEY=xxx
# - AWS_S3_BUCKET=xxx
# - AWS_REGION=us-east-1

# Initialize database
npx prisma db push      # Push schema to DB
npm run db:seed         # Seed with demo data
```

### Development (`npm run dev`)
```bash
npm run dev
# Starts:
# - Next.js dev server (port 3000) with HMR
# - Custom HTTP + Socket.IO server with watch mode
# - Opens http://localhost:3000
```

### Database Management
```bash
# After editing prisma/schema.prisma:
npm run db:generate     # Regenerate Prisma client
npm run db:push         # Push to database (dev only, no migrations)

# Production workflow:
npm run db:migrate      # Create migration + apply
git add prisma/migrations/
git commit -m "..."

# Interactive DB browser
npm run db:studio
```

### Type Checking & Linting
```bash
# Type check without emitting
npx tsc --noEmit

# Fix linting issues
npm run lint -- --fix

# Format code
npm run format
```

### Testing
```bash
# Run all tests
npm test

# Watch mode (re-run on change)
npm test -- --watch

# Single test file
npm test __tests__/server/messages.test.ts

# With coverage
npm test -- --coverage
```

### Build & Deploy
```bash
# Type check + build Next.js + bundle server
npm run build

# Output:
# - .next/               (Next.js compiled app)
# - dist/server/         (Bundled server)

# Production startup
NODE_ENV=production npm start
# Listens on port 3000 (or $PORT env var)
```

---

## 7. Performance Optimizations

### Frontend
- **Server Components**: Zero JavaScript for content pages
- **Virtualized Lists**: `react-virtuoso` for rendering millions of messages efficiently
- **Code Splitting**: Dynamic imports for heavy features (emoji picker, canvas)
- **Image Optimization**: `next/image` + Sharp for WebP, srcset, resizing
- **Incremental Static Regeneration**: Cache workspace/channel pages

### Backend
- **Prisma Queries**: Use `include`/`select` to prevent N+1 queries
- **Database Indexes**: On frequently queried fields (userId, channelId, createdAt)
- **Socket.IO Rooms**: Broadcast to rooms, not individual clients
- **Atomic Transactions**: Prevent race conditions with `$transaction`
- **Per-Message Error Isolation**: Wrapping handlers in try/catch prevents cascading failures

### Storage
- **S3 Presigned URLs**: Clients upload directly to S3 (bypass server)
- **Image Processing**: Sharp resize + optimization on upload
- **CloudFront CDN**: Cache static assets + images

---

## 8. Common Code Patterns

### Server Action with Notifications
```typescript
'use server';

export async function sendMessage(input: SendMessageInput): Promise<MessageWithMeta> {
  const userId = await requireUserId();
  
  // Validate membership
  const membership = await prisma.channelMember.findUnique({...});
  if (!membership) throw new Error('Not a member');
  
  // Create message
  const message = await prisma.message.create({
    data: { channelId: input.channelId, userId, contentJson, contentPlain },
    include: { author: true, files: true, reactions: true },
  });
  
  // Emit Socket.IO events
  emitToChannel(input.channelId, 'message:new', message);
  
  // Create notifications
  const mentionedUserIds = extractMentionedUserIds(contentJson);
  for (const mentionedId of mentionedUserIds) {
    const notification = await prisma.notification.create({
      data: { userId: mentionedId, type: 'MENTION', payload: JSON.stringify({...}) },
    });
    emitToUser(mentionedId, 'notification:new', notification);
  }
  
  return message;
}
```

### Socket Handler with Atomic Transaction
```typescript
socket.on('poll:vote', async ({ pollId, option }) => {
  try {
    const [deleted, created] = await prisma.$transaction([
      prisma.pollVote.deleteMany({ where: { userId, pollId } }),
      prisma.pollVote.create({ data: { userId, pollId, option } }),
    ]);
    
    const poll = await getPollWithVotes(pollId);
    socket.nsp.to(channelRoom(poll.message.channelId))
      .emit('poll:updated', poll);
  } catch (err) {
    console.error(err);
  }
});
```

### Zustand Store Pattern
```typescript
export const useMessagesStore = create<MessagesState>((set, get) => ({
  messagesByChannel: {},
  unreadCounts: {},
  
  addMessage: (message) => set((state) => ({
    messagesByChannel: {
      ...state.messagesByChannel,
      [message.channelId]: [...(state.messagesByChannel[message.channelId] || []), message],
    },
  })),
  
  markChannelAsRead: (channelId) => set((state) => ({
    unreadCounts: { ...state.unreadCounts, [channelId]: 0 },
  })),
}));
```

---

## 9. Troubleshooting Guide

| Problem | Cause | Solution |
|---------|-------|----------|
| Socket.IO connection fails | JWT expired or auth cookie missing | Refresh page or re-login |
| "Prisma type X not assignable to Y" | Schema out of sync with generated types | Run `npm run db:generate` |
| Message not appearing in channel | Not subscribed to channel room or socket auth failed | Check `socket.data.userId`, verify JWT |
| Scheduled messages not sending | Cron job not running | Check server logs, ensure `startScheduledMessagesCron()` called in server.ts |
| File uploads fail | S3 credentials missing or invalid | Verify AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET in .env |
| Type errors in tests | Prisma client not mocked correctly | Mock `@prisma/client` in test setup |
| Slow message list rendering | Too many messages in virtuoso | Use cursor pagination, lazy-load older messages |

---

## 10. References

- **Next.js 14**: https://nextjs.org/docs
- **Prisma**: https://www.prisma.io/docs
- **Socket.IO**: https://socket.io/docs
- **NextAuth v5**: https://authjs.dev
- **Tiptap**: https://tiptap.dev
- **TypeScript**: https://www.typescriptlang.org/docs
- **Tailwind CSS**: https://tailwindcss.com/docs
- **Jest**: https://jestjs.io/docs/getting-started

---

**Document Version**: 1.0
**Last Reviewed**: February 28, 2026
