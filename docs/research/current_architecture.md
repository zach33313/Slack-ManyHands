# Current Message Pipeline Architecture

## Overview

The message pipeline in this Slack clone is built on a modern React/Next.js stack with real-time capabilities via Socket.IO. The architecture separates concerns into:

1. **Composition** (creating messages)
2. **Storage** (database persistence)
3. **Distribution** (real-time sync via Socket.IO)
4. **Rendering** (virtualized display)

## Component Architecture

### Message Composer Flow

```
MessageComposer (Client)
├── SlackEditor (Tiptap v3 Editor)
│   ├── StarterKit (formatting extensions)
│   ├── CodeBlockLowlight (syntax highlighting)
│   ├── Mentions (user @mentions)
│   ├── ChannelMentions (#channel mentions)
│   ├── Emoji (shortcode support)
│   └── SlashCommands (/status, /away, /mute, etc.)
│
├── File Management
│   ├── Drag & drop detection
│   ├── File upload to /api/files
│   ├── Upload progress tracking
│   └── Attachment chips display
│
├── Socket.IO Events
│   ├── typing:start (on keydown)
│   ├── typing:stop (on idle/blur)
│   └── message:send (on Enter submit)
│
└── Server Actions
    └── sendMessage() [Server-side validation]
```

**File**: `messages/components/MessageComposer.tsx` (448 lines)

**Key Methods**:
- `handleSubmit(content, plainText)` - Validates and submits
- `uploadFile(pendingFile)` - Handles individual file uploads
- `emitTypingStart/Stop()` - Typing indicator management
- `handleSlashCommand(command)` - Command dispatch

**State**:
```typescript
[pendingFiles, setPendingFiles]        // Files being uploaded
[isDragOver, setIsDragOver]            // Drag-drop indicator
[isTyping, setIsTyping]                // Typing state
```

### Message List & Display

```
MessageList (Virtualized)
├── GroupedVirtuoso
│   ├── Date separators (sticky headers)
│   ├── Lazy loading on scroll-up
│   ├── Auto-scroll to bottom on new messages
│   └── Unread indicator line
│
├── Socket.IO Event Listeners
│   ├── message:new (new message in channel)
│   ├── message:updated (message edited)
│   ├── message:deleted (message removed)
│   ├── reaction:updated (emoji reactions changed)
│   └── thread:reply (new thread reply)
│
└── Message Items
    ├── Full Mode (avatar + name + timestamp)
    ├── Compact Mode (same author, <5 min)
    └── Deleted State (grayed out, replaced text)
```

**File**: `messages/components/MessageList.tsx` (356 lines)

**Key Methods**:
- `groupMessagesByDate()` - Groups by calendar date
- `loadInitialMessages()` - Fetches messages on mount
- `loadOlderMessages()` - Pagination on scroll-up
- `handleAtBottomStateChange()` - Tracks scroll position
- `scrollToBottom()` - Animated scroll to latest

**Virtuoso Configuration**:
```typescript
GroupedVirtuoso
  firstItemIndex={INITIAL_INDEX}           // 1,000,000 for prepending
  followOutput="smooth"                    // Auto-scroll on new messages
  atBottomStateChange={handleAtBottom}     // Track scroll position
  startReached={loadOlderMessages}         // Load on scroll-up
  atBottomThreshold={100}                  // Pixel threshold for "at bottom"
  overscan={200}                           // Buffer size
```

### Individual Message Rendering

```
MessageItem
├── Compact Mode (if previous message from same author, <5 min)
│   ├── Small timestamp on hover
│   ├── Content only (no avatar/name)
│   └── 5 min threshold
│
├── Full Mode (otherwise)
│   ├── Avatar with presence indicator
│   ├── Author name (clickable for profile)
│   ├── Timestamp (absolute time in tooltip)
│   ├── Message content (rich text)
│   ├── (edited) indicator
│   └── Profile card on hover
│
├── Content Rendering
│   ├── Tiptap JSON → HTML (custom renderTiptapContent)
│   ├── Text formatting (bold, italic, strike, code, links)
│   ├── Block elements (headings, lists, quotes, code blocks)
│   ├── Special nodes (mentions, emoji)
│   └── dangerouslySetInnerHTML (sanitized)
│
├── File Attachments
│   ├── Inline images (max-h-[300px], max-w-[400px])
│   ├── Document links (with extension badge)
│   └── Lazy loading
│
├── Reactions
│   ├── ReactionBar (emoji pills with counts)
│   ├── Toggle current user reaction
│   └── Add new reaction via picker
│
├── Thread Summary
│   ├── "N replies" link (if replyCount > 0)
│   ├── Opens ThreadPanel on click
│   └── Shown only in channel view (not thread view)
│
└── Hover Actions
    ├── MessageActions toolbar
    ├── Edit (own messages only)
    ├── Reply/Thread (all messages)
    └── More options menu
```

**File**: `messages/components/MessageItem.tsx` (585 lines)

**Key Methods**:
- `renderTiptapContent(content)` - Converts JSON to HTML
- `shouldCompact(message, previous)` - Determines display mode
- `handleStartEdit()` - Inline edit mode
- `handleSaveEdit()` - Emit edit via Socket.IO
- `handleOpenThread()` - Open thread panel

**Rendering Logic**:
```typescript
// Custom Tiptap JSON rendering
function renderNode(node: TiptapNode): string {
  if (node.type === 'text') {
    // Apply marks: bold, italic, strike, code, link, underline
    // Wrap in HTML tags
  } else if (node.type === 'paragraph') {
    // Render children + wrap in <p>
  } else if (node.type === 'codeBlock') {
    // Syntax highlight via lowlight
  } // ... more node types

  // Recursive: render children then apply parent tags
}
```

### Thread System

```
ThreadPanel (Right Sidebar)
├── Header
│   ├── "Thread" title
│   ├── Channel name
│   └── Close button
│
├── Parent Message
│   ├── Full MessageItem display
│   └── Separator line
│
├── Reply Count Divider
│   ├── "N replies" text
│   └── Visual line
│
├── Thread Replies List
│   ├── Not virtualized (simple scrollable div)
│   ├── Compact mode for same-author messages
│   ├── Auto-scroll to bottom on new reply
│   └── Load via GET /api/messages/[id]/threads
│
├── ThreadComposer
│   ├── Same as MessageComposer
│   ├── parentId set automatically
│   └── File uploads supported
│
└── Socket.IO Events
    ├── thread:reply (new reply in thread)
    └── Updates parent message's replyCount
```

**File**: `messages/components/ThreadPanel.tsx` (199 lines)

**State**:
```typescript
activeThreadId              // ID of open thread's parent message
threadMessages              // Replies in thread
threadLoading               // Loading state for replies
messagesByChannel           // To find parent message
```

## State Management

### Zustand Store (messages/store.ts)

```typescript
MessagesState {
  // Message data
  messagesByChannel: Record<string, MessageWithMeta[]>    // Grouped by channel
  loadingByChannel: Record<string, boolean>               // Per-channel loading
  hasMoreByChannel: Record<string, boolean>               // Pagination state

  // Thread state
  activeThreadId: string | null                           // Open thread parent ID
  threadMessages: MessageWithMeta[]                        // Replies in thread
  threadLoading: boolean

  // UI state
  unreadIndexByChannel: Record<string, number | null>     // First unread message
  isAtBottom: boolean                                      // Scroll position
  unseenCount: number                                      // Unseen while scrolled up

  // Actions
  setMessages()
  addMessage()
  updateMessage()
  deleteMessage()
  setReactions()
  setLoading()
  setHasMore()
  setActiveThread()
  setThreadMessages()
  addThreadMessage()
  setUnreadIndex()
  setIsAtBottom()
  incrementUnseen()
  resetUnseen()
  incrementReplyCount()
}
```

**Usage Pattern**:
```typescript
// Selectors are granular to optimize re-renders
const messages = useMessagesStore((s) => s.messagesByChannel[channelId] ?? []);
const addMessage = useMessagesStore((s) => s.addMessage);

// Actions return new state
addMessage(channelId, newMessage);
```

## Server-Side Message Flow

### sendMessage() Server Action

**File**: `messages/actions.ts` (lines 156-409)

**Flow**:
1. Authenticate user and verify channel membership
2. Normalize content (accept Tiptap JSON or plain text)
3. Extract plain text for search indexing
4. Validate parentId if thread reply
5. Validate file ownership
6. Create message in database
7. If thread reply: increment parent's replyCount
8. Fetch full message with all relations
9. Emit Socket.IO events:
   - `message:new` to channel room (if top-level)
   - `thread:reply` to channel room (if thread reply)
10. Create notifications:
    - @mentions → MENTION notification
    - DM channel → DM notification
    - Thread replies → THREAD_REPLY notification

**Notification Payload**:
```typescript
{
  userId: string              // Recipient
  actorId: string             // Sender
  type: NotificationType      // MENTION | DM | THREAD_REPLY
  payload: {
    messageId: string
    channelId: string
    workspaceId: string
    actorId: string
    preview: string           // First 100 chars
  }
}
```

### Message Editing & Deletion

**editMessage()**:
- Verify ownership
- Extract new plain text
- Set isEdited=true, editedAt=now
- Emit `message:updated`

**deleteMessage()**:
- Verify ownership OR admin role
- Soft delete (isDeleted=true, not removed)
- If thread reply: decrement parent's replyCount
- Emit `message:deleted`

### Reactions

**addReaction(messageId, emoji)**:
- Upsert reaction (create if not exists, no-op if already reacted)
- Fetch all reactions for message
- Group by emoji and count votes
- Emit `reaction:updated`

**removeReaction(messageId, emoji)**:
- Delete user's reaction for emoji
- Fetch remaining reactions
- Emit `reaction:updated`

## Socket.IO Real-Time Events

### Event Flow Diagram

```
Client A                          Server                       Client B

sends message
         │
         ├──────── message:send ──────────→
                                    │
                                    ├─ Validate & persist
                                    ├─ Fetch full message
                                    │
                                    ├──→ message:new ──────────→ receives + displays
                                    │                          updates store
                                    │                          increments unseen
                                    │
                                    ├──→ message:new ──────────→ (self, usually)
                                    └──→ notification:new ──────→ (if @mentioned)


types message
         │
         ├──────── typing:start ──────────→
                                    ├─ Broadcast to room
                                    │
                                    ├──────────────────────────→ shows "typing"
                                    │                          indicator


adds reaction
         │
         ├──────── message:react ────────→
                                    │
                                    ├─ Upsert in database
                                    ├─ Recalculate groups
                                    │
                                    ├──→ reaction:updated ──────→ updates reactions
                                    │                          in all client views
```

### Event Subscriptions (MessageList)

```typescript
socket.on('message:new', handleNewMessage)
  // Check: isOwnChannel? addMessage : incrementUnseen

socket.on('message:updated', handleUpdatedMessage)
  // Update message in store

socket.on('message:deleted', handleDeletedMessage)
  // Delete from store

socket.on('reaction:updated', handleReactionsUpdated)
  // Update reactions for specific message
```

## Database Schema (Relevant Parts)

```prisma
model Message {
  id                String          @id @default(cuid())
  channelId         String
  channel           Channel         @relation(fields: [channelId], references: [id])
  userId            String
  author            User            @relation(fields: [userId], references: [id])

  // Content
  contentJson       String          // Tiptap JSON as string
  contentPlain      String          // For search indexing

  // State
  isEdited          Boolean         @default(false)
  editedAt          DateTime?
  isDeleted         Boolean         @default(false)
  deletedAt         DateTime?

  // Metadata
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  // Files
  files             FileAttachment[]

  // Reactions
  reactions         Reaction[]

  // Threading
  parentId          String?
  parent            Message?        @relation("ThreadReplies", fields: [parentId], references: [id])
  replies           Message[]       @relation("ThreadReplies")
  replyCount        Int             @default(0)  // Denormalized

  // Pinning
  pin               Pin?
}

model Reaction {
  id                String          @id @default(cuid())
  messageId         String
  message           Message         @relation(fields: [messageId], references: [id], onDelete: Cascade)
  userId            String
  user              User            @relation(fields: [userId], references: [id])
  emoji             String
  createdAt         DateTime        @default(now())

  @@unique([userId, messageId, emoji])
  @@index([messageId])
}

model FileAttachment {
  id                String          @id @default(cuid())
  messageId         String
  message           Message         @relation(fields: [messageId], references: [id], onDelete: Cascade)
  userId            String
  name              String
  url               String          // S3 pre-signed URL
  size              Int
  mimeType          String
  width             Int?            // For images
  height            Int?
  createdAt         DateTime        @default(now())
}

model Pin {
  id                String          @id @default(cuid())
  messageId         String          @unique
  message           Message         @relation(fields: [messageId], references: [id], onDelete: Cascade)
  channelId         String
  channel           Channel         @relation(fields: [channelId], references: [id])
  pinnedById        String
  pinnedAt          DateTime        @default(now())
}
```

## Data Flow Examples

### Example 1: User Sends Message

```
1. User types "Hello @alice" and presses Enter

2. MessageComposer.handleSubmit() called
   - content: {type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: 'Hello '}, {type: 'mention', attrs: {id: 'alice-id', label: 'alice'}}]}
   - plainText: "Hello @alice"
   - fileIds: []

3. SlackEditor clears
   - editor.commands.clearContent()

4. Socket.IO emits
   - event: 'message:send'
   - payload: {channelId, content, parentId?, fileIds?}

5. Server receives message:send (via Socket.IO handler)
   - Calls sendMessage() server action

6. sendMessage() executes
   - Validates user in channel
   - Extracts plain text: "Hello @alice"
   - Extracts mentioned users: ["alice-id"]
   - Creates Message record
   - Returns messageWithMeta

7. Socket.IO broadcasts to channel room
   - event: 'message:new'
   - data: {id, content, author, files, reactions, replyCount, ...}

8. MessageList receives message:new event
   - addMessage(channelId, message)
   - If user at bottom: scrolls to bottom
   - If user scrolled up: increments unseenCount
   - Updates store → triggers re-render

9. Notification created
   - Emits 'notification:new' to alice's user room
   - Alice receives notification badge

10. UI Updates
    - Message appears in chat
    - Mention highlighted in blue
    - Unseen count badge shows if scrolled up
    - Typing indicator hides
```

### Example 2: User Clicks Reaction Button

```
1. User hovers message, clicks "+" in ReactionBar
   - ReactionPicker opens

2. User selects "👍" emoji

3. ReactionBar.addReaction('👍') called
   - socket.emit('message:react', {messageId, emoji: '👍'})

4. Server receives message:react
   - Calls addReaction(messageId, emoji)

5. addReaction() executes
   - Upserts reaction (user-message-emoji unique)
   - Fetches all reactions for message
   - Groups by emoji: [{emoji: '👍', count: 2, userIds: ['user1', 'user2']}, ...]
   - Emits 'reaction:updated'

6. Socket.IO broadcasts to channel
   - event: 'reaction:updated'
   - data: {messageId, reactions: [{emoji: '👍', count: 2, userIds: [...]}, ...]}

7. MessageList receives reaction:updated
   - setReactions(channelId, messageId, reactions)
   - Store updates → MessageItem re-renders

8. UI Updates
    - Reaction pill appears or count increments
    - Pill is highlighted (user has reacted)
    - Other users see updated count
```

## Key Performance Optimizations

### 1. Virtualization (react-virtuoso)

- **Only renders visible items** (plus overscan buffer)
- **Variable height items** supported
- **Prepending** via firstItemIndex trick (large offset, then decrement)
- **Sticky headers** for date separators

### 2. Memoization

- MessageItem memoized with `React.memo`
- Callbacks created with `useCallback`
- Objects created with `useMemo`

### 3. Socket.IO Debouncing

```typescript
// Typing indicator: debounce to reduce events
const typingTimeout = useRef(null);
typingTimeout.current = setTimeout(() => {
  socket.emit('typing:stop');
}, 3000);  // Stop after 3 seconds of inactivity
```

### 4. Image Loading

- `loading="lazy"` on all images
- Pre-calculate dimensions to prevent layout shift
- Thumbnail compression via sharp (on server)

### 5. State Granularity

- Store selectors are specific (not global reselection)
- Only subscribe to needed fields
- Per-channel state isolation

## Common Issues & Solutions

### Issue: Messages appear twice

**Cause**: Socket.IO event + Server Action response both updating
**Solution**: Server Action doesn't update local state, let Socket.IO handle it

### Issue: Reaction counts wrong

**Cause**: Stale closure in event handler
**Solution**: Use store selectors, not component state

### Issue: Thread panel shows wrong replies

**Cause**: threadMessages not cleared when switching threads
**Solution**: Always fetch fresh from API when activeThreadId changes

### Issue: Scroll jumps when prepending messages

**Cause**: Virtuoso firstItemIndex not adjusted
**Solution**: Decrement firstItemIndex by number of prepended messages

## Testing Strategy

### Unit Tests
- RenderTiptapContent function
- shouldCompact logic
- Notification creation rules

### Integration Tests
- Send message → appears in list
- Add reaction → count updates
- Edit message → content changes

### E2E Tests
- User flow: compose → send → react → reply

## Suggested Improvements

1. **Debounce reactions** - Batch reaction updates
2. **Optimize rendering** - Virtualize thread replies too
3. **Add ephemeral messages** - Messages that disappear after time
4. **Message formatting toolbar** - WYSIWYG editor
5. **Search messages** - Full-text search with Prisma
6. **Message pinning UI** - Show pinned messages panel
7. **Emoji picker** - Dedicated picker in composer
8. **Message reactions count** - Show who reacted via tooltip

---

**Next Steps**: See `message_pipeline.md` for detailed feature implementation recommendations.
