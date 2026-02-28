# Prisma Schema - Relationship Diagrams

## Overview of All Model Relationships

This document provides visual representations of the complete schema, including new models.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION LAYER                     │
│  User ←→ Account (OAuth) | Session | VerificationToken     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                 WORKSPACE & COLLABORATION                   │
│  Workspace ←→ WorkspaceMember, Channel, CustomEmoji        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              MESSAGING & CONTENT (Core Features)            │
│  Channel ←→ ChannelMember, Message, Pin, Canvas            │
│  Message ←→ Reaction, FileAttachment, Bookmark, Poll       │
│  Message ←→ LinkPreview, (ThreadReplies)                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│            NEW FEATURES (This Migration)                    │
│  Polling: Poll ←→ PollVote (User interaction)              │
│  Calls: Call ←→ CallParticipant (Voice/Video)             │
│  Canvas: Canvas ←→ CanvasVersion (Collaborative editing)   │
│  Scheduling: ScheduledMessage (Message queue)              │
│  Organization: ChannelCategory (User-scoped grouping)      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     USER FEATURES                           │
│  Notification, CustomEmoji, Bookmark, DND (dndUntil)       │
└─────────────────────────────────────────────────────────────┘
```

---

## Detailed Entity Relationship Diagram

### User-Centric View (User as Hub)

```
                           ┌──────────────┐
                           │    User      │
                           │  (id, email) │
                           └──────────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            │                     │                     │
        ┌───▼────┐          ┌────▼────┐          ┌────▼────┐
        │Account │          │ Session │          │Verif.   │
        │(OAuth) │          │(Auth)   │          │Token    │
        └────────┘          └─────────┘          └─────────┘
            │                                           │
            └───────────────────────────────────────────┘
                         Relationships:
        ┌────────────────────────────────────────────────┐
        │ Hierarchy: User owns/creates                   │
        │ ├─ ownedWorkspaces: Workspace[]              │
        │ ├─ createdChannels: Channel[]                │
        │ └─ customEmojis: CustomEmoji[]               │
        ├─ Membership: User participates in             │
        │ ├─ workspaceMemberships: WorkspaceMember[]   │
        │ ├─ channelMemberships: ChannelMember[]       │
        │ └─ messages: Message[]                       │
        ├─ Interactions: User generates                 │
        │ ├─ reactions: Reaction[]                     │
        │ ├─ files: FileAttachment[]                   │
        │ ├─ pins: Pin[] (PinnedBy)                    │
        │ ├─ bookmarks: Bookmark[]                     │
        │ ├─ notifications: Notification[]             │
        │ └─ sentNotifications: Notification[]         │
        ├─ NEW: Polling                                 │
        │ └─ pollVotes: PollVote[]                     │
        ├─ NEW: Canvas Editing                         │
        │ └─ canvasVersions: CanvasVersion[]           │
        ├─ NEW: Scheduling                             │
        │ └─ scheduledMessages: ScheduledMessage[]     │
        ├─ NEW: Calls                                   │
        │ ├─ callsInitiated: Call[]                    │
        │ └─ callParticipant: CallParticipant[]        │
        ├─ NEW: Organization                           │
        │ └─ channelCategories: ChannelCategory[]      │
        └─ NEW: Status                                  │
          └─ dndUntil: DateTime?                      │
        └────────────────────────────────────────────────┘
```

### Channel-Centric View

```
                        ┌──────────────┐
                        │   Channel    │
                        │(id, name)    │
                        └──────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
    ┌────▼──────┐      ┌─────▼─────┐      ┌─────▼──────┐
    │Workspace  │      │ChannelMember│   │CreatedBy   │
    │(container)│      │(membership)  │   │(User ref)  │
    └───────────┘      └──────────────┘    └────────────┘
         │
         │ Messages & Content
    ┌────▼──────────────────────────────────┐
    │ ├─ messages: Message[]                 │
    │ │   ├─ reactions: Reaction[]           │
    │ │   ├─ files: FileAttachment[]         │
    │ │   ├─ bookmarks: Bookmark[]           │
    │ │   ├─ NEW: poll: Poll?                │
    │ │   └─ NEW: linkPreviews: LinkPreview[]│
    │ ├─ pins: Pin[]                        │
    │ └─ NEW: canvas: Canvas?               │
    │     └─ versions: CanvasVersion[]      │
    └───────────────────────────────────────┘
         │
         │ NEW Features
    ┌────▼──────────────────────────────────┐
    │ ├─ callHistory: Call[]                │
    │ │   └─ participants: CallParticipant[]│
    │ ├─ scheduledMessages: ScheduledMessage[]
    │ └─ (Categories assigned by users)     │
    └───────────────────────────────────────┘
```

### Message-Centric View

```
                           ┌──────────────┐
                           │   Message    │
                           │(id, content) │
                           └──────────────┘
                                  │
      ┌───────────────────────────┼───────────────────────────┐
      │                           │                           │
  ┌───▼────┐              ┌──────▼─────┐            ┌────────▼───┐
  │Channel │              │Author(User)│            │Parent Msg  │
  │(parent)│              │             │            │(threading) │
  └────────┘              └─────────────┘            └────────────┘
      │
      │ Interactions
  ┌───▼──────────────────────────────────┐
  │ ├─ reactions: Reaction[]             │
  │ ├─ files: FileAttachment[]           │
  │ ├─ pins: Pin[]                       │
  │ ├─ bookmarks: Bookmark[]             │
  │ └─ replies: Message[] (threads)      │
  └─────────────────────────────────────┘
      │
      │ NEW Features
  ┌───▼──────────────────────────────────┐
  │ ├─ poll: Poll?                       │
  │ │   └─ votes: PollVote[]            │
  │ └─ linkPreviews: LinkPreview[]      │
  └─────────────────────────────────────┘
```

---

## New Model Relationship Trees

### Poll & Voting

```
Message (1)
  └─ poll: Poll? (1)
      └─ votes: PollVote[] (Many)
          └─ user: User (Many)

User (1)
  └─ pollVotes: PollVote[] (Many)
      └─ poll: Poll (Many)
```

**Pattern**: One poll per message, users can vote once per option.

### Calls & Participants

```
Channel (1)
  └─ callHistory: Call[] (Many)
      └─ participants: CallParticipant[] (Many)
          └─ user: User (Many)

User
  ├─ callsInitiated: Call[] (Many, via initiatorId)
  └─ callParticipant: CallParticipant[] (Many)
      └─ call: Call (Many)
```

**Pattern**: Users initiate calls in channels, other users join as participants.

### Canvas & Versions

```
Channel (1)
  └─ canvas: Canvas? (1)
      └─ versions: CanvasVersion[] (Many)
          └─ editor: User (Many)

User
  ├─ canvasVersions: CanvasVersion[] (Many)
  └─ Canvas.createdBy: Canvas[] (Many, via createdById)
```

**Pattern**: One canvas per channel (optional), editors create versions over time.

### Scheduled Messages

```
Channel (1)
  └─ scheduledMessages: ScheduledMessage[] (Many)
      └─ user: User (Many)

User (1)
  └─ scheduledMessages: ScheduledMessage[] (Many)
      └─ channel: Channel (Many)
```

**Pattern**: Messages queued for future delivery in channels.

### Channel Categories

```
User (1)
  └─ channelCategories: ChannelCategory[] (Many)
      └─ channel: Channel (Many)

Channel (1)
  └─ (Used by ChannelCategory)
      └─ users: User[] (Many, via ChannelCategory)
```

**Pattern**: Users organize channels into categories (e.g., "Projects", "Social").

### Link Previews

```
Message (1)
  └─ linkPreviews: LinkPreview[] (Many)
      └─ (Contains URL metadata)

(No User relation - system-generated)
```

**Pattern**: Message contains multiple links, each has preview data.

---

## Database Cardinality Summary

### One-to-One Relationships
- Message ↔ Poll (optional)
- Channel ↔ Canvas (optional)

### One-to-Many Relationships
- User ↔ Message, Reaction, FileAttachment, etc.
- Channel ↔ Message, Pin, Call, ScheduledMessage
- Message ↔ LinkPreview, Reaction, FileAttachment
- Poll ↔ PollVote
- Canvas ↔ CanvasVersion
- Call ↔ CallParticipant

### Many-to-Many Relationships (via junction tables)
- User ↔ Workspace (via WorkspaceMember)
- User ↔ Channel (via ChannelMember)
- User ↔ Poll (via PollVote)
- User ↔ Call (via CallParticipant)
- User ↔ Channel (via ChannelCategory)

---

## Data Flow Diagrams

### Poll Flow

```
User votes on Poll
    │
    ├─ Message contains Poll
    ├─ Poll has multiple options
    └─ User creates PollVote
        └─ PollVote records: pollId + userId + option
            └─ App can tally votes by option
            └─ Prevent duplicate votes (unique constraint)
```

### Call Flow

```
User initiates Call in Channel
    │
    ├─ Call created with initiatorId + channelId
    ├─ Other Users join Call
    │   └─ Each creates CallParticipant record
    ├─ Call ends (endedAt set)
    ├─ Duration calculated
    └─ Recording stored (if applicable)
```

### Canvas Collaboration Flow

```
Channel contains Canvas
    │
    ├─ User edits Canvas
    │   └─ Creates CanvasVersion (change snapshot)
    ├─ Other Users can see version history
    │   └─ Query CanvasVersion ordered by createdAt DESC
    └─ Track who made each change (editor = User)
```

### Message Scheduling Flow

```
User creates ScheduledMessage
    │
    ├─ contentJson + contentPlain stored
    ├─ scheduledFor = timestamp
    ├─ Scheduled for future delivery
    │
    ├─ At scheduled time:
    │   ├─ Job queue processes ScheduledMessage
    │   ├─ Creates actual Message in Channel
    │   └─ Sets sentAt timestamp
    │
    └─ User can cancel before sentAt
        └─ Set isCancelled = true
```

---

## Index Strategy

### Query Patterns & Indexes

| Query Pattern | Model | Index | Purpose |
|---------------|-------|-------|---------|
| Get user's polls | PollVote | `[userId]` | User's voting history |
| Get poll votes | PollVote | `[pollId]` | Tally votes by option |
| Process scheduled msgs | ScheduledMessage | `[scheduledFor, sentAt]` | Job queue processing |
| User's scheduled msgs | ScheduledMessage | `[userId]` | List sent/pending |
| Recent calls | Call | `[channelId, startedAt DESC]` | Channel call history |
| Recent messages | Message | `[channelId, createdAt DESC]` | Channel timeline |
| Canvas versions | CanvasVersion | `[canvasId, createdAt DESC]` | Version history |
| Call participants | CallParticipant | `[callId]` | Who joined call |

---

## Key Constraints

### Unique Constraints
- `User.email` - No duplicate emails
- `Workspace.slug` - Unique workspace identifier
- `Workspace.CustomEmoji: [workspaceId, name]` - Unique emoji per workspace
- `Channel: [workspaceId, name]` - Unique channel per workspace
- `ChannelMember: [channelId, userId]` - User in channel once
- `Reaction: [userId, messageId, emoji]` - One emoji per user per message
- `Bookmark: [messageId, userId]` - User bookmarks message once
- **NEW** `Poll: messageId` - One poll per message
- **NEW** `PollVote: [pollId, userId, option]` - Vote once per option
- **NEW** `CallParticipant: [callId, userId]` - User in call once
- **NEW** `ChannelCategory: [channelId, userId]` - User categorizes channel once
- **NEW** `Canvas: [channelId, name]` - Unique canvas per channel

### Cascade Delete Rules
All relations except some User references use `onDelete: Cascade`, meaning:
- Delete Channel → Deletes all Messages, Calls, ScheduledMessages
- Delete Message → Deletes Poll, Reactions, Files, Bookmarks, LinkPreviews
- Delete User → Deletes PollVotes, CallParticipants (soft via SetNull where appropriate)

---

## Migration Validation Checklist

After running migrations, verify these relationships exist:

**User Relations** (add 6)
- [ ] User.pollVotes
- [ ] User.canvasVersions
- [ ] User.scheduledMessages
- [ ] User.callsInitiated
- [ ] User.channelCategories
- [ ] User.callParticipant

**Channel Relations** (add 3)
- [ ] Channel.canvas
- [ ] Channel.callHistory
- [ ] Channel.scheduledMessages

**Message Relations** (add 2)
- [ ] Message.poll
- [ ] Message.linkPreviews

**New Models** (add 9)
- [ ] Poll with PollVote[]
- [ ] PollVote with poll/user
- [ ] LinkPreview with message
- [ ] Canvas with versions/channel/createdBy
- [ ] CanvasVersion with canvas/editor
- [ ] Call with participants/channel/initiator
- [ ] CallParticipant with call/user
- [ ] ScheduledMessage with channel/user
- [ ] ChannelCategory with channel/user

**New Fields** (add 1)
- [ ] User.dndUntil (DateTime?)

---

## Performance Considerations

### High-Frequency Queries (need indexes)
- `Message.findMany(where: { channelId, createdAt })` ✓ Indexed
- `ScheduledMessage.findMany(where: { scheduledFor, sentAt })` ✓ Indexed
- `CanvasVersion.findMany(where: { canvasId }, orderBy: { createdAt })` ✓ Indexed
- `Call.findMany(where: { channelId }, orderBy: { startedAt })` ✓ Indexed

### Potential Bottlenecks
- PollVote count tallying (may need aggregation in app layer)
- Canvas version history querying (consider pagination)
- CallParticipant list fetching (expect 2-20 participants per call)

---

## Related Files
- `schema_analysis.md` - Detailed model descriptions
- `prisma_model_definitions.md` - Exact Prisma syntax
- `migration_guide.md` - Step-by-step migration
- `prisma/schema.prisma` - Source of truth after migration
