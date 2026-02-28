# Prisma Schema Analysis & Migration Plan

## Document Purpose
This document analyzes the existing Prisma schema and plans new model additions for the Slack-like collaboration platform. It identifies existing models, their relationships, and the new models required to support additional features.

---

## Current Schema Summary

### Existing Models (13 total)

#### Auth & User Management (4 models)
| Model | Purpose | Key Fields |
|-------|---------|-----------|
| **User** | Application user with NextAuth v5 | id, email, name, title, statusText, statusEmoji, timezone, createdAt, updatedAt |
| **Account** | OAuth provider account | id, userId, provider, access_token, refresh_token, expires_at |
| **Session** | Auth session | id, userId, sessionToken, expires |
| **VerificationToken** | Email verification | identifier, token, expires |

#### Workspace & Channels (3 models)
| Model | Purpose | Key Fields |
|-------|---------|-----------|
| **Workspace** | Organization container | id, name, slug, iconUrl, ownerId |
| **WorkspaceMember** | User membership in workspace | id, workspaceId, userId, role (OWNER\|ADMIN\|MEMBER), joinedAt |
| **Channel** | Chat channel | id, workspaceId, name, description, type (PUBLIC\|PRIVATE\|DM\|GROUP_DM), isArchived, createdById |

#### Channel Membership (1 model)
| Model | Purpose | Key Fields |
|-------|---------|-----------|
| **ChannelMember** | User channel membership | id, channelId, userId, lastReadAt, notifyPref (ALL\|MENTIONS\|NOTHING\|DEFAULT), joinedAt |

#### Messaging & Content (4 models)
| Model | Purpose | Key Fields |
|-------|---------|-----------|
| **Message** | Chat message | id, channelId, userId, contentJson, contentPlain, parentId, replyCount, isEdited, isDeleted, editedAt, deletedAt |
| **Reaction** | Emoji reaction on message | id, messageId, userId, emoji, createdAt |
| **FileAttachment** | File attached to message | id, messageId, userId, name, mimeType, size, url, width, height |
| **Pin** | Pinned message in channel | id, channelId, messageId (unique), pinnedById, pinnedAt |

#### User Features (2 models) ✅ ALREADY EXIST
| Model | Purpose | Key Fields |
|-------|---------|-----------|
| **Bookmark** | User-bookmarked message | id, messageId, userId, position (for ordering), createdAt |
| **CustomEmoji** | Workspace custom emoji | id, workspaceId, name, imageUrl, createdById |

#### Notifications (1 model)
| Model | Purpose | Key Fields |
|-------|---------|-----------|
| **Notification** | User notification | id, userId, actorId, type, payload (JSON), readAt, createdAt |

---

## Relationship Map

### User Relations (Primary Hub)
```
User
├── accounts: Account[] (NextAuth)
├── sessions: Session[] (NextAuth)
├── ownedWorkspaces: Workspace[] (WorkspaceOwner)
├── workspaceMemberships: WorkspaceMember[]
├── channelMemberships: ChannelMember[]
├── createdChannels: Channel[] (ChannelCreator)
├── messages: Message[]
├── reactions: Reaction[]
├── files: FileAttachment[]
├── pins: Pin[] (PinnedBy)
├── bookmarks: Bookmark[] ✅
├── notifications: Notification[]
├── sentNotifications: Notification[] (NotificationActor)
└── customEmojis: CustomEmoji[] (EmojiCreator) ✅
```

### Channel Relations
```
Channel
├── workspace: Workspace
├── createdBy: User (ChannelCreator)
├── members: ChannelMember[]
├── messages: Message[]
└── pins: Pin[]
```

### Message Relations
```
Message
├── channel: Channel
├── author: User
├── parent: Message? (ThreadReplies)
├── replies: Message[] (ThreadReplies)
├── reactions: Reaction[]
├── files: FileAttachment[]
├── pins: Pin[]
└── bookmarks: Bookmark[]
```

---

## Planned Model Additions

### Models To Create (7 new models required)

#### 1. **Poll** (NEW)
Requirement: Message.poll relation
- Purpose: Store poll data attached to messages
- Relations: pollId on Message (optional)
- Fields:
  ```prisma
  id: String @id @default(cuid())
  messageId: String @unique
  question: String
  options: String (JSON array of option strings)
  isActive: Boolean @default(true)
  endsAt: DateTime
  createdAt: DateTime @default(now())

  message: Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
  votes: PollVote[]
  ```

#### 2. **PollVote** (NEW)
Requirement: User.pollVotes relation
- Purpose: Track user votes on poll options
- Relations: pollId, userId
- Fields:
  ```prisma
  id: String @id @default(cuid())
  pollId: String
  userId: String
  option: String (index into Poll.options array)
  votedAt: DateTime @default(now())

  poll: Poll @relation(fields: [pollId], references: [id], onDelete: Cascade)
  user: User @relation("PollVotes", fields: [userId], references: [id], onDelete: Cascade)

  @@unique([pollId, userId, option])
  @@index([pollId])
  @@index([userId])
  ```

#### 3. **LinkPreview** (NEW)
Requirement: Message.linkPreviews relation
- Purpose: Store previews of links in messages
- Relations: messageId
- Fields:
  ```prisma
  id: String @id @default(cuid())
  messageId: String
  url: String
  title: String?
  description: String?
  imageUrl: String?
  domain: String
  createdAt: DateTime @default(now())

  message: Message @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@index([messageId])
  @@index([domain])
  ```

#### 4. **Canvas** (NEW)
Requirement: Channel.canvas and User.canvasVersions relations
- Purpose: Store collaborative canvas/whiteboard content
- Relations: channelId, createdById
- Fields:
  ```prisma
  id: String @id @default(cuid())
  channelId: String
  name: String
  contentJson: String (Tiptap-like JSON)
  createdById: String
  isActive: Boolean @default(true)
  createdAt: DateTime @default(now())
  updatedAt: DateTime @updatedAt

  channel: Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  createdBy: User @relation("CanvasVersions", fields: [createdById], references: [id])
  versions: CanvasVersion[]

  @@unique([channelId, name])
  @@index([channelId])
  ```

#### 5. **CanvasVersion** (NEW)
Requirement: User.canvasVersions relation (indirectly via Canvas)
- Purpose: Store version history of canvas edits
- Relations: canvasId, userId (editor)
- Fields:
  ```prisma
  id: String @id @default(cuid())
  canvasId: String
  userId: String
  contentJson: String
  changeDescription: String?
  createdAt: DateTime @default(now())

  canvas: Canvas @relation(fields: [canvasId], references: [id], onDelete: Cascade)
  editor: User @relation(fields: [userId], references: [id])

  @@index([canvasId, createdAt(sort: Desc)])
  @@index([userId])
  ```

#### 6. **Call** (NEW)
Requirement: Channel.callHistory and User.callsInitiated relations
- Purpose: Track voice/video calls
- Relations: channelId, initiatorId
- Fields:
  ```prisma
  id: String @id @default(cuid())
  channelId: String
  initiatorId: String
  startedAt: DateTime @default(now())
  endedAt: DateTime?
  duration: Int? (seconds)
  recordingUrl: String?

  channel: Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  initiator: User @relation("CallsInitiated", fields: [initiatorId], references: [id])
  participants: CallParticipant[]

  @@index([channelId, startedAt(sort: Desc)])
  @@index([initiatorId])
  ```

#### 7. **CallParticipant** (NEW - supporting model)
- Purpose: Track who participated in each call
- Relations: callId, userId
- Fields:
  ```prisma
  id: String @id @default(cuid())
  callId: String
  userId: String
  joinedAt: DateTime @default(now())
  leftAt: DateTime?

  call: Call @relation(fields: [callId], references: [id], onDelete: Cascade)
  user: User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([callId, userId])
  @@index([callId])
  @@index([userId])
  ```

#### 8. **ScheduledMessage** (NEW)
Requirement: User.scheduledMessages and Channel.scheduledMessages relations
- Purpose: Queue messages to be sent at a future time
- Relations: channelId, userId, originalMessageId (if from template)
- Fields:
  ```prisma
  id: String @id @default(cuid())
  channelId: String
  userId: String
  contentJson: String
  contentPlain: String
  scheduledFor: DateTime
  sentAt: DateTime?
  isCancelled: Boolean @default(false)
  createdAt: DateTime @default(now())

  channel: Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  user: User @relation("ScheduledMessages", fields: [userId], references: [id], onDelete: Cascade)

  @@index([scheduledFor])
  @@index([channelId])
  @@index([userId, sentAt])
  ```

#### 9. **ChannelCategory** (NEW - Optional)
Requirement: User.channelCategories relation
- Purpose: User-specific channel grouping/organization
- Relations: channelId, userId
- Fields:
  ```prisma
  id: String @id @default(cuid())
  channelId: String
  userId: String
  categoryName: String
  position: Int @default(0)

  channel: Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  user: User @relation("ChannelCategories", fields: [userId], references: [id], onDelete: Cascade)

  @@unique([channelId, userId])
  @@index([userId, position])
  @@index([channelId])
  ```

---

## Identified Overlaps & Already-Existing Models

### ✅ Bookmark - Already Exists (Lines 325-339)
- **Status**: FULLY IMPLEMENTED
- **Relations**: User.bookmarks → Bookmark[] (line 66 in User model)
- **No action needed** - this model is already in use
- Structure includes `position` field for custom ordering

### ✅ CustomEmoji - Already Exists (Lines 372-387)
- **Status**: FULLY IMPLEMENTED
- **Relations**:
  - Workspace.customEmojis → CustomEmoji[]
  - User.customEmojis → CustomEmoji[] (as "EmojiCreator")
- **No action needed** - this model is already in use
- Supports per-workspace custom emoji with creator tracking

---

## Updated User Model Relations (After Migration)

```prisma
model User {
  // ... existing fields ...

  // Existing relations (no changes)
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
  bookmarks Bookmark[] ✅ ALREADY EXISTS
  notifications Notification[]
  sentNotifications Notification[] @relation("NotificationActor")
  customEmojis CustomEmoji[] @relation("EmojiCreator") ✅ ALREADY EXISTS

  // New relations (to be added)
  pollVotes PollVote[] @relation("PollVotes") [NEW]
  canvasVersions CanvasVersion[] [NEW - indirect via Canvas]
  scheduledMessages ScheduledMessage[] @relation("ScheduledMessages") [NEW]
  callsInitiated Call[] @relation("CallsInitiated") [NEW]
  channelCategories ChannelCategory[] @relation("ChannelCategories") [NEW]
  callParticipant CallParticipant[]

  // Scalar field to add (for DND until timestamp)
  dndUntil DateTime? [NEW - simple field]
}
```

---

## Updated Channel Model Relations (After Migration)

```prisma
model Channel {
  // ... existing fields ...

  // Existing relations (no changes)
  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  createdBy User @relation("ChannelCreator", fields: [createdById], references: [id])
  members ChannelMember[]
  messages Message[]
  pins Pin[]

  // New relations (to be added)
  canvas Canvas? [NEW - optional one-to-one or many]
  callHistory Call[] @relation("ChannelCallHistory") [NEW]
  scheduledMessages ScheduledMessage[] @relation("ChannelScheduledMessages") [NEW]
}
```

---

## Updated Message Model Relations (After Migration)

```prisma
model Message {
  // ... existing fields ...

  // Existing relations (no changes)
  channel Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  author User @relation(fields: [userId], references: [id])
  parent Message? @relation("ThreadReplies", fields: [parentId], references: [id])
  replies Message[] @relation("ThreadReplies")
  reactions Reaction[]
  files FileAttachment[]
  pins Pin[]
  bookmarks Bookmark[]

  // New relations (to be added)
  poll Poll? [NEW - optional one-to-one]
  linkPreviews LinkPreview[] [NEW]
}
```

---

## Migration Strategy

### Phase 1: Add New Models (No Breaking Changes)
1. Add Poll model with PollVote relation
2. Add LinkPreview model
3. Add Canvas and CanvasVersion models
4. Add Call and CallParticipant models
5. Add ScheduledMessage model
6. Add ChannelCategory model

**Commands**:
```bash
# Regenerate Prisma client
npm run db:generate

# For development (SQLite)
npm run db:push

# For production (with migration)
npm run db:migrate -- --name "add_new_models"
```

### Phase 2: Add Relations to Existing Models
1. Add `dndUntil: DateTime?` scalar field to User
2. Add relations from User to new models
3. Add relations from Channel to new models
4. Add relations from Message to new models

**Commands**: Same as Phase 1

### Rollback Strategy
- All new models use `onDelete: Cascade` from their parent relations
- Removing new fields/models won't affect existing data
- Previous migration can be rolled back via `npm run db:migrate:resolve`

---

## Implementation Checklist

- [ ] Review and approve schema modifications
- [ ] Add all 8 new models to prisma/schema.prisma
- [ ] Add User.dndUntil field
- [ ] Add User relations to new models
- [ ] Add Channel relations to new models
- [ ] Add Message relations to new models
- [ ] Run `npm run db:generate` to regenerate Prisma client
- [ ] Run migrations (`npm run db:push` or `npm run db:migrate`)
- [ ] Update TypeScript enums in shared/types/index.ts if needed
- [ ] Test schema with sample data in development
- [ ] Document any new enum values added

---

## SQL Index Summary

New models include strategic indexes for:
- **Poll/PollVote**: Fast lookup by pollId and userId for vote prevention
- **LinkPreview**: Domain-based grouping for analytics
- **Canvas/CanvasVersion**: Chronological ordering and user tracking
- **Call/CallParticipant**: Recent calls and user participation history
- **ScheduledMessage**: Chronological scheduling queue and user tracking
- **ChannelCategory**: User-specific channel organization with ordering

---

## Notes for Implementation Workers

1. **Enum Values**: Check `shared/types/index.ts` for any new enum-like string values needed (e.g., if new notification types are added)
2. **Timestamps**: All new models follow the `createdAt`/`updatedAt` convention
3. **IDs**: All use `cuid()` for consistency with existing schema
4. **SQLite Limitations**: The schema targets SQLite for development. For production PostgreSQL:
   - Consider adding `@db.Text` annotations on large JSON fields
   - Add full-text search indexes if needed
5. **Soft Deletes**: Consider adding `isDeleted` and `deletedAt` fields to Poll, Canvas, and Call for audit trails
6. **Performance**: The index placement prioritizes query patterns for:
   - Displaying recent messages in a channel
   - User timeline views
   - Scheduled message execution queue
   - Call history
