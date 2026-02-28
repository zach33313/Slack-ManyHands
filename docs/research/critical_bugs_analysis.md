# Critical Bugs Analysis - Audio Messages & Polls

**Date**: February 28, 2026
**Analyst**: Worker 58662c85
**Status**: COMPLETED - Ready for Implementation

---

## Executive Summary

Three critical bugs were identified in the audio message and poll implementations:

1. **FIXED** ✅ Audio metadata loss in `handleAudioSend` - fileIds not included in payload
2. **ACTIVE** 🔴 Multi-choice polls broken on client side despite server support
3. **FIXED** ✅ Missing DELETE endpoint for scheduled messages

---

## Bug #1: Audio Message Metadata Loss - FIXED ✅

### Status
**FIXED in Bug Fix Batch 1**

### Root Cause
`handleAudioSend` in `MessageComposer.tsx` discarded the `fileId` parameter and never attached it to the message payload.

### Evidence

**File**: `messages/components/MessageComposer.tsx:420-440`

**Before Fix**:
```typescript
const handleAudioSend = useCallback(
  async (fileUrl: string, fileName: string, mimeType: string, size: number, duration: number) => {
    const contentJson: TiptapJSON = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '🎙️ Voice message' }],
        },
      ],
    }
    const payload: MessageSendPayload = {
      channelId,
      content: contentJson as unknown as Record<string, unknown>,
      ...(parentId && { parentId }),
      // fileIds NOT included!
    }
    socket.emit('message:send', payload)
  },
  [channelId, parentId, socket]
)
```

**After Fix**:
```typescript
const handleAudioSend = useCallback(
  async (fileId: string, fileName: string, mimeType: string, size: number, duration: number) => {
    const contentJson: TiptapJSON = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '🎙️ Voice message' }],
        },
      ],
    }
    const payload: MessageSendPayload = {
      channelId,
      content: contentJson as unknown as Record<string, unknown>,
      ...(parentId && { parentId }),
      fileIds: [fileId],  // ✅ NOW INCLUDED
    }
    socket.emit('message:send', payload)
  },
  [channelId, parentId, socket]
)
```

### Impact
- **Severity**: CRITICAL
- **User Impact**: Audio files uploaded and played back, but never persisted to message record
- **Data Loss**: Audio metadata lost after message creation

### Changes Made
1. `messages/components/AudioRecorder.tsx` - Updated prop type from `fileUrl: string` to `fileId: string`
2. `messages/components/MessageComposer.tsx` - Added `fileIds: [fileId]` to payload
3. Also fixed API response envelope parsing in AudioRecorder

---

## Bug #2: Multi-Choice Polls Broken on Client - ACTIVE 🔴

### Status
**REQUIRES IMPLEMENTATION** - Server supports it, but client doesn't

### Severity
**CRITICAL** - Feature completely non-functional despite full server implementation

### Root Cause Analysis

The multi-choice poll feature has a **complete architectural mismatch** between client and server:

**Server (`server/socket-handlers/polls.ts:130-145`)** ✅ CORRECT:
```typescript
if (poll.multiChoice) {
  // Multi-choice: add this vote without clearing others.
  // Upsert avoids a duplicate if the user somehow re-votes the same option.
  await prisma.pollVote.upsert({
    where: { pollId_userId_option: { pollId, userId, option } },
    create: { pollId, userId, option },
    update: {},
  });
} else {
  // Single-choice: atomically remove all existing votes then insert the new one.
  await prisma.$transaction([
    prisma.pollVote.deleteMany({ where: { pollId, userId } }),
    prisma.pollVote.create({ data: { pollId, userId, option } }),
  ]);
}
```

**Client (`polls/components/PollDisplay.tsx:91-169`)** ❌ BROKEN:

### Issue #2a: getUserVote() Only Returns First Vote

**File**: `polls/components/PollDisplay.tsx:91-96`

```typescript
const getUserVote = useCallback((): string | null => {
  for (const vg of poll.votes) {
    if (vg.userIds.includes(currentUserId)) return vg.option;
  }
  return null;
}, [poll.votes, currentUserId]);
```

**Problem**:
- Returns only the FIRST vote found
- In multi-choice polls, a user can have multiple votes
- This function can't track all of a user's votes

**Required Fix**:
```typescript
const getUserVotes = useCallback((): string[] => {
  return poll.votes
    .filter(vg => vg.userIds.includes(currentUserId))
    .map(vg => vg.option);
}, [poll.votes, currentUserId]);
```

### Issue #2b: handleVote Ignores multiChoice Setting

**File**: `polls/components/PollDisplay.tsx:98-169`

```typescript
async function handleVote(option: string) {
  if (!socket || !poll.isActive || isVoting) return;

  const currentVote = getUserVote();
  setIsVoting(true);

  try {
    if (currentVote === option) {
      // Unvote
      socket.emit('poll:unvote', { pollId: poll.id, option });
    } else {
      // Vote (and remove previous vote if any)
      if (currentVote) {
        socket.emit('poll:unvote', { pollId: poll.id, option: currentVote });  // ❌ BUG!
      }
      socket.emit('poll:vote', { pollId: poll.id, option });
    }
    // ... optimistic update
  }
}
```

**Problem**:
- Line 128-129: ALWAYS removes previous vote, even in multiChoice mode
- Doesn't check `poll.multiChoice` before deciding to unvote
- Forces single-choice behavior regardless of poll setting
- In multiChoice mode, clicking Option A then Option B should select BOTH, not switch

**Required Fix**:
```typescript
async function handleVote(option: string) {
  if (!socket || !poll.isActive || isVoting) return;

  const currentVotes = getUserVotes();
  const isCurrentlyVoted = currentVotes.includes(option);
  setIsVoting(true);

  try {
    if (isCurrentlyVoted) {
      // Toggle OFF: unvote
      socket.emit('poll:unvote', { pollId: poll.id, option });
    } else {
      // Toggle ON: vote (remove previous only if single-choice)
      if (!poll.multiChoice && currentVotes.length > 0) {
        // Single-choice: remove all existing votes first
        for (const prevOption of currentVotes) {
          socket.emit('poll:unvote', { pollId: poll.id, option: prevOption });
        }
      }
      // Now vote for the new option
      socket.emit('poll:vote', { pollId: poll.id, option });
    }
    // ... optimistic update (multi-option aware)
  }
}
```

### Issue #2c: UI Doesn't Reflect Multi-Choice vs Single-Choice

**Problem**:
- Component always renders with single-choice semantics (radio button behavior)
- No visual distinction between poll types
- Multi-choice polls show radios instead of checkboxes
- Users can't select multiple options even if allowed

### Data Flow Analysis

| Layer | Status | Issue |
|-------|--------|-------|
| **Database Schema** | ✅ OK | Poll.multiChoice field present |
| **Server API** | ✅ OK | POST /api/polls correctly accepts multiChoice param |
| **polls/actions.ts** | ✅ OK | createPoll() stores multiChoice correctly |
| **Socket Handler** | ✅ OK | poll:vote handler respects multiChoice setting |
| **Client State** | ❌ BUG | PollDisplay doesn't track multiple votes |
| **Client Logic** | ❌ BUG | handleVote always uses single-choice semantics |
| **Client UI** | ❌ BUG | No checkbox/radio differentiation |

### Evidence of Severity

1. **Users can't select multiple options** - polls/components/PollDisplay.tsx unconditionally unvotes previous option
2. **Server accepts multiChoice but client ignores it** - Setting gets stored but never used
3. **Voting state tracking broken** - getUserVote() can't handle multi-votes

### Required Implementation Changes

#### 1. Update PollDisplay Component

**File**: `polls/components/PollDisplay.tsx`

Replace:
- `getUserVote()` → `getUserVotes(): string[]`
- `handleVote()` → Check `poll.multiChoice` before removing previous votes
- Render checkboxes for multiChoice, radios for single-choice

#### 2. Update Optimistic Updates

Multi-vote optimistic updates must be changed:

**Current (Wrong)**:
```typescript
// Removes user from old vote option
if (vg.option === currentVote) {
  return {
    ...vg,
    userIds: vg.userIds.filter((id) => id !== currentUserId),
  };
}
```

**Required (Multi-Choice Aware)**:
```typescript
// Only remove from old options in single-choice mode
if (!poll.multiChoice && vg.option === currentVote) {
  return {
    ...vg,
    userIds: vg.userIds.filter((id) => id !== currentUserId),
  };
}
```

#### 3. UI Rendering

```typescript
// Pseudo-code for correct rendering
return (
  <div>
    {poll.votes.map((vg) => {
      const isVoted = currentUserVotes.includes(vg.option);

      return (
        <label key={vg.option}>
          {poll.multiChoice ? (
            <input type="checkbox" checked={isVoted} onChange={() => handleVote(vg.option)} />
          ) : (
            <input type="radio" checked={isVoted} onChange={() => handleVote(vg.option)} />
          )}
          {vg.option}
        </label>
      );
    })}
  </div>
);
```

---

## Bug #3: Missing DELETE Endpoint for Scheduled Messages - FIXED ✅

### Status
**FIXED in Bug Fix Batch 7**

### Root Cause
`app/api/scheduled-messages/route.ts` imported `cancelScheduledMessage` but only implemented GET and POST handlers.

### Evidence

**File**: `app/api/scheduled-messages/route.ts`

**Before**:
```typescript
/**
 * app/api/scheduled-messages/route.ts
 *
 * GET  /api/scheduled-messages?channelId=<id>  — List pending scheduled messages
 * POST /api/scheduled-messages                  — Create a new scheduled message
 */

import { cancelScheduledMessage } from '@/scheduling/actions';  // Dead import!

export async function GET(req) { /* ... */ }
export async function POST(req) { /* ... */ }
// No DELETE handler!
```

**After**:
```typescript
/**
 * app/api/scheduled-messages/route.ts
 *
 * GET    /api/scheduled-messages?channelId=<id>  — List pending scheduled messages
 * POST   /api/scheduled-messages                  — Create a new scheduled message
 * DELETE /api/scheduled-messages?id=<id>          — Cancel a scheduled message
 */

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  try {
    await cancelScheduledMessage(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to cancel scheduled message';
    const status =
      message === 'Scheduled message not found' ? 404 :
      message === 'Not authorized to cancel this message' ? 403 :
      400;
    return NextResponse.json({ error: message }, { status });
  }
}
```

### Impact
- **Severity**: CRITICAL
- **Feature Completeness**: 0% - Users couldn't cancel scheduled messages via API
- **Dead Code**: The `cancelScheduledMessage` action was implemented but unreachable

---

## Summary Table

| Bug | Feature | File | Type | Status | Complexity |
|-----|---------|------|------|--------|------------|
| Audio Metadata Loss | Voice Messages | MessageComposer.tsx | Missing Data | ✅ FIXED | Low |
| Multi-Choice Polls | Voting | PollDisplay.tsx | Logic Error | 🔴 ACTIVE | High |
| Missing DELETE | Scheduling | scheduled-messages/route.ts | Missing Handler | ✅ FIXED | Low |

---

## Implementation Recommendations

### Immediate Priority
1. **Fix Bug #2 (Multi-Choice Polls)** - Complete architectural refactor of PollDisplay.tsx
   - Estimated effort: 2-3 hours
   - Risk: Medium (socket integration changes)
   - Testing: Requires new test cases for multi-vote scenarios

### Testing Checklist for Bug #2 Fix

- [ ] Single-choice poll: clicking same option toggles it off
- [ ] Single-choice poll: clicking different option switches votes
- [ ] Multi-choice poll: clicking multiple options selects all of them
- [ ] Multi-choice poll: can unvote individual options without affecting others
- [ ] UI correctly shows checkboxes for multi-choice, radios for single-choice
- [ ] Optimistic updates work correctly for both modes
- [ ] Socket real-time updates work correctly for both modes
- [ ] User votes persist after page reload

### Code Files to Modify
- `polls/components/PollDisplay.tsx` - CRITICAL
- `polls/types.ts` - May need type updates for multi-vote tracking
- Test files: `__tests__/polls/` - Need new test cases

---

## References

- **Prisma Schema**: Poll model has `multiChoice Boolean @default(false)`
- **Server Handler**: `server/socket-handlers/polls.ts:130-145` - Correctly implements multi-choice
- **Client Component**: `polls/components/PollDisplay.tsx` - Needs complete refactor
- **API Route**: `app/api/polls/route.ts` - Correctly accepts multiChoice parameter

