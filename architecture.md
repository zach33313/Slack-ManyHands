# Slack Clone V2 — Architecture Document

> **For implementation workers**: Read this document first. Follow the directory structure,
> interface contracts, and dependency versions exactly. Each domain subtree is self-contained.
> When in doubt, match the existing patterns — do not invent new conventions.

---

## 1. Directory Structure

Files that change together live together. Organized by **domain/feature**, not type.
New domains (calls, scheduling, polls, canvas, etc.) follow the same pattern as existing
domains (messages, channels, workspaces).

```
slack-clone/
├── server.ts                           # Custom HTTP + Socket.IO entry point
├── server/                             # Node.js server-side only (never imported by Next.js pages)
│   ├── socket-auth.ts                  # NextAuth v5 JWT validation middleware for sockets
│   ├── socket-emitter.ts              # getIO(), emitToChannel(), emitToUser(), emitToWorkspace()
│   ├── cron/
│   │   └── scheduled-messages.ts      # node-cron scheduled message delivery + notifications
│   └── socket-handlers/               # Socket.IO event handlers (one file per domain)
│       ├── index.ts                   # Registers all handlers on connected socket
│       ├── messages.ts                # message:send, message:edit, message:delete, react, unreact
│       ├── presence.ts                # presence:heartbeat, workspace:join, disconnect cleanup
│       ├── typing.ts                  # typing:start, typing:stop, disconnect cleanup
│       ├── channels.ts               # channel:join, channel:leave
│       ├── calls.ts                   # NEW: call:initiate, call:accept, call:signal, call:hangup
│       ├── huddles.ts                 # NEW: huddle:join, huddle:leave, huddle:signal
│       ├── polls.ts                   # poll:vote, poll:unvote, poll:end (multiChoice-aware)
│       ├── canvas.ts                  # NEW: canvas Yjs document relay
│       └── read-receipts.ts          # NEW: message:read receipt tracking
│
├── prisma/
│   ├── schema.prisma                  # Source of truth for all database tables
│   ├── seed.ts                        # Database seeder (npx tsx prisma/seed.ts)
│   └── migrations/                    # Auto-generated; commit all migrations
│
├── app/                               # Next.js App Router
│   ├── layout.tsx                     # Root layout: fonts, ThemeProvider, Toaster, SocketProvider
│   ├── page.tsx                       # Redirect to first workspace or /login
│   ├── globals.css                    # CSS custom properties (semantic color tokens)
│   ├── (auth)/                        # Unauthenticated route group
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (app)/                         # Authenticated route group
│   │   ├── layout.tsx                 # Workspace + channel sidebar shell
│   │   └── [workspaceSlug]/
│   │       ├── layout.tsx             # Per-workspace sidebar, socket workspace:join
│   │       ├── page.tsx               # Workspace home → redirect to #general
│   │       ├── channel/
│   │       │   └── [channelId]/
│   │       │       ├── page.tsx       # Channel message view
│   │       │       └── canvas/
│   │       │           └── page.tsx   # NEW: Collaborative canvas/notes for this channel
│   │       ├── dm/
│   │       │   └── [userId]/
│   │       │       └── page.tsx       # Direct message view
│   │       └── admin/
│   │           └── page.tsx           # NEW: Admin dashboard (ADMIN+ role guard)
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── workspaces/
│       │   ├── route.ts               # GET list, POST create
│       │   └── [workspaceId]/
│       │       ├── route.ts           # GET, PATCH, DELETE workspace
│       │       ├── channels/route.ts  # GET list, POST create channel
│       │       ├── members/route.ts   # GET list, POST invite, DELETE remove
│       │       └── search/route.ts    # GET full-text search
│       ├── channels/
│       │   └── [channelId]/
│       │       ├── route.ts           # GET, PATCH, DELETE channel
│       │       ├── messages/route.ts  # GET paginated, POST new message
│       │       └── members/route.ts   # GET, POST, DELETE channel membership
│       ├── messages/
│       │   └── [messageId]/
│       │       ├── route.ts           # GET, PATCH, DELETE
│       │       ├── reactions/route.ts
│       │       ├── threads/route.ts
│       │       └── pin/route.ts
│       ├── files/route.ts             # POST upload, GET presigned URL
│       ├── users/
│       │   ├── route.ts               # GET search users
│       │   └── [userId]/profile/route.ts
│       ├── link-preview/route.ts      # NEW: GET Open Graph metadata for URL
│       ├── gifs/route.ts              # NEW: GET Tenor GIF search proxy
│       ├── scheduled-messages/route.ts # GET list, POST create, DELETE cancel scheduled messages
│       ├── polls/route.ts             # POST create, GET poll, PATCH end poll
│       ├── canvas/
│       │   └── [canvasId]/route.ts    # NEW: GET, PATCH canvas content
│       └── admin/
│           ├── analytics/route.ts     # NEW: GET workspace analytics
│           └── audit-log/route.ts     # NEW: GET audit log entries
│
├── auth/                              # Auth domain — NextAuth v5 configuration
│   ├── auth.config.ts                 # Providers (Credentials + Google OAuth), callbacks, JWT config
│   ├── auth.ts                        # auth(), signIn(), signOut(), handlers exports
│   ├── middleware.ts                  # requireAuth(), getAuthSession(), AuthError class
│   └── types.ts                       # Module augmentations: Session.user.id, JWT.userId
│
├── workspaces/                        # Workspace domain
│   ├── actions.ts                     # createWorkspace, updateWorkspace, deleteWorkspace
│   ├── queries.ts                     # getWorkspaceBySlug, getMemberRole, listUserWorkspaces
│   ├── types.ts                       # WorkspaceWithMembers, UpdateWorkspaceInput
│   └── components/
│       ├── WorkspaceCreator.tsx
│       ├── WorkspaceSwitcher.tsx
│       └── WorkspaceSettings.tsx
│
├── channels/                          # Channel domain
│   ├── actions.ts                     # createChannel, archiveChannel, updateChannel, openDM
│   ├── queries.ts                     # getChannelById, listWorkspaceChannels
│   ├── types.ts                       # ChannelWithMeta, CreateChannelInput
│   └── components/
│       ├── ChannelList.tsx
│       ├── ChannelHeader.tsx
│       ├── ChannelCreator.tsx
│       ├── ChannelSettings.tsx
│       └── DirectMessageList.tsx
│
├── messages/                          # Message domain (largest domain)
│   ├── actions.ts                     # sendMessage, editMessage, deleteMessage, pin, bookmark
│   ├── queries.ts                     # getMessages (cursor-paginated), getThreadReplies
│   ├── store.ts                       # Zustand: useMessagesStore (messagesByChannel, threads, unread)
│   ├── types.ts                       # MessagesState, MessageWithMeta
│   └── components/
│       ├── MessageList.tsx            # react-virtuoso GroupedVirtuoso wrapper
│       ├── MessageItem.tsx            # Single message row (avatar, name, content, reactions)
│       ├── MessageComposer.tsx        # Tiptap SlackEditor + send/upload/schedule/gif buttons
│       ├── MessageActions.tsx         # Hover toolbar (react, reply, edit, pin, delete confirmation dialog)
│       ├── AnimatedMessage.tsx        # Framer Motion entry animation for messages
│       ├── AnimatedReactionBar.tsx    # Animated emoji reaction bar
│       ├── AudioPlayer.tsx            # Audio message playback with waveform
│       ├── AudioRecorder.tsx          # Voice message recording with upload
│       ├── ForwardDialog.tsx          # Forward message to another channel dialog
│       ├── ReadReceipt.tsx            # Read receipt indicators (DM and group)
│       ├── ThreadPanel.tsx            # Right-side thread drawer
│       ├── ThreadsPanel.tsx           # Followed threads list panel
│       ├── ThreadComposer.tsx         # Tiptap editor for thread replies
│       ├── ReactionBar.tsx            # Emoji reactions row below a message
│       ├── ReactionPicker.tsx         # Full emoji-mart picker popup
│       └── UnreadLine.tsx             # "New Messages" divider line
│
├── members/                           # Members & user profiles domain
│   ├── actions.ts                     # updateProfile, updateMemberRole
│   ├── queries.ts                     # getMember, listWorkspaceMembers
│   ├── types.ts                       # UserProfile, UpdateProfileInput
│   └── components/
│       ├── MemberList.tsx
│       ├── MemberProfileCard.tsx
│       ├── UserAvatar.tsx             # Avatar with optional presence dot
│       └── PresenceIndicator.tsx
│
├── files/                             # File upload & storage domain
│   ├── actions.ts                     # uploadFile, deleteFile
│   ├── storage.ts                     # Storage adapter: local dev / S3 prod
│   ├── types.ts                       # FileAttachment, FileUploadResult
│   └── components/
│       ├── FileUploader.tsx
│       ├── FileAttachmentRow.tsx
│       ├── ImageThumbnail.tsx
│       └── FileSizeLimit.tsx
│
├── search/                            # Full-text search domain
│   ├── queries.ts                     # PostgreSQL tsvector full-text search
│   ├── types.ts                       # SearchResult, SearchFilters
│   └── components/
│       ├── SearchModal.tsx            # Cmd+K search modal
│       └── SearchResultItem.tsx
│
├── notifications/                     # Notifications domain
│   ├── actions.ts                     # markRead, updatePreferences
│   ├── queries.ts                     # getUnreadNotifications
│   ├── types.ts                       # Notification, NotificationType
│   └── components/
│       ├── NotificationBell.tsx
│       └── NotificationList.tsx
│
├── presence/                          # Presence & typing indicators domain
│   ├── store.ts                       # Zustand: usePresenceStore (presenceMap, typingByChannel)
│   ├── types.ts                       # PresenceStoreState
│   ├── hooks/
│   │   ├── usePresence.ts            # Heartbeat loop, socket listeners
│   │   └── useTypingIndicator.ts     # Emit typing:start/stop, receive typing:users
│   └── components/
│       └── TypingIndicator.tsx
│
├── calls/                             # NEW: Voice/video calling domain
│   ├── types.ts                       # CallState, CallParticipant, HuddleState, CallSignal
│   ├── store.ts                       # Zustand: useCallStore (activeCall, huddles, localStream)
│   ├── hooks/
│   │   ├── useWebRTC.ts              # Core simple-peer wrapper + stream management
│   │   ├── useCall.ts                # 1:1 call state machine (idle→ringing→connected→ended)
│   │   ├── useHuddle.ts             # Group huddle mesh: join/leave/reconnect
│   │   ├── useMediaDevices.ts        # Enumerate cameras/mics, device selection
│   │   └── useAudioLevel.ts         # Web Audio AnalyserNode for speaking indicator
│   ├── components/
│   │   ├── CallProvider.tsx           # Context provider wrapping app for global call state
│   │   ├── FloatingCallWindow.tsx     # Draggable Framer Motion overlay (persists across routes)
│   │   ├── CallControls.tsx           # Mute, camera toggle, screen share, hangup buttons
│   │   ├── IncomingCallModal.tsx      # Ring animation + accept/decline
│   │   ├── VideoGrid.tsx             # Responsive CSS Grid (1-6 participants)
│   │   ├── ParticipantTile.tsx       # Video element / avatar + name + audio indicator
│   │   ├── HuddleBar.tsx            # Channel footer bar showing active huddle participants
│   │   ├── AudioVisualizer.tsx       # Audio level waveform bars
│   │   ├── ScreenShareView.tsx       # Full-width screen share display
│   │   ├── CallTimer.tsx             # MM:SS elapsed timer
│   │   ├── DeviceSelector.tsx        # Camera/mic dropdown
│   │   └── CallHistoryPanel.tsx      # Recent calls list
│   └── lib/
│       └── signaling.ts              # Socket.IO call signaling helpers (emit wrappers)
│
├── scheduling/                        # NEW: Message scheduling domain
│   ├── actions.ts                     # createScheduledMessage, cancelScheduled, getScheduled
│   ├── types.ts                       # ScheduledMessage, ScheduleMessageInput
│   └── components/
│       ├── ScheduleButton.tsx         # Clock icon in composer toolbar
│       ├── SchedulePicker.tsx         # react-day-picker date/time popover
│       └── ScheduledMessagesPanel.tsx # List of pending scheduled messages
│
├── polls/                             # NEW: Polls/voting domain
│   ├── actions.ts                     # createPoll, vote, endPoll
│   ├── types.ts                       # Poll, PollOption, PollVote
│   └── components/
│       ├── PollCreator.tsx            # Poll creation form dialog
│       ├── PollDisplay.tsx            # Interactive poll inline in message
│       └── PollResults.tsx            # Results bar chart
│
├── canvas/                            # NEW: Collaborative notes domain
│   ├── actions.ts                     # getCanvas, saveCanvas, getVersions, restoreVersion
│   ├── types.ts                       # Canvas, CanvasVersion
│   ├── hooks/
│   │   └── useYjsSync.ts            # Yjs CRDT + Socket.IO sync provider
│   └── components/
│       ├── CanvasEditor.tsx           # Full Tiptap + Yjs collaborative editor
│       ├── CanvasTab.tsx             # Tab switcher (Messages | Canvas)
│       └── CanvasVersionHistory.tsx  # Version list with restore option
│
├── gifs/                              # NEW: GIF search domain
│   ├── types.ts                       # TenorGif, GifSearchResult
│   ├── lib/
│   │   └── tenor.ts                  # Tenor API v2 server-side client
│   └── components/
│       ├── GifSearchPanel.tsx         # Search overlay positioned above composer
│       └── GifGrid.tsx               # Masonry grid of GIF thumbnails
│
├── link-previews/                     # NEW: OG link unfurling domain
│   ├── actions.ts                     # fetchLinkPreview server action (open-graph-scraper)
│   ├── types.ts                       # LinkPreviewData
│   └── components/
│       └── LinkPreviewCard.tsx        # Rich preview card below message
│
├── workflows/                         # NEW: Workflow automations domain
│   ├── actions.ts                     # createWorkflow, updateWorkflow, deleteWorkflow
│   ├── types.ts                       # Workflow, WorkflowTrigger, WorkflowAction
│   ├── engine.ts                      # Server-side workflow execution engine
│   └── components/
│       ├── WorkflowBuilder.tsx        # Visual trigger → action builder
│       ├── WorkflowList.tsx          # List of workspace workflows
│       └── WorkflowTemplates.tsx     # Pre-built automation templates
│
├── admin/                             # NEW: Admin dashboard domain
│   ├── queries.ts                     # Analytics aggregate queries
│   ├── types.ts                       # AnalyticsData, AuditLogEntry, AdminPermission
│   └── components/
│       ├── AdminDashboard.tsx         # Main admin layout
│       ├── AnalyticsCharts.tsx       # Recharts line/bar/area charts
│       ├── MemberManager.tsx         # Member CRUD with role management
│       └── AuditLogViewer.tsx        # Scrollable audit log list
│
├── bookmarks/                         # NEW: Saved items domain
│   ├── actions.ts                     # addBookmark, removeBookmark, getBookmarks
│   ├── types.ts                       # BookmarkWithMessage
│   └── components/
│       └── BookmarksPanel.tsx         # Saved items sidebar panel
│
├── store/
│   └── index.ts                       # Global Zustand store: useAppStore (auth, workspace, channels, messages, presence, UI)
│
├── shared/                            # Cross-domain shared code
│   ├── types/
│   │   ├── index.ts                   # All shared types, enums, interfaces (re-export barrel)
│   │   ├── api.ts                     # ApiSuccess, ApiError, PaginatedResponse, ok(), err()
│   │   └── socket.ts                  # ClientToServerEvents, ServerToClientEvents, SocketData
│   ├── lib/
│   │   ├── prisma.ts                  # Prisma client singleton
│   │   ├── socket-client.ts          # Socket.IO client singleton (browser-only, 'use client')
│   │   ├── utils.ts                   # cn(), formatRelativeTime(), slugify(), truncate()
│   │   ├── constants.ts              # Enums, limits, timeouts, room helpers, hasPermission()
│   │   ├── animations.ts            # NEW: Framer Motion shared variants + spring configs
│   │   └── themes.ts                # NEW: Multi-theme color definitions (semantic tokens)
│   └── hooks/
│       ├── useSocket.ts               # Typed hook returning the socket singleton
│       └── useDebounce.ts
│
├── components/                        # Shared UI components (not domain-specific)
│   ├── ui/                            # shadcn/ui generated — DO NOT edit manually
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
│   │   ├── tooltip.tsx
│   │   ├── select.tsx
│   │   ├── tabs.tsx
│   │   └── avatar.tsx
│   ├── layout/                        # App chrome
│   │   ├── Sidebar.tsx               # Outer sidebar: workspace nav + channel list
│   │   ├── WorkspaceSidebar.tsx      # Left column (workspace switcher strip)
│   │   ├── ChannelSidebar.tsx        # Middle column (channels + DMs)
│   │   ├── RightPanel.tsx            # Right drawer (threads, member details)
│   │   ├── KeyboardShortcutsOverlay.tsx  # NEW: Shortcuts reference modal (?-key)
│   │   └── ChannelCategories.tsx     # NEW: @dnd-kit drag-reorder channel sections
│   ├── editor/                        # Tiptap editor system
│   │   ├── SlackEditor.tsx
│   │   ├── EditorToolbar.tsx
│   │   ├── MentionDropdown.tsx
│   │   ├── ChannelMentionDropdown.tsx
│   │   ├── SlashCommandMenu.tsx
│   │   ├── EmojiPickerButton.tsx
│   │   └── extensions/
│   │       ├── mention.ts
│   │       ├── emoji.ts
│   │       ├── slash-command.ts
│   │       └── code-block.ts
│   └── animated/                      # NEW: Framer Motion wrapper components
│       ├── AnimatedButton.tsx         # Button with hover/tap springs
│       ├── AnimatedList.tsx           # Staggered list animation wrapper
│       ├── SkeletonMessage.tsx        # Message loading skeleton with pulse
│       ├── SkeletonChannelList.tsx    # Channel list skeleton
│       ├── SkeletonMemberList.tsx     # Member list skeleton
│       └── ConfettiReaction.tsx       # canvas-confetti celebration trigger
│
├── __tests__/                         # Test files mirror source structure
│   ├── auth/
│   ├── server/
│   └── ...
│
├── middleware.ts                      # Next.js middleware (auth redirect rules)
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json                      # Next.js TypeScript config
├── tsconfig.server.json               # Server-side TypeScript (CommonJS target)
├── .env.example                       # All required env vars (committed, no secrets)
├── .gitignore
└── package.json
```

---

## 2. Interface Contracts

### 2.1 Core Domain Types (existing — `shared/types/index.ts`)

These types are already implemented and tested. Do not modify field names or shapes.

```typescript
// Enums — string-valued, stored as String in SQLite, enforced at app layer
enum MemberRole { OWNER = 'OWNER', ADMIN = 'ADMIN', MEMBER = 'MEMBER' }
enum ChannelType { PUBLIC = 'PUBLIC', PRIVATE = 'PRIVATE', DM = 'DM', GROUP_DM = 'GROUP_DM' }
enum PresenceStatus { ONLINE = 'online', AWAY = 'away', OFFLINE = 'offline' }
enum NotificationType { MENTION = 'MENTION', DM = 'DM', THREAD_REPLY = 'THREAD_REPLY', REACTION = 'REACTION' }

// User
interface UserSummary { id: string; name: string; image: string | null }
interface User extends UserSummary {
  email: string; title: string | null; statusText: string | null;
  statusEmoji: string | null; timezone: string | null;
  createdAt: Date; updatedAt: Date;
}

// Workspace
interface Workspace {
  id: string; name: string; slug: string; iconUrl: string | null;
  ownerId: string; createdAt: Date;
}
interface WorkspaceMember {
  id: string; workspaceId: string; userId: string; role: MemberRole;
  joinedAt: Date; user: UserSummary;
}

// Channel
interface Channel {
  id: string; workspaceId: string; name: string; description: string | null;
  type: ChannelType; isArchived: boolean; createdById: string; createdAt: Date;
}
interface ChannelWithMeta extends Channel { unreadCount: number; memberCount: number }

// Message
interface MessageWithMeta {
  id: string; channelId: string; userId: string;
  content: TiptapJSON; contentPlain: string;
  parentId: string | null; replyCount: number;
  isEdited: boolean; isDeleted: boolean;
  editedAt: Date | null; deletedAt: Date | null; createdAt: Date;
  author: UserSummary; files: FileAttachment[]; reactions: ReactionGroup[];
}

// Tiptap JSON
interface TiptapJSON { type: 'doc'; content: TiptapNode[] }
interface TiptapNode {
  type: string; attrs?: Record<string, unknown>;
  content?: TiptapNode[]; text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

// Reaction
interface ReactionGroup { emoji: string; count: number; userIds: string[] }

// File
interface FileAttachment {
  id: string; name: string; url: string; size: number; mimeType: string;
  width: number | null; height: number | null;
}

// Notification
interface Notification {
  id: string; userId: string; type: NotificationType;
  payload: NotificationPayload; readAt: Date | null; createdAt: Date;
}

// Typing
interface TypingUser { userId: string; name: string }
```

### 2.2 New Domain Types

#### Calls (`calls/types.ts`)

```typescript
type CallType = '1:1' | 'huddle';
type CallStatus = 'ringing' | 'connected' | 'ended' | 'missed';
type ParticipantStatus = 'joining' | 'connected' | 'left';

interface CallState {
  id: string;
  channelId: string;
  type: CallType;
  status: CallStatus;
  initiatorId: string;
  participants: CallParticipant[];
  startedAt: Date;
  endedAt: Date | null;
  isScreenSharing: boolean;
  screenSharingUserId: string | null;
}

interface CallParticipant {
  userId: string;
  user: UserSummary;
  status: ParticipantStatus;
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  audioLevel: number;          // 0-1 from AnalyserNode
  joinedAt: Date;
}

interface CallSignalPayload {
  callId: string;
  fromUserId: string;
  toUserId: string;
  signal: unknown;             // simple-peer signal data (opaque — never inspect)
}

interface HuddleState {
  channelId: string;
  participants: CallParticipant[];
  startedAt: Date;
}

// Zustand store shape
interface CallStoreState {
  activeCall: CallState | null;
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  isMuted: boolean;
  isCameraOn: boolean;
  incomingCall: { callId: string; channelId: string; callerId: string; callerName: string } | null;
  huddlesByChannel: Record<string, HuddleState>;
  setActiveCall: (call: CallState | null) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setScreenStream: (stream: MediaStream | null) => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  setIncomingCall: (incoming: CallStoreState['incomingCall']) => void;
  setHuddle: (channelId: string, huddle: HuddleState | null) => void;
}
```

#### Scheduling (`scheduling/types.ts`)

```typescript
interface ScheduledMessage {
  id: string;
  channelId: string;
  userId: string;
  content: TiptapJSON;
  contentPlain: string;
  scheduledFor: Date;
  sentAt: Date | null;
  isCancelled: boolean;
  createdAt: Date;
}

interface ScheduleMessageInput {
  channelId: string;
  content: TiptapJSON;
  scheduledFor: Date;       // Must be in the future
}
```

#### Polls (`polls/types.ts`)

```typescript
interface Poll {
  id: string;
  messageId: string;
  question: string;
  options: string[];           // Stored as JSON string in DB, parsed at read boundary
  isActive: boolean;
  multiChoice: boolean;        // When true, voters may select multiple options
  endsAt: Date;
  votes: PollVoteGroup[];     // Aggregated for display
  totalVotes: number;
  createdAt: Date;
}

interface PollVoteGroup {
  option: string;
  count: number;
  userIds: string[];
  percentage: number;          // Computed client-side
}

interface CreatePollInput {
  channelId: string;
  question: string;
  options: string[];           // Min 2, max 10
  endsAt: Date;
}
```

#### Canvas (`canvas/types.ts`)

```typescript
interface Canvas {
  id: string;
  channelId: string;
  name: string;
  contentJson: string;        // Tiptap/Yjs document as JSON string
  createdById: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface CanvasVersion {
  id: string;
  canvasId: string;
  userId: string;
  contentJson: string;
  changeDescription: string | null;
  createdAt: Date;
  editor: UserSummary;
}
```

#### GIFs (`gifs/types.ts`)

```typescript
interface TenorGif {
  id: string;
  title: string;
  url: string;                // Full-size GIF URL
  previewUrl: string;         // Tiny preview for grid
  width: number;
  height: number;
}

interface GifSearchResult {
  results: TenorGif[];
  next: string | null;        // Pagination cursor from Tenor API
}
```

#### Link Previews (`link-previews/types.ts`)

```typescript
interface LinkPreviewData {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  domain: string;
  favicon: string | null;
}
```

#### Workflows (`workflows/types.ts`)

```typescript
type WorkflowTriggerType = 'message_posted' | 'member_joined' | 'reaction_added' | 'scheduled';
type WorkflowActionType = 'post_message' | 'send_notification' | 'add_reaction' | 'assign_role';

interface Workflow {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  triggerType: WorkflowTriggerType;
  triggerConfig: Record<string, unknown>;
  actions: WorkflowAction[];
  createdById: string;
  createdAt: Date;
}

interface WorkflowAction {
  id: string;
  workflowId: string;
  sequence: number;
  actionType: WorkflowActionType;
  config: Record<string, unknown>;
}
```

#### Admin (`admin/types.ts`)

```typescript
interface AnalyticsData {
  messagesPerDay: Array<{ date: string; count: number }>;
  activeUsersPerDay: Array<{ date: string; count: number }>;
  topChannels: Array<{ channelId: string; name: string; messageCount: number }>;
  memberGrowth: Array<{ date: string; totalMembers: number }>;
  totalMessages: number;
  totalMembers: number;
  totalChannels: number;
}

interface AuditLogEntry {
  id: string;
  workspaceId: string;
  actorId: string;
  actor: UserSummary;
  action: string;             // 'MEMBER_ROLE_CHANGED', 'MEMBER_REMOVED', etc.
  targetId: string | null;
  changes: Record<string, unknown> | null;
  createdAt: Date;
}
```

#### Bookmarks (`bookmarks/types.ts`)

```typescript
interface BookmarkWithMessage {
  id: string;
  messageId: string;
  userId: string;
  createdAt: Date;
  message: MessageWithMeta;   // Hydrated message with author, files, reactions
}
```

### 2.3 API Route Contracts

All routes return JSON wrapped in the standard envelope from `shared/types/api.ts`:

```typescript
type ApiSuccess<T> = { ok: true; data: T }
type ApiError = { ok: false; error: string; code: string; fieldErrors?: Record<string, string[]> }
type PaginatedResponse<T> = { ok: true; data: T[]; pagination: { cursor: string | null; hasMore: boolean } }

// Helpers — import from '@/shared/types/api'
ok(data)                          // → { ok: true, data }
err(code, message, fieldErrors?)  // → { ok: false, code, error, fieldErrors }
paginated(data, cursor, hasMore)  // → { ok: true, data, pagination: { cursor, hasMore } }
```

**Existing endpoints** (unchanged):

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/channels/[channelId]/messages?cursor=&limit=50` | MEMBER |
| GET | `/api/workspaces/[workspaceId]/search?q=...` | MEMBER |
| POST | `/api/files` | MEMBER |
| GET/POST/DELETE | `/api/workspaces/[workspaceId]/members` | MEMBER/ADMIN+/ADMIN+ |
| PATCH/DELETE | `/api/workspaces/[workspaceId]` | ADMIN+/OWNER |

**New endpoints**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/link-preview?url=...` | MEMBER | Open Graph metadata (cached) |
| GET | `/api/gifs?q=...&next=...` | MEMBER | Tenor GIF search proxy |
| GET/POST | `/api/scheduled-messages` | MEMBER | List/create scheduled messages |
| DELETE | `/api/scheduled-messages?id=<id>` | message owner | Cancel scheduled message (204 on success) |
| POST | `/api/polls` | MEMBER | Create poll (body includes multiChoice boolean) |
| GET | `/api/polls?pollId=<id>` | MEMBER | Get poll with vote aggregates |
| PATCH | `/api/polls` | creator or ADMIN+ | End poll early (body: `{ pollId, action: 'end' }`) |
| GET/PATCH | `/api/canvas/[canvasId]` | MEMBER | Get/save canvas |
| GET | `/api/admin/analytics?workspaceId=...&range=7d` | ADMIN+ | Analytics |
| GET | `/api/admin/audit-log?workspaceId=...` | ADMIN+ | Audit log |

### 2.4 Socket.IO Events

All events defined in `shared/types/socket.ts`. Both server and client import this file.

**Client → Server (existing)**:

| Event | Payload | Handler |
|-------|---------|---------|
| `workspace:join` | `{ workspaceId }` | `presence.ts` |
| `channel:join` | `{ channelId }` | `channels.ts` |
| `channel:leave` | `{ channelId }` | `channels.ts` |
| `message:send` | `{ channelId, content, parentId?, fileIds? }` | `messages.ts` |
| `message:edit` | `{ messageId, content }` | `messages.ts` |
| `message:delete` | `{ messageId }` | `messages.ts` |
| `message:react` | `{ messageId, emoji }` | `messages.ts` |
| `message:unreact` | `{ messageId, emoji }` | `messages.ts` |
| `typing:start` | `{ channelId }` | `typing.ts` |
| `typing:stop` | `{ channelId }` | `typing.ts` |
| `presence:heartbeat` | (none) | `presence.ts` |

**Client → Server (new)**:

| Event | Payload | Handler |
|-------|---------|---------|
| `call:initiate` | `{ channelId, type }` | `calls.ts` |
| `call:accept` | `{ callId }` | `calls.ts` |
| `call:decline` | `{ callId }` | `calls.ts` |
| `call:signal` | `{ callId, toUserId, signal }` | `calls.ts` |
| `call:hangup` | `{ callId }` | `calls.ts` |
| `call:toggle-mute` | `{ callId, isMuted }` | `calls.ts` |
| `call:toggle-camera` | `{ callId, isCameraOn }` | `calls.ts` |
| `call:screen-share` | `{ callId, isSharing }` | `calls.ts` |
| `huddle:join` | `{ channelId }` | `huddles.ts` |
| `huddle:leave` | `{ channelId }` | `huddles.ts` |
| `huddle:signal` | `{ channelId, toUserId, signal }` | `huddles.ts` |
| `poll:vote` | `{ pollId, option }` | `polls.ts` (multiChoice: upsert; single: replace) |
| `poll:unvote` | `{ pollId, option }` | `polls.ts` |
| `poll:end` | `{ pollId }` | `polls.ts` (creator only) |
| `canvas:update` | `{ canvasId, update }` | `canvas.ts` |
| `canvas:awareness` | `{ canvasId, state }` | `canvas.ts` |
| `message:read` | `{ channelId, messageId }` | `read-receipts.ts` |

**Server → Client (existing)**:

| Event | Payload |
|-------|---------|
| `message:new` | `MessageWithMeta` |
| `message:updated` | `MessageWithMeta` |
| `message:deleted` | `{ messageId, channelId }` |
| `reaction:updated` | `{ messageId, reactions }` |
| `thread:reply` | `MessageWithMeta` |
| `typing:users` | `{ channelId, users }` |
| `presence:update` | `{ userId, status }` |
| `channel:created` | `Channel` |
| `channel:updated` | `Channel` |
| `channel:archived` | `{ channelId }` |
| `member:joined` | `WorkspaceMember & { user }` |
| `member:left` | `{ userId, workspaceId }` |
| `notification:new` | `Notification` |
| `unread:update` | `{ channelId, unreadCount, hasMention }` |
| `dm:participants` | `{ channelId, participants }` |

**Server → Client (new)**:

| Event | Payload |
|-------|---------|
| `call:incoming` | `{ callId, channelId, callerId, callerName, type }` |
| `call:accepted` | `{ callId, userId }` |
| `call:declined` | `{ callId, userId }` |
| `call:signal` | `{ callId, fromUserId, signal }` |
| `call:ended` | `{ callId, reason }` |
| `call:participant-update` | `{ callId, participant }` |
| `huddle:update` | `{ channelId, participants }` |
| `poll:updated` | `{ pollId, votes, totalVotes }` |
| `poll:ended` | `{ pollId }` |
| `canvas:update` | `{ canvasId, update }` |
| `canvas:awareness` | `{ canvasId, states }` |
| `message:read-receipt` | `{ channelId, messageId, userId, readAt }` |

### 2.5 Server Actions

All server actions use `requireAuth()` and follow: authenticate → authorize → validate → mutate → revalidate.

```typescript
// Existing (do not modify signatures)
createWorkspace(name, slug): Promise<Workspace>
updateWorkspace(id, data): Promise<Workspace>
deleteWorkspace(id): Promise<void>
inviteMember(workspaceId, email, role): Promise<WorkspaceMember>
removeMember(workspaceId, userId): Promise<void>
createChannel(workspaceId, data): Promise<Channel>
archiveChannel(channelId): Promise<Channel>
updateProfile(data): Promise<UserProfile>
updateMemberRole(workspaceId, userId, role): Promise<WorkspaceMember>

// New
createScheduledMessage(input: ScheduleMessageInput): Promise<ScheduledMessage>
cancelScheduledMessage(id: string): Promise<void>
createPoll(input: CreatePollInput): Promise<Poll>
endPoll(pollId: string): Promise<void>
fetchLinkPreview(url: string): Promise<LinkPreviewData>
saveCanvasSnapshot(canvasId: string, contentJson: string): Promise<CanvasVersion>
addBookmark(messageId: string): Promise<BookmarkWithMessage>
removeBookmark(messageId: string): Promise<void>
createWorkflow(workspaceId: string, data: Partial<Workflow>): Promise<Workflow>
updateWorkflow(id: string, data: Partial<Workflow>): Promise<Workflow>
deleteWorkflow(id: string): Promise<void>
```

### 2.6 Permission Guards

Role hierarchy defined in `shared/lib/constants.ts`:

```typescript
const ROLE_HIERARCHY: MemberRole[] = [MemberRole.MEMBER, MemberRole.ADMIN, MemberRole.OWNER];

function hasPermission(role: MemberRole, requiredRole: MemberRole): boolean {
  return ROLE_HIERARCHY.indexOf(role) >= ROLE_HIERARCHY.indexOf(requiredRole);
}

// Standard pattern in API routes and server actions:
const session = await requireAuth();                              // 401
const role = await getMemberRole(workspaceId, session.user.id);  // null = not member
if (!role) return 403;
if (!hasPermission(role, MemberRole.ADMIN)) return 403;          // ADMIN+ check
```

---

## 3. Shared Types/Models

### 3.1 Database Schema

See `prisma/schema.prisma`. All IDs are CUID strings. Soft deletes use `isDeleted + deletedAt`.

**Existing tables (13)** — do not modify structure:

| Table | Key Columns | Relationships |
|-------|------------|---------------|
| `users` | email (unique), password?, name?, image?, title?, statusText?, statusEmoji?, timezone? | → accounts, memberships, messages, reactions, files, bookmarks, notifications |
| `accounts` | provider + providerAccountId (unique) | → user (NextAuth OAuth) |
| `workspaces` | slug (unique), ownerId | → members, channels, customEmojis |
| `workspace_members` | workspaceId+userId (unique), role (default 'MEMBER') | → workspace, user |
| `channels` | workspaceId+name (unique), type (default 'PUBLIC') | → members, messages, pins |
| `channel_members` | channelId+userId (unique), lastReadAt?, notifyPref | → channel, user |
| `messages` | channelId, userId, contentJson, contentPlain, parentId? | → reactions, files, pins, bookmarks |
| `reactions` | userId+messageId+emoji (unique) | → message, user |
| `files` | messageId?, name, url, mimeType, size | → message, user |
| `pins` | messageId (unique) | → channel, message, pinnedBy |
| `bookmarks` | messageId+userId (unique) | → message, user |
| `notifications` | userId, type, payload (JSON string), readAt? | → user, actor? |
| `custom_emojis` | workspaceId+name (unique), imageUrl | → workspace, createdBy |

**New tables (9)** — see `docs/research/prisma_model_definitions.md` for copy-paste Prisma syntax:

| Table | Key Columns | Notes |
|-------|------------|-------|
| `polls` | messageId (unique 1:1), question, options (JSON), isActive, endsAt | |
| `poll_votes` | pollId+userId+option (unique) | Prevents duplicate votes |
| `link_previews` | messageId, url, title?, description?, imageUrl?, domain | |
| `canvas` | channelId+name (unique), contentJson, createdById | |
| `canvas_versions` | canvasId, userId, contentJson | Snapshot history |
| `calls` | channelId, initiatorId, startedAt, endedAt?, duration? | |
| `call_participants` | callId+userId (unique) | |
| `scheduled_messages` | channelId, userId, contentJson, contentPlain, scheduledFor, sentAt? | Index on scheduledFor+sentAt for cron |
| `channel_categories` | channelId+userId (unique), categoryName, position | Per-user organization |

**Field addition**: `User.dndUntil: DateTime?` (Do Not Disturb expiration)

### 3.2 Enums & Constants

```typescript
// shared/lib/constants.ts
const MESSAGES_PER_PAGE = 50;
const MAX_MESSAGES_PER_PAGE = 100;
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_FILE_SIZE = 10 * 1024 * 1024;       // 10 MB
const MAX_FILES_PER_MESSAGE = 10;
const PRESENCE_HEARTBEAT_INTERVAL = 30_000;    // Client heartbeat every 30s
const PRESENCE_TIMEOUT = 90_000;               // Server marks offline after 90s
const TYPING_TIMEOUT = 3_000;                  // Typing indicator cleared after 3s
const MAX_DM_GROUP_SIZE = 9;
const MAX_HUDDLE_PARTICIPANTS = 6;             // NEW: mesh topology limit
const MAX_POLL_OPTIONS = 10;                   // NEW
const SCHEDULED_MESSAGE_CHECK_INTERVAL = 60;   // NEW: seconds between cron checks
```

---

## 4. Configuration Patterns

### 4.1 Environment Variables

```bash
# Database
DATABASE_URL="file:./volume.db"

# Auth
AUTH_SECRET="<openssl rand -base64 32>"

# OAuth (optional)
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""

# File storage (production)
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
AWS_REGION="us-east-1"
AWS_S3_BUCKET=""

# File storage (development)
UPLOAD_DIR="./public/uploads"
NEXT_PUBLIC_UPLOAD_BASE_URL="http://localhost:3000/uploads"

# NEW: Tenor GIF API
TENOR_API_KEY=""

# NEW: WebRTC TURN server (optional — Google STUN used by default)
TURN_URL=""
TURN_USERNAME=""
TURN_CREDENTIAL=""

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
PORT=3000
NODE_ENV=development
```

### 4.2 TypeScript Configs

- `tsconfig.json` — Next.js (bundler resolution, `@/` alias to project root)
- `tsconfig.server.json` — server.ts + server/ (CommonJS, Node resolution, built via `tsup`)

### 4.3 Tailwind Content Paths

When adding a new domain directory, add it to `tailwind.config.ts` content array:

```typescript
content: [
  './app/**/*.{ts,tsx}',
  './components/**/*.{ts,tsx}',
  './workspaces/**/*.{ts,tsx}',
  './channels/**/*.{ts,tsx}',
  './messages/**/*.{ts,tsx}',
  './members/**/*.{ts,tsx}',
  './files/**/*.{ts,tsx}',
  './search/**/*.{ts,tsx}',
  './notifications/**/*.{ts,tsx}',
  './presence/**/*.{ts,tsx}',
  './auth/**/*.{ts,tsx}',
  './shared/**/*.{ts,tsx}',
  // NEW domains:
  './calls/**/*.{ts,tsx}',
  './scheduling/**/*.{ts,tsx}',
  './polls/**/*.{ts,tsx}',
  './canvas/**/*.{ts,tsx}',
  './gifs/**/*.{ts,tsx}',
  './link-previews/**/*.{ts,tsx}',
  './workflows/**/*.{ts,tsx}',
  './admin/**/*.{ts,tsx}',
  './bookmarks/**/*.{ts,tsx}',
],
```

---

## 5. Integration Points

### 5.1 Socket.IO ↔ Next.js (Custom Server)

```
server.ts
  └── http.createServer → handles Next.js requests
  └── new Server(httpServer) → Socket.IO on /socket.io path
  └── globalThis.__socketio = io → accessible from Route Handlers via getIO()
  └── applyAuthMiddleware(io) → validates NextAuth JWT on every handshake
  └── registerHandlers(io)   → wires all domain event handlers
  └── initScheduler()        → NEW: starts node-cron for scheduled messages
```

Route Handlers emit via `server/socket-emitter.ts`:
```typescript
import { emitToChannel, emitToUser, emitToWorkspace } from '@/server/socket-emitter'
```

### 5.2 Auth ↔ Socket.IO

Same-origin means NextAuth cookies arrive automatically on WebSocket upgrade.
`server/socket-auth.ts` decrypts JWT with `AUTH_SECRET` and sets `socket.data.userId`.

### 5.3 Socket.IO Rooms

```
workspace:${workspaceId}  — presence, channel created, member joined
channel:${channelId}      — messages, typing, reactions, polls, canvas sync
user:${userId}            — notifications, DM pings, unread updates, incoming calls
```

### 5.4 WebRTC ↔ Socket.IO Signaling

Socket.IO relays simple-peer signal data between peers. Media flows P2P.
Group huddles use full mesh (max 6 = 15 peer connections).

### 5.5 Yjs ↔ Socket.IO ↔ Canvas

Yjs updates transported via `canvas:update` socket events. `canvas:awareness` for cursors.
Periodic snapshots saved to DB as `CanvasVersion`.

### 5.6 Scheduled Messages ↔ Cron

`server/cron/scheduled-messages.ts` checks every 60s for `scheduledFor <= now AND sentAt IS NULL`.
Creates message, emits via `emitToChannel()`, sets `sentAt`. Managed via REST:
- `GET /api/scheduled-messages?channelId=<id>` — list pending
- `POST /api/scheduled-messages` — create
- `DELETE /api/scheduled-messages?id=<id>` — cancel (204 on success)

### 5.7 Link Previews ↔ Messages

Async: after message creation, extract URLs → fetch OG data → insert `LinkPreview` rows → emit `message:updated`.

**SSRF Guard**: `link-previews/actions.ts` contains `isSafeUrl()` which blocks:
- Non-http(s) protocols (`file:`, `ftp:`, etc.)
- Loopback addresses (`localhost`, `127.0.0.0/8`, `::1`, `0.0.0.0`)
- Private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
- Link-local/metadata (`169.254.0.0/16` — blocks AWS metadata endpoint)
- Carrier-grade NAT (`100.64.0.0/10`)
- Bare hostnames without a dot (prevents internal service discovery)

Every call to `fetchLinkPreview()` runs through `isSafeUrl()` before any outbound request.
The route handler at `app/api/link-preview/route.ts` also validates protocol upfront (returns 400).

### 5.8 Files ↔ Messages

Upload first (`POST /api/files`), receive `{ data: FileUploadResult }` envelope.
Attach `fileIds` to message payload (including voice messages from `AudioRecorder`).
Storage adapter swaps by `NODE_ENV`.

**Audio messages**: `AudioRecorder.tsx` uploads the blob, extracts `data.id` from the
envelope response, passes `fileId` to `MessageComposer.handleAudioSend`, which includes
`fileIds: [fileId]` in the `MessageSendPayload`.

### 5.9 Polls ↔ Socket.IO

Server handler (`server/socket-handlers/polls.ts`) implements multiChoice-aware voting:
- **multiChoice=true**: `poll:vote` upserts (adds vote without removing others)
- **multiChoice=false**: `poll:vote` replaces within a transaction (delete all existing + create new)
- `poll:unvote` removes a specific vote record
- After any change, re-aggregates votes and emits `poll:updated` to the channel room

**KNOWN BUG**: The client `PollDisplay.tsx` does NOT respect `multiChoice`. It always uses
single-choice logic (`getUserVote()` returns one option; `handleVote` removes previous vote
unconditionally). See Section 12 for details.

---

## 6. Dependency List

### Production

```json
{
  "next": "^14.2.0",
  "react": "^18.3.0",
  "react-dom": "^18.3.0",
  "socket.io": "^4.7.5",
  "socket.io-client": "^4.7.5",
  "@prisma/client": "^5.14.0",
  "next-auth": "5.0.0-beta.25",
  "@auth/prisma-adapter": "^2.4.0",
  "@tiptap/core": "^3.0.0",
  "@tiptap/starter-kit": "^3.0.0",
  "@tiptap/extension-mention": "^3.0.0",
  "@tiptap/extension-emoji": "^3.0.0",
  "@tiptap/extension-code-block-lowlight": "^3.0.0",
  "@tiptap/extension-link": "^3.0.0",
  "@tiptap/extension-placeholder": "^3.0.0",
  "@tiptap/static-renderer": "^3.0.0",
  "@tiptap/react": "^3.0.0",
  "@tiptap/suggestion": "^3.0.0",
  "@tiptap/pm": "^3.0.0",
  "lowlight": "^3.1.0",
  "@floating-ui/dom": "^1.6.0",
  "@floating-ui/react": "^0.26.0",
  "emoji-mart": "^5.6.0",
  "@emoji-mart/data": "^1.2.1",
  "@emoji-mart/react": "^1.1.1",
  "react-virtuoso": "4.18.1",
  "zustand": "^5.0.11",
  "tailwindcss": "^3.4.0",
  "tailwindcss-animate": "^1.0.7",
  "clsx": "^2.1.0",
  "tailwind-merge": "^2.3.0",
  "class-variance-authority": "^0.7.0",
  "@radix-ui/react-avatar": "^1.1.0",
  "@radix-ui/react-dialog": "^1.1.0",
  "@radix-ui/react-dropdown-menu": "^2.1.0",
  "@radix-ui/react-label": "^2.1.0",
  "@radix-ui/react-popover": "^1.1.0",
  "@radix-ui/react-scroll-area": "^1.1.0",
  "@radix-ui/react-select": "^2.2.6",
  "@radix-ui/react-separator": "^1.1.0",
  "@radix-ui/react-slot": "^1.1.0",
  "@radix-ui/react-tabs": "^1.1.13",
  "@radix-ui/react-toast": "^1.2.0",
  "@radix-ui/react-tooltip": "^1.1.0",
  "lucide-react": "^0.400.0",
  "@aws-sdk/client-s3": "^3.600.0",
  "@aws-sdk/s3-request-presigner": "^3.600.0",
  "bcryptjs": "^2.4.3",
  "zod": "^3.23.0",
  "date-fns": "^3.6.0",
  "nanoid": "^5.0.0",
  "sharp": "^0.33.0",
  "sonner": "^2.0.7",
  "next-themes": "^0.4.6",
  "framer-motion": "^11.0.0",
  "simple-peer": "^9.11.1",
  "node-cron": "^3.0.0",
  "react-day-picker": "^8.10.0",
  "open-graph-scraper": "^6.5.0",
  "yjs": "^13.6.0",
  "y-prosemirror": "^1.2.0",
  "recharts": "^2.12.0",
  "@dnd-kit/core": "^6.1.0",
  "@dnd-kit/sortable": "^8.0.0",
  "canvas-confetti": "^1.9.0",
  "react-colorful": "^5.6.0"
}
```

### Development

```json
{
  "prisma": "^5.14.0",
  "tsx": "^4.15.0",
  "tsup": "^8.1.0",
  "typescript": "^5.4.0",
  "@types/node": "^20.14.0",
  "@types/react": "^18.3.0",
  "@types/react-dom": "^18.3.0",
  "@types/bcryptjs": "^2.4.6",
  "@types/simple-peer": "latest",
  "eslint": "^8.57.0",
  "eslint-config-next": "^14.2.0",
  "jest": "^30.2.0",
  "jest-environment-jsdom": "^30.2.0",
  "@testing-library/react": "^16.3.2",
  "@testing-library/jest-dom": "^6.9.1",
  "@testing-library/user-event": "^14.6.1",
  "ts-jest": "^29.4.6",
  "prettier": "^3.3.0",
  "prettier-plugin-tailwindcss": "^0.6.0",
  "autoprefixer": "^10.4.19",
  "postcss": "^8.4.38"
}
```

### Scripts

```json
{
  "dev": "tsx watch server.ts",
  "build": "next build && tsup server.ts --format cjs --out-dir dist/server",
  "start": "NODE_ENV=production node dist/server/server.js",
  "db:push": "prisma db push",
  "db:migrate": "prisma migrate dev",
  "db:generate": "prisma generate",
  "db:studio": "prisma studio",
  "db:seed": "tsx prisma/seed.ts",
  "lint": "next lint",
  "format": "prettier --write ."
}
```

---

## 7. Data Boundary Contracts

Every external data source has a transform layer. No downstream module receives
data that doesn't match its expected types.

### 7.1 Prisma → Domain Types

Transform in `queries.ts` files at the query boundary:

```typescript
// Example: workspaces/queries.ts
export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, name: true, image: true } } },
  });
  return members.map((m) => ({
    id: m.id,
    workspaceId: m.workspaceId,
    userId: m.userId,
    role: m.role as MemberRole,           // String → enum cast at boundary
    joinedAt: m.joinedAt,
    user: {
      id: m.user.id,
      name: m.user.name || 'Unknown',     // Fallback for nullable name
      image: m.user.image,
    },
  }));
}
```

**Rules**:
- Cast `String` DB fields to TypeScript enums at the query boundary
- Provide `'Unknown'` fallback for nullable `user.name` in `UserSummary`
- Parse `contentJson` strings to objects; fallback to `{ type: 'doc', content: [] }`
- Return typed domain interfaces, never raw Prisma types downstream

### 7.2 Message Content: DB ↔ TiptapJSON

```typescript
// Read boundary — parse JSON string
let content: TiptapJSON;
try { content = JSON.parse(msg.contentJson); }
catch { content = { type: 'doc', content: [] }; }

// Write boundary — stringify
const contentJson = JSON.stringify(content);
const contentPlain = extractPlainText(content);
```

### 7.3 Socket Events → Client Stores

Socket events are the real-time inbound path. REST is for initial page load only.

```typescript
socket.on('message:new', (message: MessageWithMeta) => {
  useMessagesStore.getState().addMessage(message.channelId, message);
});
socket.on('presence:update', ({ userId, status }) => {
  usePresenceStore.getState().setPresence(userId, status as PresenceStatus);
});
```

### 7.4 External APIs → Domain Types

**Tenor** (`gifs/lib/tenor.ts`): Transform nested media formats to flat `TenorGif`.
**Open Graph** (`link-previews/actions.ts`): Normalize optional OG fields to `LinkPreviewData`.
All inbound URLs pass through `isSafeUrl()` SSRF guard before any outbound fetch.
**WebRTC signals**: Opaque — relay without inspection via `call:signal` events.

### 7.5 User Input → Validated Payloads

All input validated with Zod at API route boundaries before business logic:

```typescript
const parsed = schema.safeParse(body);
if (!parsed.success) return NextResponse.json(err('VALIDATION_ERROR', ...), { status: 400 });
```

### 7.6 XSS Sanitization — Rendering User Content

`MessageItem.tsx` renders Tiptap JSON to HTML via `renderTiptapContent()`. At the link mark
boundary, href values are sanitized against a protocol allowlist:

```typescript
case 'link': {
  const rawHref = String(mark.attrs?.href ?? '');
  const safeHref = /^(https?:|mailto:|\/)/i.test(rawHref) ? rawHref : '#';
  text = `<a href="${escapeHtml(safeHref)}" ...>${text}</a>`;
  break;
}
```

**Rule**: Any user-provided URL rendered as an `href` MUST pass through protocol validation.
Only `https:`, `http:`, `mailto:`, and relative paths (`/`) are allowed. All other protocols
(including `javascript:`) are neutralized to `#`.

### 7.7 File Upload Response Envelope

`POST /api/files` returns:

```typescript
// Response shape
{ data: { id: string; url: string; filename: string; mimeType: string; size: number } }
```

Callers (including `AudioRecorder.tsx`) MUST destructure from `{ data }`, not from the
top-level response. The `id` field is used as `fileId` in `MessageSendPayload.fileIds`.

---

## 8. State Ownership Map

Every piece of shared state has exactly ONE authoritative owner.

**Primary client store**: `useAppStore` in `store/index.ts` consolidates most client state
into a single Zustand store. Domain-specific stores (`useMessagesStore`, `useCallStore`) exist
for domains with complex independent state.

| Data Domain | Owner | Storage | Consumers |
|-------------|-------|---------|-----------|
| **Auth user** | `useAppStore` (`.user`) | Zustand (set on login) | All user-aware components |
| **Current workspace** | `useAppStore` (`.currentWorkspace`) + URL `[workspaceSlug]` | Zustand + URL | Sidebar, all workspace-scoped queries |
| **Channels list** | `useAppStore` (`.channels`) | Zustand | ChannelSidebar, ChannelCategories |
| **Starred channels** | `useAppStore` (`.starredChannels`) | Zustand | ChannelCategories Starred section |
| **Channel categories** | `ChannelCategories` component local state | localStorage per userId+workspaceId | ChannelCategories only |
| **Messages per channel** | `useAppStore` (`.messagesByChannel`) | Zustand, keyed by channelId | MessageList, MessageItem, ThreadPanel |
| **Active thread** | `useAppStore` (`.activeThread`) | Zustand | ThreadPanel, RightPanel |
| **Presence** | `useAppStore` (`.presenceMap`) | Zustand map: userId → status | UserAvatar, PresenceIndicator, MemberList |
| **Typing indicators** | `useAppStore` (`.typingByChannel`) | Zustand map: channelId → users | TypingIndicator |
| **Unread counts** | `useAppStore` (per-channel `.unreadCount`) | Zustand (server-pushed) | ChannelList badges |
| **Active call** | `useCallStore` (Zustand) | In-memory | CallProvider, FloatingCallWindow, CallControls |
| **Huddle state** | `useCallStore` (Zustand) | Keyed by channelId | HuddleBar |
| **Auth session** | NextAuth `auth()` / `useSession()` | JWT cookie | requireAuth(), socket-auth |
| **Current channel** | URL `[channelId]` param | URL | Channel page, composer |
| **Server presence timers** | `presenceTimers` Map (server/presence.ts) | Server in-memory | Presence broadcast |
| **Server typing state** | `typingByChannel` Map (server/typing.ts) | Server in-memory | Typing broadcast |
| **Canvas document** | Yjs Y.Doc (CRDT) | In-memory + DB snapshots | CanvasEditor |
| **Theme** | `next-themes` ThemeProvider | localStorage | All components via CSS vars |
| **Color theme** | `shared/lib/themes.ts` + localStorage | localStorage (`slack-clone-color-theme`) | ThemePicker, applyTheme/resetTheme |
| **Database records** | Prisma/SQLite | Persistent | All queries.ts files |

**Rules**:
1. Never duplicate state across stores. Messages live in `useAppStore.messagesByChannel` only.
2. Socket events update the owning store. Components subscribe to stores, not sockets directly.
3. URL is the source of truth for navigation. Zustand mirrors workspace/channel from URL but URL wins on conflict.
4. Server in-memory state is ephemeral. Database is the persistent truth.
5. `useEffect` hooks that read store data MUST list that data in their dependency array (or use stable derived keys via `useMemo` if the raw data changes too frequently — see `ChannelCategories.tsx` pattern).

---

## 9. Visual & Interaction Design Language

### 9.1 Personality

**Professional productivity tool with warmth.** Information-dense without feeling cramped.
Calm and confident, not flashy. Every visual choice reduces cognitive load and helps users
focus on communication.

### 9.2 Color System

HSL CSS custom properties in `app/globals.css`, consumed via Tailwind semantic tokens.
Primary accent is **rich purple** (262° hue) — creative, focused, not corporate-cold.

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `background` | white | deep navy `222.2 84% 4.9%` | Page bg |
| `foreground` | near-black `222.2 84% 4.9%` | near-white `210 40% 98%` | Primary text |
| `primary` | purple `262 83% 58%` | `263 70% 50.4%` | Links, active states, CTAs |
| `secondary` | light gray `210 40% 96.1%` | `217.2 32.6% 17.5%` | Secondary buttons, subtle bgs |
| `muted` | `210 40% 96.1%` | `217.2 32.6% 17.5%` | Disabled, placeholders |
| `muted-foreground` | `215.4 16.3% 46.9%` | `215 20.2% 65.1%` | Timestamps, secondary text |
| `destructive` | red `0 84.2% 60.2%` | `0 62.8% 30.6%` | Delete, errors |
| `border` | `214.3 31.8% 91.4%` | `217.2 32.6% 17.5%` | All borders |
| `ring` | matches primary | matches primary | Focus rings |
| `radius` | `0.5rem` | `0.5rem` | Border radius (8px) |

**NEVER use raw Tailwind colors** (`text-gray-500`, `bg-blue-600`).
Always use semantic tokens (`text-muted-foreground`, `bg-primary`).

### 9.3 Typography & Spacing

- Body/message text: `text-sm` (14px)
- Channel names: `text-sm font-medium`
- Timestamps: `text-xs text-muted-foreground`
- Spacing rhythm: `gap-2` (8px) inline, `gap-3` (12px) list items, `gap-4` (16px) sections
- Sidebar items: `px-2 py-1.5` compact clickable rows
- Messages: `px-4 py-1` dense threading

### 9.4 Animation Philosophy

**Two animation systems — use the correct one:**

| Scenario | System | Why |
|----------|--------|-----|
| Radix dialog/sheet/dropdown open/close | `tailwindcss-animate` | Perfect `data-[state=]` integration |
| Hover effects, loading spinners | Tailwind transitions | Simple, CSS-only |
| Message entry in virtuoso list | Framer Motion | Needs coordination with virtual scroll |
| Reaction emoji bounce | Framer Motion | Spring physics |
| Search result stagger | Framer Motion | Sequencing |
| Floating call window drag | Framer Motion | Gesture hooks |
| Confetti celebrations | `canvas-confetti` | Canvas overlay |

**react-virtuoso constraint**: `AnimatePresence` does NOT work wrapping the virtuoso list.
Use `motion.div` inside `itemContent` renderer for per-message animations.

**Shared constants** (`shared/lib/animations.ts`):
```typescript
export const springSnappy = { type: 'spring', stiffness: 500, damping: 30 } as const;
export const springGentle = { type: 'spring', stiffness: 300, damping: 25 } as const;
export const messageEnter = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
};
```

### 9.5 Component Guidelines

- **Buttons**: `bg-primary text-primary-foreground` for primary. Ghost/outline for secondary. `whileTap={{ scale: 0.95 }}` via Framer Motion.
- **Cards/Panels**: `border border-border`, no shadows. Thread panel uses `border-l`.
- **Inputs**: `bg-background border border-input rounded-md`. Focus: `ring-2 ring-ring`.
- **Avatars**: `rounded-full` for users, `rounded-md` for workspaces. Always show initials fallback.
- **Hover states**: Message rows show actions on hover (`opacity-0 group-hover:opacity-100`). Keep transitions fast (150ms).
- **Confirmation & input dialogs**: NEVER use `window.confirm()`, `window.prompt()`, or `window.alert()`. All confirmations and user inputs MUST use Radix UI Dialog via `@/components/ui/dialog`. Pattern:
  1. Add state (`const [dialogOpen, setDialogOpen] = useState(false)`)
  2. Trigger opens dialog (`setDialogOpen(true)`) instead of calling native browser API
  3. Render `<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>` with `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, and `DialogFooter`
  4. For destructive actions: Cancel button (`variant="outline"`) + Confirm button (`className="bg-destructive text-destructive-foreground"`)
  5. For input prompts: Add controlled `<Input>` inside `DialogContent`, submit on Enter key + button click

### 9.6 Multi-Theme Support

Themes defined in `shared/lib/themes.ts` as CSS variable overrides applied to `<html>`:
```typescript
export const themes = {
  default: { /* current globals.css values */ },
  midnight: { dark: { '--background': '230 25% 8%', '--primary': '210 100% 60%', ... } },
  forest: { light: { '--primary': '142 72% 42%' }, dark: { '--primary': '142 72% 50%' } },
  sunset: { light: { '--primary': '25 95% 53%' }, dark: { '--primary': '25 95% 60%' } },
} as const;
```

Components never reference theme names — only semantic tokens.

---

## 10. Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Custom server.ts** | Socket.IO needs persistent server. Same-origin = auto cookie sharing. Deploy on Railway/Fly.io, never Vercel. |
| **JWT session strategy** | Cookies shared between Next.js and Socket.IO without separate auth. |
| **simple-peer for WebRTC** | 7KB, mature, direct RTCPeerConnection. Mesh ≤6 participants, no SFU needed. |
| **Framer Motion + tailwindcss-animate** | FM for spring physics + list coordination. TWA for Radix data-state animations. Both, not one. |
| **@dnd-kit** | Modern, 18KB, tree-shakeable, excellent touch. react-beautiful-dnd is abandoned. |
| **Yjs for canvas** | CRDT conflict-free editing. y-prosemirror binds to Tiptap. Socket.IO transports updates. |
| **node-cron** | Minute-granularity scheduled messages. Same process, no Redis. Migrate to BullMQ if scaling beyond one server. |
| **Recharts** | React-native, declarative, good Tailwind integration. Only loaded on admin route (code-split). |
| **react-virtuoso** | firstItemIndex prepend trick, followOutput auto-scroll, GroupedVirtuoso sticky separators — all out of box. |
| **SQLite dev / PostgreSQL prod** | SQLite for zero-config local dev. Production uses tsvector for full-text search. |

---

## 11. Worker Domain Assignments

| Domain | Files Owned | Dependencies |
|--------|-------------|-------------|
| **Schema migration** | `prisma/schema.prisma` | Prisma: 9 new models + 1 field + 11 relations |
| **Socket types** | `shared/types/socket.ts` | All new event payload interfaces |
| **Socket: calls/huddles** | `server/socket-handlers/calls.ts`, `huddles.ts` | Prisma Call/CallParticipant |
| **Socket: polls** | `server/socket-handlers/polls.ts` | Prisma Poll/PollVote |
| **Socket: canvas** | `server/socket-handlers/canvas.ts` | Yjs binary relay |
| **Socket: read receipts** | `server/socket-handlers/read-receipts.ts` | Prisma ChannelMember |
| **Scheduler** | `server/scheduler.ts` | node-cron, Prisma ScheduledMessage |
| **Calls UI** | `calls/` | simple-peer, Framer Motion, Zustand |
| **Scheduling UI** | `scheduling/` | react-day-picker |
| **Polls UI** | `polls/` | Server actions, socket listeners |
| **Canvas UI** | `canvas/` | Yjs, y-prosemirror, Tiptap |
| **GIF search** | `gifs/` | Tenor API proxy route |
| **Link previews** | `link-previews/` | open-graph-scraper |
| **Workflows** | `workflows/` | Server actions, engine |
| **Admin dashboard** | `admin/`, `app/(app)/[slug]/admin/` | Recharts, role guards |
| **Bookmarks** | `bookmarks/` | Prisma Bookmark |
| **Channel categories** | `components/layout/ChannelCategories.tsx` | @dnd-kit |
| **Animations** | `shared/lib/animations.ts`, `components/animated/` | Framer Motion |
| **Themes** | `shared/lib/themes.ts`, `app/globals.css` | next-themes |
| **Keyboard shortcuts** | `components/layout/KeyboardShortcutsOverlay.tsx` | Radix Dialog |
| **Confetti** | `components/animated/ConfettiReaction.tsx` | canvas-confetti |
| **DND status** | `members/`, `presence/` | Prisma User.dndUntil |
| **Existing domains** | `auth/`, `workspaces/`, `channels/`, `messages/`, `members/`, etc. | Extend only |

---

## 12. Known Issues and Security Hardening

### 12.1 Active Bugs

| Bug | File | Severity | Description |
|-----|------|----------|-------------|
| **Multi-choice polls broken on client** | `polls/components/PollDisplay.tsx` | CRITICAL | Server correctly handles `poll.multiChoice` (upsert for multi, transaction for single), but client ignores it entirely. `getUserVote()` returns only the first vote found. `handleVote()` unconditionally removes previous votes, forcing single-choice behavior regardless of poll setting. UI renders radio-style selection for all polls. See `docs/research/critical_bugs_analysis.md` for full analysis and required fix. |

### 12.2 Security Hardening Completed

| Fix | File(s) | Description |
|-----|---------|-------------|
| **SSRF guard on link previews** | `link-previews/actions.ts`, `app/api/link-preview/route.ts` | `isSafeUrl()` blocks private/loopback/link-local IPs, non-http(s) protocols, and bare hostnames. Applied inside `fetchLinkPreview()` so both direct API calls and `fetchLinkPreviewsForMessage()` are protected. Route handler also validates protocol upfront. |
| **XSS sanitization in message rendering** | `messages/components/MessageItem.tsx` | `renderTiptapContent()` sanitizes link `href` values against a protocol allowlist (`https:`, `http:`, `mailto:`, `/`). All other protocols (including `javascript:`) are neutralized to `#`. |
| **Native browser dialogs replaced** | `messages/components/MessageActions.tsx`, `components/editor/EditorToolbar.tsx`, `workspaces/components/WorkspaceSettings.tsx` | All `window.confirm()` and `window.prompt()` calls replaced with Radix UI Dialog components. See Section 9.5 for the required pattern. |
