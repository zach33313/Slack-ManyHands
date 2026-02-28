# Prisma Schema Migration Guide

## Quick Summary
- **Total changes**: 3 existing models modified + 9 new models added
- **Breaking changes**: None (backward compatible)
- **Effort**: ~30 minutes
- **Risk level**: Low (all changes are additive)

---

## Change 1: User Model - ADD Relations and Field

### Location: `prisma/schema.prisma` Lines 36-72

### Current Code (Lines 54-69)
```prisma
  // Auth.js relations
  accounts Account[]
  sessions Session[]

  // Domain relations
  ownedWorkspaces      Workspace[]       @relation("WorkspaceOwner")
  workspaceMemberships WorkspaceMember[]
  channelMemberships   ChannelMember[]
  createdChannels      Channel[]         @relation("ChannelCreator")
  messages             Message[]
  reactions            Reaction[]
  files                FileAttachment[]
  pins                 Pin[]             @relation("PinnedBy")
  bookmarks            Bookmark[]
  notifications        Notification[]
  sentNotifications    Notification[]    @relation("NotificationActor")
  customEmojis         CustomEmoji[]     @relation("EmojiCreator")

  @@map("users")
```

### Updated Code (ADD LINES)
```prisma
  // Auth.js relations
  accounts Account[]
  sessions Session[]

  // Domain relations
  ownedWorkspaces      Workspace[]       @relation("WorkspaceOwner")
  workspaceMemberships WorkspaceMember[]
  channelMemberships   ChannelMember[]
  createdChannels      Channel[]         @relation("ChannelCreator")
  messages             Message[]
  reactions            Reaction[]
  files                FileAttachment[]
  pins                 Pin[]             @relation("PinnedBy")
  bookmarks            Bookmark[]
  notifications        Notification[]
  sentNotifications    Notification[]    @relation("NotificationActor")
  customEmojis         CustomEmoji[]     @relation("EmojiCreator")

  // NEW FEATURE RELATIONS (ADD THESE)
  pollVotes            PollVote[]        @relation("PollVotes")
  canvasVersions       CanvasVersion[]
  scheduledMessages    ScheduledMessage[] @relation("ScheduledMessages")
  callsInitiated       Call[]            @relation("CallsInitiated")
  channelCategories    ChannelCategory[] @relation("ChannelCategories")
  callParticipant      CallParticipant[]

  // NEW SCALAR FIELD (ADD THIS)
  dndUntil             DateTime?

  @@map("users")
}
```

**Action**: Insert the 7 new lines before the closing `@@map("users")` line.

---

## Change 2: Channel Model - ADD Relations

### Location: `prisma/schema.prisma` Lines 168-189

### Current Code
```prisma
model Channel {
  id          String  @id @default(cuid())
  workspaceId String
  name        String
  description String?
  type        String  @default("PUBLIC")
  isArchived  Boolean @default(false)
  createdById String

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  workspace Workspace       @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  createdBy User            @relation("ChannelCreator", fields: [createdById], references: [id])
  members   ChannelMember[]
  messages  Message[]
  pins      Pin[]

  @@unique([workspaceId, name])
  @@index([workspaceId])
  @@map("channels")
}
```

### Updated Code (ADD LINES)
```prisma
model Channel {
  id          String  @id @default(cuid())
  workspaceId String
  name        String
  description String?
  type        String  @default("PUBLIC")
  isArchived  Boolean @default(false)
  createdById String

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  workspace         Workspace       @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  createdBy         User            @relation("ChannelCreator", fields: [createdById], references: [id])
  members           ChannelMember[]
  messages          Message[]
  pins              Pin[]

  // NEW FEATURE RELATIONS (ADD THESE)
  canvas            Canvas?
  callHistory       Call[]
  scheduledMessages ScheduledMessage[]

  @@unique([workspaceId, name])
  @@index([workspaceId])
  @@map("channels")
}
```

**Action**: Insert the 3 new relation lines before the closing `@@` lines.

---

## Change 3: Message Model - ADD Relations

### Location: `prisma/schema.prisma` Lines 215-253

### Current Code
```prisma
  channel  Channel   @relation(fields: [channelId], references: [id], onDelete: Cascade)
  author   User      @relation(fields: [userId], references: [id])
  parent   Message?  @relation("ThreadReplies", fields: [parentId], references: [id])
  replies  Message[] @relation("ThreadReplies")

  reactions Reaction[]
  files     FileAttachment[]
  pins      Pin[]
  bookmarks Bookmark[]

  @@index([channelId, createdAt(sort: Desc)])
  @@index([parentId])
  @@index([userId])
  @@map("messages")
}
```

### Updated Code (ADD LINES)
```prisma
  channel  Channel   @relation(fields: [channelId], references: [id], onDelete: Cascade)
  author   User      @relation(fields: [userId], references: [id])
  parent   Message?  @relation("ThreadReplies", fields: [parentId], references: [id])
  replies  Message[] @relation("ThreadReplies")

  reactions      Reaction[]
  files          FileAttachment[]
  pins           Pin[]
  bookmarks      Bookmark[]

  // NEW FEATURE RELATIONS (ADD THESE)
  poll           Poll?
  linkPreviews   LinkPreview[]

  @@index([channelId, createdAt(sort: Desc)])
  @@index([parentId])
  @@index([userId])
  @@map("messages")
}
```

**Action**: Insert the 2 new relation lines before the closing `@@` lines.

---

## Change 4-12: ADD NEW MODELS

### Location: `prisma/schema.prisma` after line 366 (after Notification model)

Insert **all 9 new model blocks** in the following order. They can go between the Notification model and CustomEmoji model.

### Model Order to Add:
1. **Poll** (depends on nothing new)
2. **PollVote** (depends on Poll and User)
3. **LinkPreview** (depends on Message)
4. **Canvas** (depends on Channel and User)
5. **CanvasVersion** (depends on Canvas and User)
6. **Call** (depends on Channel and User)
7. **CallParticipant** (depends on Call and User)
8. **ScheduledMessage** (depends on Channel and User)
9. **ChannelCategory** (depends on Channel and User)

See the full model definitions in `prisma_model_definitions.md` section "New Models - Copy-Paste Ready".

---

## Complete Step-by-Step Execution

### Step 1: Backup Current Schema
```bash
cd /Users/zachhixson/claude-workers/project
cp prisma/schema.prisma prisma/schema.prisma.backup
```

### Step 2: Edit User Model
Open `prisma/schema.prisma`
- Find the User model (line 36)
- Add the 6 new relations after `customEmojis` line
- Add `dndUntil DateTime?` field

### Step 3: Edit Channel Model
- Find the Channel model (line 168)
- Add the 3 new relations after `pins` line

### Step 4: Edit Message Model
- Find the Message model (line 215)
- Add the 2 new relations after `bookmarks` line

### Step 5: Add New Models
- Add all 9 model definitions after the Notification model (after line 366)
- Recommended: Keep them in a logical order (Polls, Links, Canvas, Calls, Scheduled, Categories)

### Step 6: Validate Syntax
```bash
npm run db:generate
# Should succeed without errors
```

### Step 7: Apply to Database
```bash
# For development
npm run db:push

# For production
npm run db:migrate -- --name "add_polls_calls_canvas_and_scheduling"
```

### Step 8: Verify Success
```bash
npm run db:info
# Should show all 22 models (13 existing + 9 new)
```

### Step 9: Optional - View in Prisma Studio
```bash
npm run db:studio
# Navigate to each new model to verify structure
```

---

## Validation Checklist

After migration:

- [ ] No syntax errors in `npm run db:generate`
- [ ] `npm run db:push` or `npm run db:migrate` succeeds
- [ ] `npm run db:info` shows 22 models total
- [ ] All 9 new models appear in Prisma Studio
- [ ] Relationships are bidirectional (User ← → Poll, etc.)
- [ ] Indexes are created (visible in db:studio)
- [ ] No warning messages about missing relations

---

## Rollback Plan

If something goes wrong:

```bash
# Option 1: Restore from backup
cp prisma/schema.prisma.backup prisma/schema.prisma
npm run db:push

# Option 2: Rollback last migration (production)
npm run db:migrate:resolve -- --name "add_polls_calls_canvas_and_scheduling"

# Option 3: Reset development database
rm prisma/volume_anomaly.db
npm run db:push
```

---

## File Summary

| File | Status | Action |
|------|--------|--------|
| prisma/schema.prisma | Modified | Add relations + new models |
| prisma/migrations/ | New | Auto-generated by `db:migrate` |
| node_modules/.prisma/client/ | Regenerated | Auto-generated by `db:generate` |
| docs/research/schema_analysis.md | Reference | Read for context |
| docs/research/prisma_model_definitions.md | Reference | Use for copy-paste |

---

## Questions During Migration?

1. **Relationship multiplicity**: Is one Canvas per Channel or many? → See current: `canvas Canvas?` (optional)
2. **Soft deletes**: Should new models track deletedAt? → Not included in base definitions
3. **Audit fields**: Should CanvasVersion have `changeAuthor` in addition to `editor`? → Not included
4. **Call participants**: Should CallParticipant track video/audio status? → Not included in base definition

---

## Related Documentation

- `schema_analysis.md` - Complete analysis with relationship diagrams
- `prisma_model_definitions.md` - Exact model code to copy-paste
- `prisma/schema.prisma` - Source of truth after migration
- [Prisma Documentation](https://www.prisma.io/docs) - Official reference
