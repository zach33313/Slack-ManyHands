# Sidebar State Management Patterns

**Goal**: Document best practices for managing sidebar UI state in Zustand.

**Framework**: Zustand v5.0.11 (already in use)

---

## Current State Structure

### Zustand Store (store/index.ts)

```typescript
export interface AppStore {
  // UI State
  sidebarOpen: boolean;              // Mobile sidebar visibility
  threadPanelOpen: boolean;          // Deprecated (use rightPanelView)
  rightPanelView: RightPanelView;    // 'thread' | 'members' | 'channel-info' | null
  searchOpen: boolean;               // Command palette visibility
  profilePanelOpen: boolean;         // Deprecated (use rightPanelView)

  // Data State
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  channels: ChannelWithMeta[];
  currentChannel: Channel | null;
  starredChannels: string[];         // Array of channel IDs
  dmParticipants: Record<string, UserSummary[]>;

  // Actions
  setSidebarOpen: (open: boolean) => void;
  setRightPanelView: (view: RightPanelView) => void;
  toggleStarChannel: (channelId: string) => void;
  // ... 40+ more actions
}
```

---

## Enhanced State Proposal (Phase 2)

### Add to AppStore

```typescript
export interface AppStore {
  // ... existing state

  // Sidebar expansion state (new)
  sidebarExpanded: boolean;          // Desktop sidebar collapsed/expanded
  sidebarCollapse: Record<string, boolean>; // Per-section collapse state

  // Panel state (new)
  bookmarksOpen: boolean;
  scheduledOpen: boolean;
  callHistoryOpen: boolean;

  // Preferences (new)
  channelSortBy: 'alphabetical' | 'recent' | 'custom';
  dmSortBy: 'alphabetical' | 'recent' | 'activity';
  compactMode: boolean;              // Hide avatars/icons in DMs

  // Actions
  setSidebarExpanded: (expanded: boolean) => void;
  setSidebarSectionCollapse: (section: string, collapsed: boolean) => void;
  setChannelSortBy: (sortBy: string) => void;
  setCompactMode: (compact: boolean) => void;
}
```

### Implementation

```typescript
// store/index.ts (enhanced)

export const useAppStore = create<AppStore>((set, get) => ({
  // ... existing state initialization

  // New state
  sidebarExpanded: true,
  sidebarCollapse: {
    starred: true,
    channels: true,
    dms: true,
  },
  bookmarksOpen: true,
  scheduledOpen: false,
  callHistoryOpen: false,
  channelSortBy: 'alphabetical',
  dmSortBy: 'recent',
  compactMode: false,

  // New actions
  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),

  setSidebarSectionCollapse: (section, collapsed) =>
    set((state) => ({
      sidebarCollapse: {
        ...state.sidebarCollapse,
        [section]: collapsed,
      },
    })),

  setChannelSortBy: (sortBy) => set({ channelSortBy: sortBy }),

  setCompactMode: (compact) => set({ compactMode: compact }),
}));
```

---

## Best Practices for Sidebar State

### 1. **Separation of Concerns**

**DO**: Separate persistent state (localStorage) from ephemeral state (memory)

```typescript
// ❌ BAD: Mixing all state in Zustand
const store = create((set) => ({
  sidebarOpen: false,        // Mobile, ephemeral
  compactMode: true,        // User preference, persistent
  searchOpen: false,         // Ephemeral
  theme: 'dark',            // Persistent
}));

// ✅ GOOD: Use composition
const useUIStore = create((set) => ({
  // Ephemeral
  sidebarOpen: false,
  searchOpen: false,
  rightPanelView: null,
}));

const usePreferenceStore = create(
  persist(
    (set) => ({
      compactMode: false,
      theme: 'dark',
      dmSortBy: 'recent',
    }),
    { name: 'preferences' }
  )
);
```

### 2. **Immutability Patterns**

```typescript
// ❌ BAD: Direct mutation
setSidebarCollapse: (section, collapsed) =>
  set((state) => {
    state.sidebarCollapse[section] = collapsed; // Mutates!
    return state;
  }),

// ✅ GOOD: Spread operator
setSidebarSectionCollapse: (section, collapsed) =>
  set((state) => ({
    sidebarCollapse: {
      ...state.sidebarCollapse,
      [section]: collapsed,
    },
  })),

// ✅ GOOD: Use Immer middleware for complex updates
import { immer } from 'zustand/middleware/immer';

const useStore = create<AppStore>()(
  immer((set) => ({
    setSidebarSectionCollapse: (section, collapsed) =>
      set((state) => {
        state.sidebarCollapse[section] = collapsed; // Now safe with Immer!
      }),
  }))
);
```

### 3. **Computed/Derived State**

```typescript
// ❌ BAD: Storing derived state
const store = create((set) => ({
  channels: [],
  starredChannels: [],
  starredChannelsList: [], // REDUNDANT!
}));

// ✅ GOOD: Compute on read using selectors
const useAppStore = create((set) => ({
  channels: [],
  starredChannels: [],
}));

// In component
const starredList = useAppStore((state) =>
  state.channels.filter((ch) => state.starredChannels.includes(ch.id))
);

// Or create reusable selector
export const selectStarredChannels = (state: AppStore) =>
  state.channels.filter((ch) => state.starredChannels.includes(ch.id));

// Use in component
const starred = useAppStore(selectStarredChannels);
```

### 4. **Selector Memoization**

```typescript
// Create selectors outside components to ensure referential equality
const selectSidebarState = (state: AppStore) => ({
  open: state.sidebarOpen,
  expanded: state.sidebarExpanded,
});

export function Sidebar() {
  // ✅ Good: Memoized selector prevents unnecessary re-renders
  const { open, expanded } = useAppStore(selectSidebarState);
  return <aside>{/* ... */}</aside>;
}
```

### 5. **Batch Updates**

```typescript
// ❌ BAD: Multiple store calls trigger multiple renders
export function ChannelSidebar() {
  const setCurrentChannel = useAppStore((s) => s.setCurrentChannel);
  const markChannelRead = useAppStore((s) => s.markChannelRead);
  const setRightPanelView = useAppStore((s) => s.setRightPanelView);

  const handleChannelClick = (channel) => {
    setCurrentChannel(channel);     // Re-render 1
    markChannelRead(channel.id);    // Re-render 2
    setRightPanelView(null);        // Re-render 3
  };
}

// ✅ GOOD: Batch into single action
const useAppStore = create((set) => ({
  selectChannel: (channel) =>
    set((state) => ({
      currentChannel: channel,
      unreadCounts: { ...state.unreadCounts, [channel.id]: 0 },
      rightPanelView: null,
    })),
}));

export function ChannelSidebar() {
  const selectChannel = useAppStore((s) => s.selectChannel);

  const handleChannelClick = (channel) => {
    selectChannel(channel); // Single update batch
  };
}
```

---

## State Management Patterns by Feature

### Pattern 1: Collapsible Section State

**For**: Sidebar section toggles (Starred, Channels, DMs)

```typescript
// Option A: Local state (simpler, no persistence)
export function ChannelSidebar() {
  const [starredOpen, setStarredOpen] = useState(true);
  const [channelsOpen, setChannelsOpen] = useState(true);
  const [dmsOpen, setDmsOpen] = useState(true);

  return (
    <SidebarSection
      isOpen={starredOpen}
      onToggle={() => setStarredOpen(!starredOpen)}
    >
      {/* Content */}
    </SidebarSection>
  );
}

// Option B: Zustand (persistent across sessions)
const useSidebarStore = create(
  persist(
    (set) => ({
      sidebarCollapse: {
        starred: true,
        channels: true,
        dms: true,
      },
      toggleSection: (section) =>
        set((state) => ({
          sidebarCollapse: {
            ...state.sidebarCollapse,
            [section]: !state.sidebarCollapse[section],
          },
        })),
    }),
    { name: 'sidebar-preferences' }
  )
);

// Usage
export function ChannelSidebar() {
  const { sidebarCollapse, toggleSection } = useSidebarStore();

  return (
    <SidebarSection
      isOpen={sidebarCollapse.starred}
      onToggle={() => toggleSection('starred')}
    >
      {/* Content */}
    </SidebarSection>
  );
}
```

**Recommendation**: Use **local state** for temporary UI toggles, **Zustand** for cross-session preferences.

---

### Pattern 2: Right Panel State

**Current Implementation** (working well):

```typescript
// store/index.ts
export type RightPanelView = 'thread' | 'members' | 'channel-info' | null;

export interface AppStore {
  rightPanelView: RightPanelView;
  setRightPanelView: (view: RightPanelView) => void;
}

// Usage
export function RightPanel() {
  const rightPanelView = useAppStore((s) => s.rightPanelView);

  if (!rightPanelView) return null;

  return (
    <div className="animate-in slide-in-from-right-5">
      {rightPanelView === 'thread' && <ThreadPanel />}
      {rightPanelView === 'members' && <MemberList />}
      {rightPanelView === 'channel-info' && <ChannelInfo />}
    </div>
  );
}
```

**Enhancement**: Add history/navigation stack

```typescript
// Store enhanced for breadcrumb navigation
export interface AppStore {
  rightPanelStack: RightPanelView[];
  pushRightPanel: (view: RightPanelView) => void;
  popRightPanel: () => void;
  clearRightPanel: () => void;
}

export const useAppStore = create((set, get) => ({
  rightPanelStack: [],

  pushRightPanel: (view) =>
    set((state) => ({
      rightPanelStack: [...state.rightPanelStack, view],
    })),

  popRightPanel: () =>
    set((state) => ({
      rightPanelStack: state.rightPanelStack.slice(0, -1),
    })),

  clearRightPanel: () =>
    set({ rightPanelStack: [] }),
}));

// Usage: Click "Back" button
<button onClick={() => useAppStore.getState().popRightPanel()}>
  Back
</button>
```

---

### Pattern 3: Sidebar Mobile State

**For**: Mobile sidebar toggle with backdrop

```typescript
// ✅ GOOD: Simple boolean in Zustand
export interface AppStore {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

// Usage
export function Sidebar() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar with animation */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 lg:static transition-transform duration-200',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Content */}
      </aside>
    </>
  );
}

// Auto-close on mobile navigation
const router = useRouter();
const handleChannelClick = (channel) => {
  router.push(`/${workspaceSlug}/channel/${channel.id}`);
  useAppStore.getState().setSidebarOpen(false); // Close on mobile
};
```

---

### Pattern 4: Search/Command Palette State

**For**: Cmd+K modal visibility

```typescript
export interface AppStore {
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
}

// Global keyboard handler
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      useAppStore.setState((state) => ({
        searchOpen: !state.searchOpen,
      }));
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, []);
```

---

## Advanced: Store Composition

### Split Store by Domain

```typescript
// ❌ PROBLEMATIC: 294 lines, 40+ actions in single store
export const useAppStore = create<AppStore>((set) => ({
  // UI, data, auth, messages, threads, presence, typing, etc.
}));

// ✅ RECOMMENDED: Domain-specific stores
export const useUIStore = create((set) => ({
  sidebarOpen: true,
  rightPanelView: null,
  searchOpen: false,
  // UI-only actions
}));

export const useDataStore = create((set) => ({
  channels: [],
  currentChannel: null,
  starredChannels: [],
  // Data-only actions
}));

export const usePresenceStore = create((set) => ({
  presenceMap: {},
  typingByChannel: {},
  // Presence actions
}));

// Usage
export function Sidebar() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const channels = useDataStore((s) => s.channels);
  const presenceMap = usePresenceStore((s) => s.presenceMap);
}
```

**Trade-offs**:
- ✅ Easier to test
- ✅ Smaller subscriptions per component
- ✅ Clearer separation of concerns
- ❌ More boilerplate
- ❌ Cross-store coordination harder

**Recommendation**: Keep current single store for now (it's well-structured), refactor to multi-store if it grows beyond 400 lines.

---

## Performance Optimization

### Selector Functions

```typescript
// Create reusable selectors at module level
// (prevents redefinition on every render)

export const selectSidebarUI = (state: AppStore) => ({
  sidebarOpen: state.sidebarOpen,
  sidebarExpanded: state.sidebarExpanded,
});

export const selectStarredChannels = (state: AppStore) =>
  state.channels.filter((ch) => state.starredChannels.includes(ch.id));

export const selectChannelsByWorkspace = (workspaceId: string) =>
  (state: AppStore) =>
    state.channels.filter((ch) => ch.workspaceId === workspaceId);

// Usage
function Sidebar() {
  const ui = useAppStore(selectSidebarUI); // Shallow equality check
  const starred = useAppStore(selectStarredChannels);
  return <></>;
}
```

### Shallow Equality

```typescript
// Zustand uses shallow equality by default
const store = useAppStore(
  (state) => ({
    sidebarOpen: state.sidebarOpen,
    rightPanelView: state.rightPanelView,
  })
  // Re-renders only if sidebarOpen or rightPanelView changes
);

// To force deep equality (rare):
import { useShallow } from 'zustand/react';

const store = useAppStore(
  useShallow((state) => ({
    channels: state.channels,
    // Re-renders only if channels array reference changes
  }))
);
```

---

## Testing Patterns

### Unit Tests with Zustand

```typescript
import { renderHook, act } from '@testing-library/react';
import { useAppStore } from '@/store';

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useAppStore.setState({
      sidebarOpen: false,
      channels: [],
    });
  });

  test('toggles sidebar open', () => {
    const { result } = renderHook(() => useAppStore());

    act(() => {
      result.current.setSidebarOpen(true);
    });

    expect(result.current.sidebarOpen).toBe(true);
  });

  test('selects channel and closes sidebar on mobile', () => {
    const { result } = renderHook(() => useAppStore());

    act(() => {
      result.current.setCurrentChannel({ id: '1', name: 'general' });
      result.current.setSidebarOpen(false);
    });

    expect(result.current.currentChannel?.id).toBe('1');
    expect(result.current.sidebarOpen).toBe(false);
  });
});
```

---

## Checklist for New Sidebar Features

- [ ] Define state shape (minimal, immutable)
- [ ] Create actions (batch if possible)
- [ ] Create selectors (at module level)
- [ ] Use in components (subscribe to specific keys)
- [ ] Add tests (RTL + zustand renderHook)
- [ ] Profile store updates (React DevTools)
- [ ] Document in MEMORY.md

---

## Summary

| Pattern | Use Case | Store Type | Persistence |
|---------|----------|-----------|-------------|
| Sidebar mobile toggle | `sidebarOpen` | Zustand boolean | Ephemeral |
| Section collapse | `sidebarCollapse` | Zustand object | Can persist |
| Right panel view | `rightPanelView` | Zustand enum | Ephemeral |
| Search modal | `searchOpen` | Zustand boolean | Ephemeral |
| Channel sort order | `channelSortBy` | Zustand string | Persistent |
| Compact mode | `compactMode` | Zustand boolean | Persistent |
| Section local state | Toggle animation | React useState | Ephemeral |

---

**Last Updated**: 2026-02-28
**Recommended Store Size**: < 400 lines
**Current Status**: 294 lines ✅ Good
