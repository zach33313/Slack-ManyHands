# Slack Clone — Architecture Document

> **For implementation workers**: Read this document first. Follow the directory structure,
> interface contracts, and dependency versions exactly. Each domain subtree is self-contained.

---

## 1. Technology Stack Summary

| Layer | Choice | Version | Notes |
|---|---|---|---|
| Runtime | Node.js | 20+ LTS | Required for Next.js custom server |
| Language | TypeScript | 5.x (strict) | All files; `strict: true` in tsconfig |
| Framework | Next.js | 14.x | App Router + RSCs; custom server for Socket.IO |
| Styling | Tailwind CSS | 3.x | + shadcn/ui component library |
| Database | PostgreSQL | 16 | Via Prisma ORM |
| ORM | Prisma | 5.x | Schema-first; migrations committed |
| Real-time | Socket.IO | 4.x | Custom server approach (same-port, same origin) |
| Auth | Auth.js / NextAuth | v5 | JWT strategy; cookies shared with Socket.IO |
| Rich-text editor | Tiptap | v3 | StarterKit + mention + emoji + code-block-lowlight |
| Message list | react-virtuoso | 4.18.1 | Variable heights, prepend, follow-output |
| File storage | Local (dev) / S3 (prod) | — | Abstracted behind `files/storage.ts` |
| Deployment | Railway / Fly.io | — | **Not Vercel** — Socket.IO requires persistent server |

---

## 2. Directory Structure

Files that change together live together. Organized by **domain/feature**, not type.

```
slack-clone/
├── server.ts                          # Custom HTTP + Socket.IO entry point
├── server/                            # Node.js server-side only (never imported by Next.js pages)
│   ├── socket-auth.ts                 # NextAuth v5 JWT validation middleware for sockets
│   ├── socket-emitter.ts              # getIO(), emitToChannel(), emitToUser() helpers
│   └── socket-handlers/               # Socket.IO event handlers (one file per domain)
│       ├── index.ts                   # Registers all handlers on a connected socket
│       ├── messages.ts                # message:send, message:edit, message:delete
│       ├── presence.ts                # presence:heartbeat, disconnect cleanup
│       ├── typing.ts                  # typing:start, typing:stop
│       └── channels.ts                # channel:join, channel:leave
│
├── prisma/
│   ├── schema.prisma                  # Source of truth for all tables
│   └── migrations/                    # Auto-generated; commit all migrations
│
├── app/                               # Next.js App Router
│   ├── layout.tsx                     # Root layout: fonts, ThemeProvider, SocketProvider
│   ├── page.tsx                       # Redirect to first workspace or /login
│   ├── (auth)/                        # Unauthenticated route group
│   │   ├── login/
│   │   │   └── page.tsx               # Sign-in form
│   │   └── register/
│   │       └── page.tsx               # Create account form
│   ├── (app)/                         # Authenticated route group
│   │   ├── layout.tsx                 # Workspace + channel sidebar shell
│   │   └── [workspaceSlug]/
│   │       ├── layout.tsx             # Per-workspace sidebar, socket room join
│   │       ├── page.tsx               # Workspace home / general channel redirect
│   │       ├── channel/
│   │       │   └── [channelId]/
│   │       │       └── page.tsx       # Channel message view
│   │       └── dm/
│   │           └── [userId]/
│   │               └── page.tsx       # Direct message view
│   └── api/
│       ├── auth/
│       │   └── [...nextauth]/
│       │       └── route.ts           # Auth.js v5 handler
│       ├── workspaces/
│       │   ├── route.ts               # GET list, POST create
│       │   └── [workspaceId]/
│       │       ├── route.ts           # GET, PATCH, DELETE workspace
│       │       ├── channels/
│       │       │   └── route.ts       # GET list, POST create channel
│       │       ├── members/
│       │       │   └── route.ts       # GET list, POST invite, DELETE remove
│       │       └── search/
│       │           └── route.ts       # GET full-text search (messages + channels)
│       ├── channels/
│       │   └── [channelId]/
│       │       ├── route.ts           # GET, PATCH, DELETE channel
│       │       ├── messages/
│       │       │   └── route.ts       # GET paginated, POST new message
│       │       └── members/
│       │           └── route.ts       # GET, POST, DELETE channel membership
│       ├── messages/
│       │   └── [messageId]/
│       │       ├── route.ts           # GET, PATCH (edit), DELETE
│       │       ├── reactions/
│       │       │   └── route.ts       # POST add, DELETE remove reaction
│       │       ├── threads/
│       │       │   └── route.ts       # GET thread replies, POST reply
│       │       └── pin/
│       │           └── route.ts       # POST pin, DELETE unpin
│       ├── files/
│       │   └── route.ts               # POST upload, GET presigned URL
│       └── users/
│           ├── route.ts               # GET search users
│           └── [userId]/
│               └── profile/
│                   └── route.ts       # GET, PATCH user profile
│
├── auth/                              # Auth domain — NextAuth v5 configuration
│   ├── auth.config.ts                 # Providers, callbacks, JWT config
│   ├── auth.ts                        # auth(), signIn(), signOut() exports
│   ├── middleware.ts                  # Route protection rules
│   └── types.ts                       # Extended Session/JWT types
│
├── workspaces/                        # Workspace domain
│   ├── actions.ts                     # Server Actions: createWorkspace, updateWorkspace
│   ├── queries.ts                     # DB queries: getWorkspaceBySlug, listUserWorkspaces
│   ├── types.ts                       # WorkspaceWithMembers, WorkspaceRole etc.
│   └── components/
│       ├── WorkspaceCreator.tsx       # "Create a workspace" modal
│       ├── WorkspaceSwitcher.tsx      # Dropdown to switch workspaces (sidebar top)
│       └── WorkspaceSettings.tsx      # Settings panel (name, icon, members)
│
├── channels/                          # Channel domain
│   ├── actions.ts                     # Server Actions: createChannel, archiveChannel
│   ├── queries.ts                     # DB queries: getChannelById, listWorkspaceChannels
│   ├── types.ts                       # ChannelWithMeta, ChannelType, UnreadCounts etc.
│   └── components/
│       ├── ChannelList.tsx            # Left sidebar channel list section
│       ├── ChannelHeader.tsx          # Channel name, description, member count bar
│       ├── ChannelCreator.tsx         # "Add a channel" modal
│       ├── ChannelSettings.tsx        # Channel settings drawer
│       └── DirectMessageList.tsx     # DM list section in sidebar
│
├── messages/                          # Message domain (largest domain)
│   ├── actions.ts                     # Server Actions: sendMessage, editMessage, deleteMessage
│   ├── queries.ts                     # DB queries: getMessages, getThreadReplies
│   ├── types.ts                       # MessageWithMeta, ReactionGroup etc.
│   └── components/
│       ├── MessageList.tsx            # react-virtuoso wrapper (GroupedVirtuoso)
│       ├── MessageItem.tsx            # Single message row (avatar, name, content, reactions)
│       ├── MessageComposer.tsx        # Tiptap SlackEditor + send/upload buttons
│       ├── MessageActions.tsx         # Hover toolbar (react, reply, edit, pin, bookmark)
│       ├── ThreadPanel.tsx            # Right-side thread drawer
│       ├── ThreadComposer.tsx         # Tiptap editor for thread replies
│       ├── ReactionBar.tsx            # Emoji reactions row below a message
│       ├── ReactionPicker.tsx         # Full emoji-mart picker popup
│       └── UnreadLine.tsx             # "New Messages" divider line
│
├── members/                           # Members & user profiles domain
│   ├── actions.ts                     # Server Actions: updateProfile, updateRole
│   ├── queries.ts                     # DB queries: getMember, listWorkspaceMembers
│   ├── types.ts                       # MemberWithUser, MemberRole etc.
│   └── components/
│       ├── MemberList.tsx             # Right sidebar member list
│       ├── MemberProfileCard.tsx      # Hover card / expanded profile
│       ├── UserAvatar.tsx             # Avatar with optional presence dot
│       └── PresenceIndicator.tsx      # Online/away/offline dot component
│
├── files/                             # File upload & storage domain
│   ├── actions.ts                     # Server Actions: uploadFile, deleteFile
│   ├── storage.ts                     # Storage adapter (local dev / S3 prod)
│   ├── types.ts                       # FileAttachment, FileUploadResult
│   └── components/
│       ├── FileUploader.tsx           # Drag-drop / click-to-upload with progress
│       ├── FileAttachmentRow.tsx      # File pill shown in a message
│       ├── ImageThumbnail.tsx         # Inline image with lightbox
│       └── FileSizeLimit.tsx          # Upload limit error display
│
├── search/                            # Full-text search domain
│   ├── queries.ts                     # PostgreSQL tsvector full-text search queries
│   ├── types.ts                       # SearchResult, SearchFilters
│   └── components/
│       ├── SearchModal.tsx            # Cmd+K search modal
│       └── SearchResultItem.tsx       # Individual result with highlight
│
├── notifications/                     # Notifications domain
│   ├── actions.ts                     # Server Actions: markRead, updatePreferences
│   ├── queries.ts                     # DB queries: getUnreadNotifications
│   ├── types.ts                       # Notification, NotificationType
│   └── components/
│       ├── NotificationBell.tsx       # Header bell icon with unread badge
│       └── NotificationList.tsx       # Notification dropdown/panel
│
├── presence/                          # Presence & typing indicators domain
│   ├── types.ts                       # PresenceStatus, TypingUser
│   ├── hooks/
│   │   ├── usePresence.ts             # Track online status via socket heartbeat
│   │   └── useTypingIndicator.ts      # Emit typing:start/stop, receive typing:users
│   └── components/
│       └── TypingIndicator.tsx        # "Alice and Bob are typing..." display
│
├── shared/                            # Cross-domain shared code
│   ├── types/
│   │   ├── index.ts                   # Re-exports all shared types
│   │   ├── api.ts                     # Generic API response envelopes, pagination
│   │   └── socket.ts                  # All Socket.IO event payload types (client ↔ server)
│   ├── lib/
│   │   ├── prisma.ts                  # Prisma client singleton
│   │   ├── socket-client.ts           # Socket.IO client singleton (browser-only)
│   │   ├── utils.ts                   # cn(), formatRelativeTime(), slugify(), truncate()
│   │   └── constants.ts               # Enums, limits, magic numbers
│   └── hooks/
│       ├── useSocket.ts               # Typed hook returning the socket singleton
│       └── useDebounce.ts             # Generic debounce hook
│
├── components/                        # Shared UI components (not domain-specific)
│   ├── ui/                            # shadcn/ui generated — run `npx shadcn add <name>`
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── popover.tsx
│   │   ├── scroll-area.tsx
│   │   ├── separator.tsx
│   │   ├── sheet.tsx
│   │   ├── skeleton.tsx
│   │   ├── toast.tsx
│   │   └── tooltip.tsx
│   ├── layout/                        # App chrome
│   │   ├── Sidebar.tsx                # Outer sidebar: workspace nav + channel list
│   │   ├── WorkspaceSidebar.tsx       # Left column (workspaces switcher strip)
│   │   ├── ChannelSidebar.tsx         # Middle column (channels + DMs)
│   │   └── RightPanel.tsx             # Right drawer (threads, member details)
│   └── editor/                        # Tiptap editor system
│       ├── SlackEditor.tsx            # Main composer: accepts onSubmit, placeholder
│       ├── EditorToolbar.tsx          # Bold/italic/code/link format buttons
│       ├── MentionDropdown.tsx        # @user popup (floating-ui positioned)
│       ├── ChannelMentionDropdown.tsx # #channel popup
│       ├── SlashCommandMenu.tsx       # /command popup
│       ├── EmojiPickerButton.tsx      # emoji-mart picker button in toolbar
│       └── extensions/                # Tiptap extension configurations
│           ├── mention.ts             # @user + #channel Mention instances
│           ├── emoji.ts               # extension-emoji config
│           ├── slash-command.ts       # Custom SlashCommand Extension
│           └── code-block.ts          # CodeBlockLowlight config
│
├── middleware.ts                      # Next.js middleware (auth redirect rules)
├── server.ts                          # Custom HTTP server entry (see §5)
├── next.config.ts                     # Next.js config (no Turbopack in dev — custom server)
├── tailwind.config.ts                 # Tailwind config (content paths, theme)
├── tsconfig.json                      # Next.js TypeScript config
├── tsconfig.server.json               # Server-side TypeScript (CommonJS target)
├── .env.example                       # All required env vars (committed, no secrets)
├── .gitignore
└── package.json
```

---

## 3. Database Schema (Prisma)

See `prisma/schema.prisma` for the full schema. Summary of tables:

| Table | Primary Key | Key Relationships |
|---|---|---|
| `users` | `id` (cuid) | base user record (NextAuth) |
| `accounts` | `id` | NextAuth OAuth accounts → users |
| `sessions` | `id` | NextAuth sessions → users |
| `verification_tokens` | compound | NextAuth email verification |
| `workspaces` | `id` (cuid) | owner → users |
| `workspace_members` | `id` | workspace + user; role: owner/admin/member/guest |
| `channels` | `id` (cuid) | workspace; type: public/private/dm |
| `channel_members` | `id` | channel + user; last_read_at for unread counts |
| `messages` | `id` (cuid) | channel + user; nullable `parent_id` (thread reply) |
| `reactions` | `id` | message + user + emoji; unique (message, user, emoji) |
| `files` | `id` (cuid) | message + user; stores URL, name, size, mime_type |
| `pins` | `id` | channel + message + pinned_by |
| `bookmarks` | `id` | message + user; unique (message, user) |
| `notifications` | `id` (cuid) | user + type + JSON payload; read_at nullable |

**Full-text search:** PostgreSQL `tsvector` column on `messages.content_plain`
(stripped plain text stored alongside Tiptap JSON).

---

## 4. Interface Contracts

### 4.1 Core Domain Types

See `shared/types/index.ts` for full type definitions. Key types:

```typescript
// User
type User = { id: string; name: string; email: string; image: string | null }

// Workspace
type Workspace = { id: string; slug: string; name: string; iconUrl: string | null }
type WorkspaceMember = { userId: string; workspaceId: string; role: MemberRole }

// Channel
type Channel = {
  id: string; workspaceId: string; name: string;
  type: ChannelType; isArchived: boolean; createdById: string
}

// Message (the richest type)
type Message = {
  id: string; channelId: string; userId: string
  content: TiptapJSON          // Tiptap JSON document stored in DB
  contentPlain: string         // Stripped text for search/preview
  parentId: string | null      // Non-null = thread reply
  replyCount: number           // Denormalized for performance
  editedAt: Date | null
  deletedAt: Date | null       // Soft delete
  files: FileAttachment[]
  reactions: ReactionGroup[]
  author: UserSummary
  createdAt: Date
}

// Reaction
type ReactionGroup = { emoji: string; count: number; userIds: string[] }

// File attachment
type FileAttachment = { id: string; name: string; url: string; size: number; mimeType: string }
```

### 4.2 API Route Contracts

All API routes return JSON wrapped in a standard envelope:

```typescript
// Success
type ApiSuccess<T> = { data: T; ok: true }

// Error
type ApiError = { error: string; code: string; ok: false }

// Paginated list
type PaginatedResponse<T> = {
  data: T[]; ok: true
  pagination: { cursor: string | null; hasMore: boolean; total?: number }
}
```

**Messages endpoint** (`GET /api/channels/[channelId]/messages`):
```
Query params:
  cursor?: string   — message ID for cursor-based pagination
  limit?: number    — default 50, max 100
  before?: string   — fetch messages before this ID (history load)

Response: PaginatedResponse<Message>
```

**Search endpoint** (`GET /api/workspaces/[workspaceId]/search`):
```
Query params:
  q: string         — search query
  type?: 'messages' | 'channels' | 'files'
  limit?: number    — default 20

Response: ApiSuccess<SearchResult[]>
```

### 4.3 Socket.IO Events

See `shared/types/socket.ts` for full typed interfaces.

**Client → Server:**
| Event | Payload | Description |
|---|---|---|
| `workspace:join` | `{ workspaceId }` | Join workspace room on connect |
| `channel:join` | `{ channelId }` | Subscribe to channel events |
| `channel:leave` | `{ channelId }` | Unsubscribe |
| `message:send` | `{ channelId, content, fileIds?, parentId? }` | Send or thread-reply |
| `message:edit` | `{ messageId, content }` | Edit own message |
| `message:delete` | `{ messageId }` | Soft-delete own message |
| `message:react` | `{ messageId, emoji }` | Add reaction |
| `message:unreact` | `{ messageId, emoji }` | Remove reaction |
| `typing:start` | `{ channelId }` | Begin typing |
| `typing:stop` | `{ channelId }` | Stop typing |
| `presence:heartbeat` | — | Keep presence alive (every 30s) |

**Server → Client:**
| Event | Payload | Description |
|---|---|---|
| `message:new` | `Message` | New message in subscribed channel |
| `message:updated` | `Message` | Edited message |
| `message:deleted` | `{ messageId, channelId }` | Soft-deleted |
| `reaction:updated` | `{ messageId, reactions: ReactionGroup[] }` | Full reactions snapshot |
| `thread:reply` | `Message` | New thread reply |
| `typing:users` | `{ channelId, users: UserSummary[] }` | Current typists |
| `presence:update` | `{ userId, status: PresenceStatus }` | Online/away/offline |
| `channel:created` | `Channel` | New channel in workspace |
| `channel:archived` | `{ channelId }` | Channel archived |
| `member:joined` | `WorkspaceMember & { user: UserSummary }` | New member |
| `notification:new` | `Notification` | Mention or DM notification |

### 4.4 Server Actions

Server Actions (Next.js `'use server'`) are the primary mutation path for non-real-time writes.

```typescript
// workspaces/actions.ts
createWorkspace(name: string, slug: string): Promise<Workspace>
updateWorkspace(id: string, data: Partial<Workspace>): Promise<Workspace>
deleteWorkspace(id: string): Promise<void>
inviteMember(workspaceId: string, email: string, role: MemberRole): Promise<WorkspaceMember>
removeMember(workspaceId: string, userId: string): Promise<void>

// channels/actions.ts
createChannel(workspaceId: string, data: CreateChannelInput): Promise<Channel>
archiveChannel(channelId: string): Promise<Channel>
updateChannel(channelId: string, data: Partial<Channel>): Promise<Channel>
openDM(workspaceId: string, targetUserId: string): Promise<Channel>

// messages/actions.ts
sendMessage(input: SendMessageInput): Promise<Message>
editMessage(messageId: string, content: TiptapJSON): Promise<Message>
deleteMessage(messageId: string): Promise<void>
pinMessage(channelId: string, messageId: string): Promise<void>
unpinMessage(channelId: string, messageId: string): Promise<void>
bookmarkMessage(messageId: string): Promise<void>

// members/actions.ts
updateProfile(data: UpdateProfileInput): Promise<User>
updateMemberRole(workspaceId: string, userId: string, role: MemberRole): Promise<WorkspaceMember>
```

---

## 5. Integration Points

### 5.1 Socket.IO ↔ Next.js (Custom Server)

The custom `server.ts` boots Next.js and attaches Socket.IO to the same `http.Server`:

```
server.ts
  └── http.createServer → handles Next.js requests
  └── new Server(httpServer) → Socket.IO on /socket.io path
  └── (global).__socketio = io  → accessible from any Route Handler
  └── applyAuthMiddleware(io)   → validates NextAuth JWT on every handshake
  └── registerHandlers(io)      → wires all domain event handlers
```

Socket.IO event handlers in `server/socket-handlers/` emit events via `socket-emitter.ts`.
Route Handlers can also push events (e.g., after a REST file upload) using `getIO()`.

### 5.2 Auth ↔ Socket.IO

Socket.IO middleware (`server/socket-auth.ts`) calls `getToken()` from `next-auth/jwt` on
the raw HTTP upgrade request. This works without any CORS or manual token passing because
the socket server runs on the same origin and port as Next.js — NextAuth cookies are
sent automatically.

```
Browser → POST /socket.io/?EIO=4 (polling handshake)
  Cookie: authjs.session-token=<JWE>
  → socket-auth.ts decrypts JWE with NEXTAUTH_SECRET
  → attaches userId to socket.data.userId
  → all downstream handlers trust socket.data.userId
```

### 5.3 Tiptap ↔ Database

Messages are stored and transmitted as **Tiptap JSON** (`Record<string, unknown>`).
A stripped plain-text version (`contentPlain: string`) is derived on save and stored
alongside for PostgreSQL full-text search and notification preview text.

```
Composer → Tiptap JSON → POST /api/channels/[id]/messages
  → DB stores { content: JSON, content_plain: string }
  → Socket.IO emits Message to channel room
  → MessageItem.tsx renders via renderToReactElement (static renderer — no ProseMirror instance)
```

### 5.4 Presence ↔ Socket.IO

Presence is tracked in-memory by the Socket.IO server (no DB writes for heartbeats):

```
Client → presence:heartbeat (every 30s)
  → server resets a 90s expiry timer for this userId
  → on timer expiry: emit presence:update { userId, status: 'offline' } to workspace room
  → on disconnect: immediate presence:update to workspace room
```

### 5.5 Files ↔ Messages

Files are uploaded first (POST /api/files), then the returned `fileId` is included in
the message send payload. The `files/storage.ts` adapter is swapped based on environment:

```
NODE_ENV=development → local /public/uploads/
NODE_ENV=production  → AWS S3 via @aws-sdk/client-s3 presigned URLs
```

---

## 6. Configuration Patterns

### 6.1 Environment Variables

All required vars are documented in `.env.example`. The app will not start if required
vars are absent (validated in `shared/lib/constants.ts`).

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/slack_clone"

# Auth (NextAuth v5 / Auth.js)
AUTH_SECRET="<random 32-byte hex — openssl rand -hex 32>"
AUTH_URL="http://localhost:3000"    # or NEXTAUTH_URL in some configs

# OAuth providers (at least one required)
AUTH_GITHUB_ID=""
AUTH_GITHUB_SECRET=""
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""

# File storage (production)
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
AWS_REGION="us-east-1"
AWS_S3_BUCKET=""

# File storage (dev — local)
UPLOAD_DIR="./public/uploads"
NEXT_PUBLIC_UPLOAD_BASE_URL="http://localhost:3000/uploads"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
PORT=3000
NODE_ENV=development
```

### 6.2 Next.js Config

```typescript
// next.config.ts
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },  // for file uploads via Server Actions
  },
  images: {
    remotePatterns: [
      { hostname: 'avatars.githubusercontent.com' },
      { hostname: 'lh3.googleusercontent.com' },
      { hostname: '*.s3.amazonaws.com' },
    ],
  },
}
```

### 6.3 TypeScript Config

Two configs exist:
- `tsconfig.json` — Next.js (bundler module resolution, JSX preserve)
- `tsconfig.server.json` — Server-side (CommonJS, Node module resolution)

`server.ts` and `server/**/*.ts` are excluded from `tsconfig.json` to prevent
Next.js from attempting to compile them.

### 6.4 Path Aliases

`@/` maps to the project root (configured in `tsconfig.json` `paths`).

```typescript
import { prisma } from '@/shared/lib/prisma'
import type { Message } from '@/shared/types'
import { cn } from '@/shared/lib/utils'
```

---

## 7. Shared Types Reference

Defined in `shared/types/index.ts`. See the actual file for full type definitions.

### Enums

```typescript
enum MemberRole { OWNER = 'owner', ADMIN = 'admin', MEMBER = 'member', GUEST = 'guest' }
enum ChannelType { PUBLIC = 'public', PRIVATE = 'private', DM = 'dm' }
enum PresenceStatus { ONLINE = 'online', AWAY = 'away', OFFLINE = 'offline' }
enum NotificationType { MENTION = 'mention', DM = 'dm', REACTION = 'reaction', THREAD_REPLY = 'thread_reply' }
```

### TiptapJSON

```typescript
// Tiptap document stored in DB as JSONB; content column
type TiptapJSON = {
  type: 'doc'
  content: TiptapNode[]
}
type TiptapNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: TiptapNode[]
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  text?: string
}
```

---

## 8. Dependency List

### Production Dependencies

```json
{
  "next": "^14.2.0",
  "react": "^18.3.0",
  "react-dom": "^18.3.0",
  "typescript": "^5.4.0",

  "socket.io": "^4.7.5",
  "socket.io-client": "^4.7.5",

  "@prisma/client": "^5.14.0",

  "next-auth": "^5.0.0-beta.25",
  "@auth/prisma-adapter": "^2.4.0",

  "@tiptap/core": "^3.20.0",
  "@tiptap/starter-kit": "^3.20.0",
  "@tiptap/extension-mention": "^3.20.0",
  "@tiptap/suggestion": "^3.20.0",
  "@tiptap/extension-emoji": "^3.20.0",
  "@tiptap/extension-code-block-lowlight": "^3.20.0",
  "@tiptap/static-renderer": "^3.20.0",
  "@tiptap/react": "^3.20.0",
  "lowlight": "^3.1.0",

  "@floating-ui/dom": "^1.6.0",
  "emoji-mart": "^5.6.0",
  "@emoji-mart/data": "^1.2.1",
  "@emoji-mart/react": "^1.1.1",

  "react-virtuoso": "4.18.1",

  "tailwindcss": "^3.4.0",
  "clsx": "^2.1.0",
  "tailwind-merge": "^2.3.0",
  "class-variance-authority": "^0.7.0",
  "@radix-ui/react-dialog": "^1.1.0",
  "@radix-ui/react-dropdown-menu": "^2.1.0",
  "@radix-ui/react-popover": "^1.1.0",
  "@radix-ui/react-scroll-area": "^1.1.0",
  "@radix-ui/react-separator": "^1.1.0",
  "@radix-ui/react-sheet": "^1.1.0",
  "@radix-ui/react-tooltip": "^1.1.0",
  "lucide-react": "^0.400.0",

  "@aws-sdk/client-s3": "^3.600.0",
  "@aws-sdk/s3-request-presigner": "^3.600.0",

  "zod": "^3.23.0",
  "date-fns": "^3.6.0",
  "nanoid": "^5.0.0"
}
```

### Development Dependencies

```json
{
  "prisma": "^5.14.0",
  "tsx": "^4.15.0",
  "tsup": "^8.1.0",
  "@types/node": "^20.14.0",
  "@types/react": "^18.3.0",
  "@types/react-dom": "^18.3.0",
  "eslint": "^8.57.0",
  "eslint-config-next": "^14.2.0",
  "prettier": "^3.3.0",
  "prettier-plugin-tailwindcss": "^0.6.0"
}
```

### Package Scripts

```json
{
  "scripts": {
    "dev": "tsx watch server.ts",
    "build": "next build && tsup server.ts --format cjs --out-dir dist/server",
    "start": "NODE_ENV=production node dist/server/server.js",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:studio": "prisma studio",
    "lint": "next lint",
    "format": "prettier --write ."
  }
}
```

---

## 9. Key Architectural Decisions

### Why Custom `server.ts` (not Vercel/instrumentation hook)

Socket.IO requires a persistent WebSocket server. Next.js on Vercel runs as serverless
functions and cannot hold persistent connections. The custom server approach:
- Keeps Socket.IO on the same port (3000) and origin as Next.js
- Means NextAuth session cookies arrive on every Socket.IO handshake automatically
- No CORS configuration needed
- `tsx watch server.ts` gives live reload on server file changes in development
- React HMR still works normally for frontend components
- **Deploy on Railway, Fly.io, Render, or any VPS — never Vercel**

### Why Tiptap v3 (not Lexical, Quill, ProseMirror raw)

- `@tiptap/static-renderer` renders Tiptap JSON to React elements without creating a
  ProseMirror editor instance per message — critical for virtualized lists with 1000+ messages
- Native `@tiptap/extension-mention` with `@floating-ui/dom` (Tippy removed in v3)
- `@tiptap/extension-emoji` handles `:shortcode:` autocomplete; emoji-mart handles the
  browse-picker in the toolbar
- Slash commands built manually via `@tiptap/suggestion` (no unstable official package)

### Why react-virtuoso (not @tanstack/react-virtual)

react-virtuoso v4's `firstItemIndex` trick enables prepend-without-scroll-jump (for
loading history), `followOutput` handles new-message auto-scroll, and `GroupedVirtuoso`
provides sticky date separators — all out of the box. TanStack Virtual requires custom
implementations of all three, which are difficult to get right under React's concurrent
rendering model.

### Why PostgreSQL full-text search (not Elasticsearch)

For an MVP/production app this size, PostgreSQL `tsvector` + `tsquery` with a GIN index
is sufficient and eliminates an entire infrastructure dependency. The `content_plain` column
(stripped Tiptap JSON) is updated on every message write and indexed.

---

## 10. Worker Domain Assignments

Each implementation worker owns one domain subtree. They should read this document and
the relevant `types.ts` file in their domain before starting.

| Domain | Files Owned | Dependencies |
|---|---|---|
| **Auth** | `auth/`, `app/(auth)/`, `app/api/auth/` | NextAuth v5, Prisma |
| **Workspaces** | `workspaces/`, `app/api/workspaces/` | Auth, Prisma |
| **Channels** | `channels/`, `app/api/channels/` | Workspaces, Auth, Prisma |
| **Messages** | `messages/`, `app/api/messages/` | Channels, Socket.IO emitter |
| **Real-time server** | `server/`, `server.ts` | Socket.IO, NextAuth JWT |
| **Editor** | `components/editor/` | Tiptap v3 packages |
| **Message list UI** | `messages/components/MessageList.tsx`, `MessageItem.tsx` | react-virtuoso, static-renderer |
| **Members/Profiles** | `members/`, `app/api/users/` | Auth, Workspaces |
| **Files** | `files/`, `app/api/files/` | Messages (fileId FK), S3 |
| **Search** | `search/`, `app/api/workspaces/[id]/search/` | Prisma tsvector |
| **Notifications** | `notifications/`, presence/ | Socket.IO, Auth |
| **App shell/Layout** | `app/layout.tsx`, `app/(app)/layout.tsx`, `components/layout/` | All domains |
| **Shared types** | `shared/`, `prisma/schema.prisma` | (foundation — build first) |
