# Complete Prisma Model Definitions for Implementation

## Overview
This document contains the exact Prisma model definitions for all 8 new models (plus CanvasVersion), with proper syntax, indexes, and relationships ready to copy into `prisma/schema.prisma`.

> **For Implementation**: Copy model blocks directly into prisma/schema.prisma, then run:
> ```bash
> npm run db:generate && npm run db:push
> ```

---

## New Models - Copy-Paste Ready

### 1. Poll Model

```prisma
// ---------------------------------------------------------------------------
// Polls
// ---------------------------------------------------------------------------

model Poll {
  id        String @id @default(cuid())
  messageId String @unique
  question  String
  options   String // JSON array of option strings: ["Option 1", "Option 2", ...]
  isActive  Boolean @default(true)
  endsAt    DateTime
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
  votes   PollVote[]

  @@index([messageId])
  @@index([isActive, endsAt])
  @@map("polls")
}
```

### 2. PollVote Model

```prisma
// PollVote Relation (PollVote -> User -> User.pollVotes)

model PollVote {
  id       String @id @default(cuid())
  pollId   String
  userId   String
  option   String // Selected option value from Poll.options
  votedAt  DateTime @default(now())

  poll Poll @relation(fields: [pollId], references: [id], onDelete: Cascade)
  user User @relation("PollVotes", fields: [userId], references: [id], onDelete: Cascade)

  /// A user can only vote once per option per poll
  @@unique([pollId, userId, option])
  @@index([pollId])
  @@index([userId])
  @@map("poll_votes")
}
```

### 3. LinkPreview Model

```prisma
// ---------------------------------------------------------------------------
// Link Previews
// ---------------------------------------------------------------------------

model LinkPreview {
  id          String @id @default(cuid())
  messageId   String
  url         String
  title       String?
  description String?
  imageUrl    String?
  domain      String
  createdAt   DateTime @default(now())

  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@index([messageId])
  @@index([domain])
  @@map("link_previews")
}
```

### 4. Canvas Model

```prisma
// ---------------------------------------------------------------------------
// Canvas (Whiteboard/Collaborative Documents)
// ---------------------------------------------------------------------------

model Canvas {
  id        String @id @default(cuid())
  channelId String
  name      String
  contentJson String // Tiptap-like JSON structure for collaborative editing
  createdById String
  isActive  Boolean @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  channel   Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  createdBy User    @relation("CanvasVersions", fields: [createdById], references: [id])
  versions  CanvasVersion[]

  @@unique([channelId, name])
  @@index([channelId])
  @@index([createdById])
  @@map("canvas")
}
```

### 5. CanvasVersion Model

```prisma
model CanvasVersion {
  id                  String @id @default(cuid())
  canvasId            String
  userId              String
  contentJson         String // Full content at this version
  changeDescription   String? // User-provided description of changes
  createdAt           DateTime @default(now())

  canvas Canvas @relation(fields: [canvasId], references: [id], onDelete: Cascade)
  editor User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([canvasId, createdAt(sort: Desc)])
  @@index([userId])
  @@map("canvas_versions")
}
```

### 6. Call Model

```prisma
// ---------------------------------------------------------------------------
// Voice/Video Calls
// ---------------------------------------------------------------------------

model Call {
  id           String @id @default(cuid())
  channelId    String
  initiatorId  String
  startedAt    DateTime @default(now())
  endedAt      DateTime?
  duration     Int? // Duration in seconds
  recordingUrl String? // URL to call recording if available
  createdAt    DateTime @default(now())

  channel      Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  initiator    User    @relation("CallsInitiated", fields: [initiatorId], references: [id])
  participants CallParticipant[]

  @@index([channelId, startedAt(sort: Desc)])
  @@index([initiatorId])
  @@map("calls")
}
```

### 7. CallParticipant Model

```prisma
model CallParticipant {
  id      String @id @default(cuid())
  callId  String
  userId  String
  joinedAt DateTime @default(now())
  leftAt  DateTime?

  call Call @relation(fields: [callId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([callId, userId])
  @@index([callId])
  @@index([userId])
  @@map("call_participants")
}
```

### 8. ScheduledMessage Model

```prisma
// ---------------------------------------------------------------------------
// Scheduled Messages
// ---------------------------------------------------------------------------

model ScheduledMessage {
  id           String @id @default(cuid())
  channelId    String
  userId       String
  contentJson  String // Tiptap JSON
  contentPlain String // Plain text for preview/search
  scheduledFor DateTime // When to send
  sentAt       DateTime? // When actually sent (null if not yet sent)
  isCancelled  Boolean @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  channel Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  user    User    @relation("ScheduledMessages", fields: [userId], references: [id], onDelete: Cascade)

  @@index([scheduledFor, sentAt]) // For job queue processing
  @@index([channelId])
  @@index([userId])
  @@map("scheduled_messages")
}
```

### 9. ChannelCategory Model

```prisma
// ---------------------------------------------------------------------------
// Channel Categories (User-specific organization)
// ---------------------------------------------------------------------------

model ChannelCategory {
  id           String @id @default(cuid())
  channelId    String
  userId       String
  categoryName String
  position     Int @default(0) // For ordering categories
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  channel Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  user    User    @relation("ChannelCategories", fields: [userId], references: [id], onDelete: Cascade)

  @@unique([channelId, userId])
  @@index([userId, position])
  @@index([channelId])
  @@map("channel_categories")
}
```

---

## User Model Updates

Add these relations to the existing User model (around line 56-69):

```prisma
model User {
  // ... existing fields ...

  // Existing relations (KEEP UNCHANGED)
  accounts Account[]
  sessions Session[]
  ownedWorkspaces Workspace[] @relation("WorkspaceOwner")
  workspaceMemberships WorkspaceMember[]
  channelMemberships ChannelMember[]
  createdChannels Channel[] @relation("ChannelCreator")
  messages Message[]
  reactions Reaction[]
  files FileAttachment[]
  pins Pin[] @relation("PinnedBy")
  bookmarks Bookmark[]
  notifications Notification[]
  sentNotifications Notification[] @relation("NotificationActor")
  customEmojis CustomEmoji[] @relation("EmojiCreator")

  // NEW: Add these relations
  pollVotes PollVote[] @relation("PollVotes")
  canvasVersions CanvasVersion[] // Tracks canvas edits user made
  scheduledMessages ScheduledMessage[] @relation("ScheduledMessages")
  callsInitiated Call[] @relation("CallsInitiated")
  channelCategories ChannelCategory[] @relation("ChannelCategories")
  callParticipant CallParticipant[]

  // NEW: Add this scalar field for Do Not Disturb
  dndUntil DateTime?
}
```

---

## Channel Model Updates

Add these relations to the existing Channel model (around line 180-184):

```prisma
model Channel {
  // ... existing fields ...

  // Existing relations (KEEP UNCHANGED)
  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  createdBy User @relation("ChannelCreator", fields: [createdById], references: [id])
  members ChannelMember[]
  messages Message[]
  pins Pin[]

  // NEW: Add these relations
  canvas Canvas? // Optional: canvas per channel or multiple canvases
  callHistory Call[]
  scheduledMessages ScheduledMessage[]
}
```

---

## Message Model Updates

Add these relations to the existing Message model (around line 243-246):

```prisma
model Message {
  // ... existing fields ...

  // Existing relations (KEEP UNCHANGED)
  channel Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  author User @relation(fields: [userId], references: [id])
  parent Message? @relation("ThreadReplies", fields: [parentId], references: [id])
  replies Message[] @relation("ThreadReplies")
  reactions Reaction[]
  files FileAttachment[]
  pins Pin[]
  bookmarks Bookmark[]

  // NEW: Add these relations
  poll Poll?
  linkPreviews LinkPreview[]
}
```

---

## Step-by-Step Implementation Guide

### 1. Add New Models Section
Add all model definitions (1-9 above) to `prisma/schema.prisma`. Recommended location: after the Notifications model (around line 367) and before CustomEmoji model.

### 2. Update Existing Models
Modify User, Channel, and Message models to add new relations and fields.

### 3. Verify Syntax
```bash
# Check for syntax errors (this regenerates the client)
npm run db:generate
```

### 4. Apply to Database
Choose one:

**For Development (SQLite)**:
```bash
npm run db:push
```

**For Production (with migration file)**:
```bash
npm run db:migrate -- --name "add_polls_calls_canvas_etc"
```

### 5. Verify Success
```bash
# Prisma client should be regenerated
ls node_modules/.prisma/client/

# Test database connection
npm run db:info
```

---

## Migration Safety Notes

1. **Backward Compatible**: All new models are additions; no existing fields/tables are modified
2. **Can be rolled back**: Each migration can be reversed if needed
3. **No data loss**: Cascade deletes are intentional (if channel deleted, its calls/canvas are too)
4. **Indexes**: All critical query paths have indexes for performance

---

## Post-Implementation Checklist

After running migrations:

- [ ] Regenerate Prisma client: `npm run db:generate`
- [ ] Verify database schema: `npm run db:info`
- [ ] Check relations in Prisma Studio: `npm run db:studio`
- [ ] Update API routes if needed (routes/polls.ts, routes/calls.ts, etc.)
- [ ] Add TypeScript type definitions if using strict typing
- [ ] Update shared/types/index.ts with any new enums (if needed)
- [ ] Test CRUD operations for new models
- [ ] Update API documentation

---

## File Locations
- **Schema**: `prisma/schema.prisma`
- **Generated client**: `node_modules/.prisma/client/`
- **Migrations**: `prisma/migrations/`
- **Development database**: `prisma/volume_anomaly.db` (SQLite)

---

## Questions Before Implementation?

1. **Canvas**: Should Channel have one Canvas or many? (Currently optional one-to-one)
2. **Soft Deletes**: Do Call, Canvas, Poll need isDeleted + deletedAt for audit trails?
3. **Attachments on Canvas**: Should CanvasVersion track file attachments separately?
4. **Call Recording**: Is recordingUrl sufficient, or need separate video storage model?
