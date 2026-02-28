# Message Pipeline Implementation Quick Guide

## TL;DR - Libraries to Use

```json
{
  "animations": "npm install motion@latest",
  "audio": "npm install react-voice-visualizer",
  "gifs": "npm install axios (Giphy API)",
  "linkPreviews": "npm install link-preview-js && npm install --save-dev metascraper",
  "polls": "Custom implementation (Zustand + Socket.IO)",
  "readReceipts": "Custom implementation (Socket.IO events)",
  "forwarded": "Extend MessageWithMeta with quotedMessageId",
  "scheduling": "npm install node-schedule"
}
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   MESSAGE FLOW                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  MessageComposer                                        │
│  ↓ (with SlackEditor/Tiptap)                           │
│  Server Action: sendMessage()                           │
│  ↓                                                       │
│  Socket.IO: message:send event                          │
│  ↓                                                       │
│  MessageList (react-virtuoso)                          │
│  ↓                                                       │
│  MessageItem (with file attachments, reactions, polls)  │
│  ↓                                                       │
│  Socket.IO: reactions, threads, read-receipts          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Current Implementation Status

✅ **Complete**:
- Message composer with Tiptap v3 editor
- Message list virtualization with date grouping
- Rich text rendering (bold, italic, code, lists, etc.)
- File attachments (images, documents)
- Emoji reactions
- Thread replies with parent message display
- Typing indicators

⚠️ **Planned/Partial**:
- Message animations (Motion library)
- Audio message recording
- GIF search integration
- Link preview cards
- Polls/voting
- Read receipts
- Message forwarding/quoting
- Message scheduling

## Key Files to Modify

### Core Message Components
- `messages/components/MessageComposer.tsx` - Add scheduling, GIF button
- `messages/components/MessageItem.tsx` - Add link previews, animations
- `messages/components/MessageList.tsx` - Already optimized
- `messages/components/ReactionBar.tsx` - Add reaction animations
- `messages/store.ts` - Add scheduled messages, read receipts state

### Shared Types
- `shared/types/index.ts` - Extend MessageWithMeta model

### Server Implementation
- `messages/actions.ts` - Add scheduling logic
- Create: `app/api/messages/schedule` - Schedule message endpoint
- Create: `app/api/link-preview` - Link preview endpoint
- Create: `backend/scheduled-messages.ts` - Job queue

## Socket.IO Events

### Existing Events
```typescript
socket.emit('message:send', payload)
socket.emit('typing:start', { channelId })
socket.emit('typing:stop', { channelId })
socket.emit('message:react', { messageId, emoji })
socket.emit('message:unreact', { messageId, emoji })
```

### New Events (Implement These)
```typescript
// Reactions with animations
socket.on('reaction:updated', (payload) => { /* ... */ })

// Read receipts
socket.emit('message:mark-read', { messageId, channelId })
socket.on('message:read', (data) => { /* ... */ })

// Polls
socket.emit('poll:vote', { messageId, optionId, channelId })
socket.on('poll:updated', (data) => { /* ... */ })

// Typing with status
socket.on('user:typing', (data) => { /* show typing indicator */ })
```

## Common Integration Patterns

### 1. Adding a Composer Toolbar Button

```tsx
// EditorToolbar.tsx
export function EditorToolbar({ editor, onAttachmentClick }) {
  return (
    <div className="flex items-center gap-1 border-t border-border px-3 py-2">
      {/* Existing buttons */}

      {/* New button */}
      <button
        type="button"
        onClick={handleClick}
        title="Feature name"
        className="rounded p-1.5 text-muted-foreground hover:bg-muted"
      >
        <IconComponent className="h-5 w-5" />
      </button>
    </div>
  );
}
```

### 2. Wrapping Component with Motion Animations

```tsx
import { motion, AnimatePresence } from "motion/react";

export function AnimatedComponent({ items }) {
  return (
    <AnimatePresence>
      {items.map((item) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
        >
          {item.content}
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
```

### 3. Socket.IO Event Listener Pattern

```tsx
useEffect(() => {
  function handler(data) {
    // Handle event
    console.log('Event data:', data);
  }

  socket.on('event:name', handler);

  return () => {
    socket.off('event:name', handler);
  };
}, [socket, /* dependencies */]);
```

### 4. Zustand Store Pattern

```typescript
// store.ts
interface AppState {
  feature: FeatureState;
  setFeature: (value: FeatureState) => void;
  // ... other actions
}

export const useAppStore = create<AppState>((set) => ({
  feature: initialValue,
  setFeature: (value) => set({ feature: value }),
  // ... other actions
}));

// In component
const feature = useAppStore((state) => state.feature);
const setFeature = useAppStore((state) => state.setFeature);
```

## Database Additions Needed

### Prisma Schema Updates

```prisma
// Add to schema.prisma

enum MessageStatus {
  SENDING
  SENT
  DELIVERED
  READ
}

model Message {
  // ... existing fields ...

  // Polls
  poll                Poll?

  // Forwarding/Quoting
  quotedMessageId     String?
  quotedMessage       Message?        @relation("QuotedMessages", fields: [quotedMessageId], references: [id])
  quotedBy            Message[]       @relation("QuotedMessages")

  // Read receipts
  status              MessageStatus   @default(SENT)
  deliveredAt         DateTime?
  readBy              ReadReceipt[]

  // Scheduling
  scheduledMessage    ScheduledMessage?
}

model Poll {
  id                  String          @id @default(cuid())
  messageId           String          @unique
  message             Message         @relation(fields: [messageId], references: [id], onDelete: Cascade)
  question            String
  options             PollOption[]
  createdBy           String
  allowMultiple       Boolean         @default(false)
  endAt               DateTime?
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
}

model PollOption {
  id                  String          @id @default(cuid())
  pollId              String
  poll                Poll            @relation(fields: [pollId], references: [id], onDelete: Cascade)
  text                String
  votes               Int             @default(0)
  voters              String[]        // Array of user IDs
  createdAt           DateTime        @default(now())
}

model ReadReceipt {
  id                  String          @id @default(cuid())
  messageId           String
  message             Message         @relation(fields: [messageId], references: [id], onDelete: Cascade)
  userId              String
  readAt              DateTime        @default(now())

  @@unique([messageId, userId])
}

model ScheduledMessage {
  id                  String          @id @default(cuid())
  messageId           String          @unique
  message             Message         @relation(fields: [messageId], references: [id], onDelete: Cascade)
  channelId           String
  userId              String
  contentJson         String          // TiptapJSON as JSON string
  contentPlain        String
  scheduledFor        DateTime
  status              ScheduledMessageStatus @default(SCHEDULED)
  sentAt              DateTime?
  failureReason       String?
  createdAt           DateTime        @default(now())

  @@index([scheduledFor])
  @@index([status])
}

enum ScheduledMessageStatus {
  SCHEDULED
  SENT
  CANCELLED
  FAILED
}
```

## TypeScript Types Reference

### Core Message Extensions

```typescript
// shared/types/index.ts

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  createdBy: string;
  createdAt: Date;
  allowMultiple: boolean;
  endAt?: Date;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
  voters: string[];
}

export enum MessageStatus {
  SENDING = "SENDING",
  SENT = "SENT",
  DELIVERED = "DELIVERED",
  READ = "READ",
}

export interface ReadReceipt {
  userId: string;
  readAt: Date;
}

// Extend MessageWithMeta
export interface MessageWithMeta {
  // ... existing fields ...
  status?: MessageStatus;
  deliveredAt?: Date;
  readBy?: ReadReceipt[];
  poll?: Poll;
  quotedMessageId?: string;
  quotedMessage?: MessageWithMeta;
  isForwarded?: boolean;
  forwardedFrom?: string;
}
```

## Performance Considerations

### Message List Virtualization

The project already uses `react-virtuoso` GroupedVirtuoso. Keep these in mind:

- **Don't**: Change message height dynamically (breaks virtualization)
- **Do**: Pre-calculate media dimensions for images
- **Do**: Use `loading="lazy"` on images
- **Do**: Debounce scroll events

### Socket.IO Optimization

```typescript
// ❌ DON'T: Emit on every character
socket.emit('typing', { ... });

// ✅ DO: Debounce typing events
const typingTimeout = useRef(null);
const emitTyping = useCallback(() => {
  socket.emit('typing:start', { ... });

  clearTimeout(typingTimeout.current);
  typingTimeout.current = setTimeout(() => {
    socket.emit('typing:stop', { ... });
  }, 3000);
}, [socket]);
```

### Rendering Optimizations

```typescript
// ❌ DON'T: Define inline functions/objects
<MessageItem onAction={() => handleAction()} />

// ✅ DO: Memoize callbacks and objects
const memoizedCallback = useCallback(() => {
  handleAction();
}, []);

const memoizedObject = useMemo(() => ({...}), [deps]);

<MessageItem onAction={memoizedCallback} />
```

## Testing Guidelines

### Unit Tests (Jest)
```typescript
describe('MessageComposer', () => {
  it('should emit message:send on Enter', async () => {
    // Test component behavior
  });

  it('should show loading state while uploading file', () => {
    // Test file upload UX
  });
});
```

### Integration Tests
```typescript
describe('Message Pipeline', () => {
  it('should receive and render new message from Socket.IO', async () => {
    // Test full flow
  });
});
```

### E2E Tests (Playwright/Cypress)
```typescript
test('user can send message with attachment', async ({ page }) => {
  // Test real browser interaction
});
```

## Debugging Tips

### Socket.IO Events
```typescript
// In browser console to see all Socket.IO events
socket.onAny((event, ...args) => {
  console.log(`📡 ${event}:`, args);
});
```

### Zustand Store
```typescript
// Log all store changes
store.subscribe(
  (state) => state,
  (state) => console.log('Store updated:', state)
);
```

### React DevTools
- Use React DevTools to inspect component hierarchy
- Check "Highlight updates when components render"
- Profile performance with Profiler tab

## Common Gotchas

### 1. Race Conditions with Async Updates
```typescript
// ❌ Can lose updates
async function handleUpdate() {
  const data = await fetch(...);
  setState(data);
}

// ✅ Better: use abort controller
const controller = new AbortController();
try {
  const data = await fetch(..., { signal: controller.signal });
  setState(data);
} catch (e) {
  if (e.name === 'AbortError') return; // Cancelled
}
```

### 2. Memory Leaks from Socket.IO
```typescript
// ❌ Doesn't unsubscribe
useEffect(() => {
  socket.on('event', handler);
  // No cleanup!
}, []);

// ✅ Proper cleanup
useEffect(() => {
  socket.on('event', handler);
  return () => socket.off('event', handler);
}, [socket]);
```

### 3. Virtualization Breaking Animations
```typescript
// ❌ Don't animate between virtualized items
<motion.div
  animate={{ y: 100 }}
>
  <VirtualizedListItem />
</motion.div>

// ✅ Animate individual items
<VirtualizedList
  itemContent={(index) => (
    <motion.div>
      <ListItem />
    </motion.div>
  )}
/>
```

## Rollout Checklist

Before deploying a new feature:

- [ ] Type safety: All `any` types removed
- [ ] Error handling: Try-catch blocks, toast notifications
- [ ] Performance: Profiled with React DevTools
- [ ] Accessibility: Keyboard navigation, ARIA labels
- [ ] Mobile: Tested on iOS and Android
- [ ] Network: Works on slow 3G
- [ ] Browser support: Chrome, Firefox, Safari, Edge latest
- [ ] Documentation: Updated relevant docs
- [ ] Tests: Unit and integration tests passing
- [ ] Code review: PR approved by team member

---

**For detailed implementation instructions, see `message_pipeline.md`**
