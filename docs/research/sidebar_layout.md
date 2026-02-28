# Sidebar Layout & Channel Navigation Research

**Date**: February 2026
**Status**: Complete Analysis with Actionable Recommendations

---

## Executive Summary

The current sidebar implementation uses:
- **Zustand** for state management (already great, well-integrated)
- **Tailwind CSS + tailwindcss-animate** for animations
- **Next.js App Router** with dynamic routes
- **Socket.IO** for real-time updates
- **Radix UI** for accessible components

Current strengths: Mobile-responsive, clean section collapse, DM previews with presence. **Future enhancements needed**: Drag-reorder channels, bookmarks panel, scheduled messages, call history, and smoother animations.

---

## Current Architecture

### Layout Structure
```
├── Sidebar (flex row container)
│   ├── WorkspaceSidebar (68px vertical rail)
│   │   └── Workspace icons (circular buttons with active indicator)
│   └── ChannelSidebar (260px)
│       ├── Workspace header + settings
│       ├── SearchModal (Cmd+K integration)
│       ├── ScrollArea
│       │   ├── Starred channels section (collapsible)
│       │   ├── Regular channels section (collapsible) + create button
│       │   └── Direct Messages section (collapsible) + DM picker
│       └── UserProfileBar
├── Main content area (flex-1)
└── RightPanel (380px, slides in from right)
    ├── ThreadPanel (active threads)
    ├── MemberList (channel members)
    └── ChannelInfo (channel details)
```

### Key Components

#### 1. **Sidebar.tsx** (46 lines)
- **Mobile backdrop overlay**: Fixed inset-0, z-30, black/50
- **Animation**: `translate-x-{-full|0}` with `duration-200 ease-in-out`
- **State**: `sidebarOpen` from Zustand (boolean)
- **Responsive**: `fixed lg:static`, `-translate-x-full lg:translate-x-0`

#### 2. **WorkspaceSidebar.tsx** (113 lines)
- **Layout**: Vertical flex column, 68px width, secondary/50 background
- **Workspace icons**: 10x10 px circles, rounded-lg, with active indicator bar
- **Unread badges**: Position `-right-1 -top-1`, red destructive color, 99+ capping
- **Tooltip**: Right side on hover with workspace name
- **Active state**:
  - Primary background + light primary text
  - Left bar indicator (absolute `-left-2`, h-5, w-1)
  - Smooth rounded-lg transition on hover
- **Gesture**: Click navigates to workspace slug

#### 3. **ChannelSidebar.tsx** (643 lines)
- **Three main sections**: Starred, Channels, Direct Messages
- **State management**:
  - `starredOpen`, `channelsOpen`, `dmsOpen` (local state)
  - `channels`, `currentChannel`, `starredChannels` (Zustand)
  - `dmParticipants` (map of channelId → participants)
- **Section collapse**: Chevron icon (ChevronDown/ChevronRight), toggle on header click
- **Channel items**:
  - Icon: Hash (#) for public, Lock for private
  - Unread badge: Primary/20 background, 99+ cap
  - Active state: Primary/10 background, font-semibold
  - Hover: bg-muted, text-foreground
- **DM items** (DMItem component):
  - Avatar: 5x5 px image or initials
  - Presence dot: Absolute -bottom-0.5 -right-0.5, h-2 w-2
  - Green (online) or muted-foreground/40 (offline)
  - Display name from participant list
- **DM Picker**:
  - Dropdown modal positioned `left-2 right-2 bottom-14`
  - Search input with debounce
  - Multi-select with checkboxes
  - "Start DM" or "Start Group DM (N people)" button
- **Channel creation**: Modal dialog via ChannelCreator component

#### 4. **RightPanel.tsx** (239 lines)
- **Animation**: `slide-in-from-right-5 duration-200`
- **View modes**: `thread | members | channel-info | null`
- **ThreadPanel**: Shows active thread + replies
- **MemberList**: Fetched from `/api/channels/{id}/members`
- **ChannelInfo**: Metadata + invite button
- **Close button**: X icon in header, sets `rightPanelView` to null

### Navigation Patterns

#### App Router Dynamic Routes
```
/(app)
├── [workspaceSlug]
│   ├── layout.tsx (server-side hydration)
│   ├── channel/[channelId]
│   │   ├── page.tsx
│   │   └── channel-view.tsx
│   └── dm/[userId]
│       └── page.tsx
```

#### Navigation Logic
- **Channel click**: `router.push(/${workspaceSlug}/channel/${ch.id})` + close sidebar (mobile)
- **Workspace switch**: `router.push(/${slug})` + close sidebar (mobile)
- **DM creation**: `openDM(workspaceId, targetUserId)` → navigate to DM route
- **Search result**: `router.push(/${workspaceSlug}/channel/${channelId}?scrollTo=${messageId})`

### State Management (Zustand)

**UI State Keys**:
```typescript
sidebarOpen: boolean           // Mobile sidebar toggle
rightPanelView: RightPanelView // 'thread' | 'members' | 'channel-info' | null
```

**Data Keys**:
```typescript
channels: ChannelWithMeta[]    // All member channels (regular + DM)
currentChannel: Channel | null // Active channel
starredChannels: string[]      // IDs of starred channels
dmParticipants: Record<string, UserSummary[]> // DM participant info
```

---

## Enhancement Opportunities

### 1. **Channel Drag-Reorder** ⭐ HIGH PRIORITY

**Current State**: No drag-and-drop support. Channels are alphabetically sorted server-side.

**Recommendation**: Use **@dnd-kit** (v7.0.0+) for drag-reorder within sections.

#### Why @dnd-kit over alternatives:

| Library | Pros | Cons | Verdict |
|---------|------|------|---------|
| **@dnd-kit** v7.0.0+ | ✅ Tree structure support, ✅ Minimal bundle (10KB), ✅ Vanilla JS friendly, ✅ Touch/mobile optimized | Steeper learning curve | **RECOMMENDED** |
| react-beautiful-dnd | ✅ Simple API, ✅ Excellent animations | ❌ Abandoned (last update 2020), ❌ 30KB bundle, ❌ No tree support | Avoid |
| react-dnd | ✅ Powerful, ✅ Active | ❌ 50KB+ bundle, ❌ Complex setup, ❌ Desktop-first | Overkill |
| Radix Sortable | ✅ Built on Radix | ❌ Still experimental, ❌ No native tree API | Too early |

**Installation**:
```bash
npm install @dnd-kit/core@7.0.0 @dnd-kit/utilities@3.2.0 @dnd-kit/sortable@8.0.0 @dnd-kit/sensors@6.0.0
```

**Usage Example** (ChannelSidebar.tsx enhancement):

```typescript
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

// Wrap channel list with DndContext
function ChannelSection({ channels, onReorder }) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      distance: 8, // 8px drag threshold to avoid accidental reorders
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(active.id, over.id);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={channels.map((c) => c.id)}
        strategy={verticalListSortingStrategy}
      >
        {channels.map((ch) => (
          <SortableChannelItem key={ch.id} channel={ch} />
        ))}
      </SortableContext>
    </DndContext>
  );
}

// Sortable item component
function SortableChannelItem({ channel }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: channel.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'flex items-center gap-2 w-full rounded-md px-4 py-1.5 text-sm cursor-grab',
        isDragging && 'cursor-grabbing bg-primary/10'
      )}
    >
      {/* Drag handle (optional visual) */}
      <div className="opacity-0 group-hover:opacity-100">⋮⋮</div>
      {/* Channel item content */}
    </div>
  );
}
```

**Integration with Backend**:
```typescript
// Save reorder to database
const handleReorder = async (fromId: string, toId: string) => {
  await fetch(`/api/channels/reorder`, {
    method: 'POST',
    body: JSON.stringify({
      channelId: fromId,
      beforeChannelId: toId,
    }),
  });
};
```

**Alternatives Considered**:
- **react-beautiful-dnd**: Too outdated (unmaintained since 2020)
- **react-dnd**: Overkill for sidebar; better for complex tree structures
- **Radix primitives + custom**: Would require 500+ LOC

---

### 2. **Sidebar Expand/Collapse Animation** ⭐ MEDIUM PRIORITY

**Current State**: Mobile sidebar uses Tailwind `translate-x` (working well). Desktop is always visible. No collapse to icon-only mode on desktop.

**Recommendation**: Keep **Tailwind CSS animations** (already excellent). Add optional desktop collapse using **CSS transitions** + **CSS variables**.

#### Why Tailwind CSS + CSS Variables (not Framer Motion):

| Solution | Pros | Cons |
|----------|------|------|
| **Tailwind + CSS Vars** | ✅ Zero new deps, ✅ 60fps, ✅ lightweight | Requires CSS custom props |
| Framer Motion v11 | ✅ Powerful, ✅ Spring physics | ❌ 40KB bundle, ❌ Overkill for sidebar |
| GSAP | ✅ Professional, ✅ Timeline control | ❌ 70KB, ❌ Overkill |

**Implementation** (Sidebar.tsx enhancement):

```typescript
// Add to store/index.ts
export interface AppStore {
  sidebarExpanded: boolean; // Add this
  setSidebarExpanded: (expanded: boolean) => void;
}

// In Sidebar.tsx
export function Sidebar() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const sidebarExpanded = useAppStore((s) => s.sidebarExpanded);
  const setSidebarExpanded = useAppStore((s) => s.setSidebarExpanded);

  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" />}

      {/* Sidebar with desktop expand/collapse */}
      <aside
        style={{
          '--sidebar-width': sidebarExpanded ? '260px' : '68px',
        } as React.CSSProperties}
        className={cn(
          'flex h-full shrink-0 transition-all duration-300',
          'fixed inset-y-0 left-0 z-40 lg:static lg:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Toggle button (desktop only) */}
        <button
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className="hidden lg:flex items-center justify-center h-full px-2 hover:bg-muted"
        >
          {sidebarExpanded ? <ChevronLeft /> : <ChevronRight />}
        </button>

        <WorkspaceSidebar />
        {sidebarExpanded && <ChannelSidebar />}
      </aside>
    </>
  );
}
```

**CSS in Tailwind config** (if needed):
```css
@supports (animation-timeline: view()) {
  .sidebar-animate-in {
    animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
}
@keyframes slideIn {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}
```

**Alternatives Considered**:
- **Framer Motion**: Would add 40KB+ bundle for simple translate animation
- **React Spring**: Similar bundle cost for limited use case
- **Pure CSS**: Works but less maintainable

---

### 3. **Bookmarks Panel** ⭐ MEDIUM PRIORITY

**Current State**: Not implemented. Starred channels exist but no dedicated bookmark panel.

**Recommendation**: Create a new **collapsible Bookmarks section** in ChannelSidebar using existing patterns.

**Implementation Pattern**:

```typescript
// Add to ChannelSidebar.tsx
const [bookmarksOpen, setBookmarksOpen] = useState(true);

// Inside render:
<SidebarSection
  label="Bookmarks"
  icon={<Bookmark className="h-3 w-3" />}
  isOpen={bookmarksOpen}
  onToggle={() => setBookmarksOpen(!bookmarksOpen)}
>
  {bookmarks.map((item) => (
    <BookmarkItem key={item.id} item={item} />
  ))}
</SidebarSection>

// BookmarkItem component
function BookmarkItem({ item }: { item: Bookmark }) {
  const router = useRouter();
  const workspaceSlug = useParams().workspaceSlug as string;

  return (
    <button
      onClick={() => {
        if (item.type === 'message') {
          router.push(
            `/${workspaceSlug}/channel/${item.channelId}?scrollTo=${item.messageId}`
          );
        } else {
          router.push(`/${workspaceSlug}/channel/${item.channelId}`);
        }
      }}
      className="flex items-center gap-2 w-full rounded-md px-4 py-1.5 text-sm hover:bg-muted"
    >
      <Bookmark className="h-3.5 w-3.5" />
      <span className="truncate">{item.title || 'Bookmarked'}</span>
    </button>
  );
}
```

**Database Schema**:
```typescript
model Bookmark {
  id        String   @id @default(cuid())
  userId    String
  workspaceId String
  channelId String
  messageId String? // null if bookmarking entire channel
  title     String?
  createdAt DateTime @default(now())

  @@unique([userId, messageId])
  @@unique([userId, channelId])
}
```

---

### 4. **Scheduled Messages Panel** ⭐ MEDIUM PRIORITY

**Current State**: Not implemented. Message scheduling would require backend support.

**Recommendation**: Create a **Scheduled Messages section** (similar to Bookmarks) with status indicators.

**UI Component** (ChannelSidebar.tsx):

```typescript
// Scheduled messages section
<SidebarSection
  label="Scheduled"
  icon={<Clock className="h-3 w-3" />}
  isOpen={scheduledOpen}
  onToggle={() => setScheduledOpen(!scheduledOpen)}
>
  {scheduledMessages.map((msg) => (
    <ScheduledMessageItem key={msg.id} message={msg} />
  ))}
</SidebarSection>

function ScheduledMessageItem({ message }) {
  const isReady = new Date(message.scheduledFor) <= new Date();

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-sm rounded-md hover:bg-muted">
      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm">{message.preview}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(message.scheduledFor).toLocaleString()}
        </p>
      </div>
      {isReady && <Badge variant="outline">Ready</Badge>}
    </div>
  );
}
```

---

### 5. **Call History Panel** ⭐ LOW PRIORITY (Phase 2)

**Current State**: Not implemented. Requires voice/video integration.

**Recommendation**: Add after implementing core voice/video features. Use same panel pattern as Bookmarks/Scheduled.

**Placeholder Component**:

```typescript
<SidebarSection
  label="Call History"
  icon={<Phone className="h-3 w-3" />}
  isOpen={callHistoryOpen}
  onToggle={() => setCallHistoryOpen(!callHistoryOpen)}
>
  {callHistory.map((call) => (
    <CallHistoryItem key={call.id} call={call} />
  ))}
</SidebarSection>
```

---

### 6. **Command Palette (Cmd+K)** ✅ COMPLETE

**Status**: Fully implemented in `search/components/SearchModal.tsx`.

**Features**:
- ✅ Global keyboard shortcut (Cmd+K / Ctrl+K)
- ✅ 300ms debounced search
- ✅ Filter chips (in:#channel, from:@user, has:file)
- ✅ Keyboard navigation (arrow up/down, Enter, Escape)
- ✅ Recent searches (localStorage, max 10)
- ✅ Click result to navigate + scroll to message

**Enhancement Opportunity**: Extend to support slash commands (e.g., `/mute`, `/pin`, `/reminder`).

```typescript
// searchModal enhancement
const commands = [
  { id: 'mute', label: 'Mute channel', icon: VolumeX },
  { id: 'pin', label: 'Pin message', icon: Pin },
  { id: 'reminder', label: 'Set reminder', icon: Clock },
];

const showCommands = query.startsWith('/');
// Filter & render commands if showCommands
```

---

### 7. **Right Panel (Threads/Members/Info)** ✅ COMPLETE

**Status**: Fully implemented with slide-in animation.

**Features**:
- ✅ ThreadPanel: View active thread + replies
- ✅ MemberList: Channel members with message action
- ✅ ChannelInfo: Metadata + invite dialog
- ✅ Slide-in animation: `slide-in-from-right-5 duration-200`
- ✅ Close button: X icon sets `rightPanelView` to null

**Enhancement Opportunity**: Add collapsible sub-sections in ChannelInfo (File attachments, Integrations, Pinned messages).

---

## Recommended Implementation Roadmap

### Phase 1 (High Priority - 2 weeks)
1. ✅ **Command Palette** (already done - just enhance with slash commands)
2. 🔄 **@dnd-kit Integration** (drag-reorder channels)
3. 🔄 **Bookmarks Panel** (collapsible section with save/load)

### Phase 2 (Medium Priority - 2 weeks)
4. 🔄 **Desktop Sidebar Collapse** (expand/collapse animation)
5. 🔄 **Scheduled Messages Panel** (timeline + status)

### Phase 3 (Lower Priority - TBD)
6. 🔄 **Call History Panel** (after video integration)
7. 🔄 **Advanced Search Filters** (date ranges, member mentions, etc.)

---

## Migration Notes

### Adding @dnd-kit Without Breaking Current Code

1. **Install package** (no breaking changes to existing components)
2. **Wrap only one section** (e.g., regular channels) first
3. **Implement reorder API endpoint** (`POST /api/channels/reorder`)
4. **Test with existing tests** (Jest, React Testing Library)

### Database Changes for Bookmarks/Scheduled

```sql
-- Add to schema.prisma
model Bookmark {
  id String @id @default(cuid())
  userId String
  channelId String
  messageId String?
  title String?
  createdAt DateTime @default(now())

  @@index([userId])
}

model ScheduledMessage {
  id String @id @default(cuid())
  authorId String
  channelId String
  content String
  scheduledFor DateTime
  status String @default("pending") // pending|sent|failed
  createdAt DateTime @default(now())

  @@index([channelId, scheduledFor])
}
```

---

## Performance Considerations

### Current Bottlenecks
1. **DM participant list**: Fetched per DM item render → memoize
2. **Channel search**: No debounce on server → already uses 300ms debounce
3. **Right panel member fetch**: Re-fetches on every channel change → cache by channelId

### Optimization Recommendations
```typescript
// Memoize DMItem to prevent unnecessary re-renders
const DMItem = React.memo(
  function DMItem({ channel, participant, displayName, ... }) {
    // component
  },
  (prev, next) => {
    return (
      prev.channel.id === next.channel.id &&
      prev.channel.unreadCount === next.channel.unreadCount &&
      prev.isActive === next.isActive
    );
  }
);

// Use react-virtuoso for large channel lists
<Virtuoso
  data={channels}
  itemContent={(index, ch) => <ChannelItem channel={ch} />}
  style={{ height: '400px' }}
/>
```

---

## Testing Strategy

### Unit Tests (Jest + React Testing Library)

```typescript
describe('ChannelSidebar', () => {
  test('toggles starred section collapse', () => {
    render(<ChannelSidebar />);
    const starredHeader = screen.getByText('Starred');
    fireEvent.click(starredHeader);
    expect(screen.getByText('starred-channel')).not.toBeInTheDocument();
  });

  test('displays unread count badge', () => {
    render(<ChannelSidebar />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  test('DM picker closes on escape', async () => {
    render(<ChannelSidebar />);
    fireEvent.click(screen.getByTitle('Create DM'));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Find people')).not.toBeInTheDocument();
    });
  });
});
```

### Integration Tests
- Drag-reorder channels + verify API call
- Open DM picker + create group DM + navigate
- Search Cmd+K + select result + scroll to message

---

## Accessibility Checklist

- ✅ Keyboard navigation (Tab, Enter, Arrow keys, Escape)
- ✅ ARIA labels on icon buttons (`aria-label="Workspace settings"`)
- ✅ Color contrast (primary/muted, 4.5:1 min)
- ✅ Focus visible (Tailwind focus-visible class)
- ✅ Semantic HTML (button, section, list)
- ✅ Screen reader announcements (unread counts via `aria-label`)

**Enhancements for Phase 2**:
- Add `aria-expanded` to collapsible sections
- Announce unread count changes via live region
- Support for `prefers-reduced-motion`

---

## Summary Table

| Feature | Priority | Status | Est. Effort | Library |
|---------|----------|--------|-------------|---------|
| Drag-reorder channels | High | 🔄 Ready | 2-3 days | @dnd-kit v7 |
| Bookmarks panel | Medium | 📋 Designed | 2-3 days | (none) |
| Desktop sidebar collapse | Medium | 📋 Designed | 1-2 days | (Tailwind CSS) |
| Scheduled messages | Medium | 📋 Designed | 3-4 days | (none) |
| Call history | Low | 📋 Backlog | TBD | TBD |
| Command palette enhancements | Low | ✅ Done | — | (existing) |

---

## Appendix: Code References

### File Locations in Codebase
- **Sidebar layout**: `components/layout/Sidebar.tsx` (46 lines)
- **Workspace sidebar**: `components/layout/WorkspaceSidebar.tsx` (113 lines)
- **Channel sidebar**: `components/layout/ChannelSidebar.tsx` (643 lines)
- **Right panel**: `components/layout/RightPanel.tsx` (239 lines)
- **Search modal**: `search/components/SearchModal.tsx` (390 lines)
- **State management**: `store/index.ts` (294 lines)
- **App layout**: `app/(app)/layout.tsx` (43 lines)
- **Workspace layout**: `app/(app)/[workspaceSlug]/layout.tsx` (220 lines)

### Key Dependencies
- `zustand@5.0.11` - State management (use for panel state)
- `tailwindcss@3.4.0` + `tailwindcss-animate@1.0.7` - Animations
- `lucide-react@0.400.0` - Icons
- `@radix-ui/*` - Accessible components
- `next@14.2.0` - App Router + Server Components
- `socket.io-client@4.7.5` - Real-time updates

### Recommended New Dependencies
- `@dnd-kit/core@7.0.0` (10KB gzipped)
- `@dnd-kit/sortable@8.0.0` (5KB gzipped)
- `@dnd-kit/utilities@3.2.0` (2KB gzipped)
- `@dnd-kit/sensors@6.0.0` (3KB gzipped)

---

## Questions for Implementation Team

1. Should bookmarks be user-global or per-workspace?
2. Should scheduled messages support recurring schedules (Cron syntax)?
3. For call history, should we track call duration + participants?
4. Should drag-reorder channels be stored per-user or per-workspace?
5. Should collapsed sidebar state persist in localStorage or server?

---

**Last Updated**: 2026-02-28
**Next Review**: After Phase 1 completion
