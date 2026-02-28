# Virtualized Message List Library Research

## RECOMMENDATION

**Use `react-virtuoso` v4.x (free tier) for this project.**

> Use `react-virtuoso` version `4.18.1` because it is the only library in this comparison with native support for all Slack-like chat requirements: automatic variable-height measurement, built-in `followOutput` for bottom-anchored scrolling, `GroupedVirtuoso` for sticky date separators, `firstItemIndex` for prepend-without-jump, and `atBottomStateChange` for new-message indicators — all without writing custom scroll logic.

## INSTALLATION

```bash
npm install react-virtuoso@4.18.1
```

---

## FEATURE MATRIX

| Feature | react-virtuoso | @tanstack/react-virtual | react-window v2 | react-virtualized |
|---|---|---|---|---|
| Variable heights (auto) | ✅ Native, zero config | ⚠️ Manual `measureElement` | ⚠️ `useDynamicRowHeight` hook | ❌ `CellMeasurer` (fragile) |
| Follow-output / bottom-anchor | ✅ `followOutput` prop | ❌ Manual implementation | ❌ Manual implementation | ❌ Manual implementation |
| Prepend without scroll jump | ✅ `firstItemIndex` trick | ❌ Fragile delta-compensation | ❌ Fragile delta-compensation | ❌ Very fragile with CellMeasurer |
| Sticky date separators | ✅ `GroupedVirtuoso` built-in | ⚠️ Manual `rangeExtractor` | ❌ CSS workaround only | ❌ CSS workaround only |
| New-message indicator | ✅ `atBottomStateChange` hook | ❌ Fully manual | ❌ Fully manual | ❌ Fully manual |
| Scroll-to-bottom API | ✅ `scrollToIndex({index:'LAST'})` | ⚠️ `scrollToIndex(n)` | ⚠️ `scrollToItem(n, 'end')` | ⚠️ `scrollToRow(n)` |
| React 19 compatible | ✅ Yes | ✅ Yes | ✅ Yes | ❓ Unverified |
| Bundle size (min+gz) | ~15 KB | ~4 KB | ~6 KB | ~100+ KB |
| Maintenance status | Active | Very Active | Active | **Stale** |
| Chat-specific APIs | **High** | Low | Low | Very Low |
| Ease of use for chat | **High** | Low | Medium | Low |
| Weekly downloads | ~1.8M | ~9.8M | ~4.5M | ~1.4M (legacy) |

---

## USAGE EXAMPLE

### Basic Chat List with Auto-Scroll

```tsx
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { useRef, useState, useCallback } from 'react';

interface Message {
  id: string;
  content: string;
  author: string;
  timestamp: string;
}

function ChatMessageList({ messages }: { messages: Message[] }) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unseenCount, setUnseenCount] = useState(0);

  const handleNewMessage = useCallback(() => {
    if (!atBottom) {
      setUnseenCount(prev => prev + 1);
    }
  }, [atBottom]);

  const scrollToBottom = () => {
    virtuosoRef.current?.scrollToIndex({
      index: messages.length - 1,
      behavior: 'smooth',
    });
    setUnseenCount(0);
  };

  return (
    <div style={{ position: 'relative', height: '600px' }}>
      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        followOutput={(isAtBottom) => isAtBottom ? 'smooth' : false}
        atBottomStateChange={(isAtBottom) => {
          setAtBottom(isAtBottom);
          if (isAtBottom) setUnseenCount(0);
        }}
        itemContent={(index, message) => (
          <div style={{ padding: '8px 16px' }}>
            <strong>{message.author}</strong>
            <span style={{ marginLeft: 8, color: '#888', fontSize: 12 }}>
              {message.timestamp}
            </span>
            <p style={{ margin: '4px 0 0' }}>{message.content}</p>
          </div>
        )}
      />

      {/* Scroll-to-bottom button with unread count */}
      {!atBottom && (
        <button
          onClick={scrollToBottom}
          style={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            borderRadius: '50%',
            width: 40,
            height: 40,
          }}
        >
          {unseenCount > 0 ? unseenCount : '↓'}
        </button>
      )}
    </div>
  );
}
```

### Prepending Older Messages Without Scroll Jump

```tsx
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { useRef, useState } from 'react';

const INITIAL_INDEX = 1_000_000; // Start at a large virtual index

function ChatWithHistory({ initialMessages }: { initialMessages: Message[] }) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [messages, setMessages] = useState(initialMessages);
  const [firstItemIndex, setFirstItemIndex] = useState(INITIAL_INDEX);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  const loadOlderMessages = async () => {
    if (isLoadingOlder) return;
    setIsLoadingOlder(true);
    try {
      const olderMessages = await fetchOlderMessages(messages[0].id);
      setFirstItemIndex(prev => prev - olderMessages.length);
      setMessages(prev => [...olderMessages, ...prev]);
    } finally {
      setIsLoadingOlder(false);
    }
  };

  return (
    <Virtuoso
      ref={virtuosoRef}
      style={{ height: '600px' }}
      firstItemIndex={firstItemIndex}
      initialTopMostItemIndex={initialMessages.length - 1}
      data={messages}
      startReached={loadOlderMessages}
      followOutput="smooth"
      components={{
        Header: () => isLoadingOlder ? <div>Loading older messages...</div> : null,
      }}
      itemContent={(index, message) => (
        <div style={{ padding: '8px 16px' }}>
          <strong>{message.author}</strong>: {message.content}
        </div>
      )}
    />
  );
}
```

### Sticky Date Separators with GroupedVirtuoso

```tsx
import { GroupedVirtuoso } from 'react-virtuoso';

interface GroupedMessages {
  dates: string[];           // ['Today', 'Yesterday', 'Monday']
  groupCounts: number[];     // [5, 12, 8] — messages per date group
  messages: Message[];       // flat list of all messages
}

function ChatWithDateSeparators({ data }: { data: GroupedMessages }) {
  return (
    <GroupedVirtuoso
      style={{ height: '600px' }}
      groupCounts={data.groupCounts}
      followOutput="smooth"
      groupContent={(index) => (
        <div
          style={{
            background: '#f5f5f5',
            padding: '4px 16px',
            fontSize: 12,
            fontWeight: 600,
            color: '#666',
            textAlign: 'center',
            position: 'sticky',
            top: 0,
            zIndex: 1,
          }}
        >
          {data.dates[index]}
        </div>
      )}
      itemContent={(index) => (
        <div style={{ padding: '8px 16px' }}>
          <strong>{data.messages[index].author}</strong>: {data.messages[index].content}
        </div>
      )}
    />
  );
}
```

### New-Message Indicator Line

```tsx
import { Virtuoso } from 'react-virtuoso';
import { useState, useRef } from 'react';

function ChatWithUnreadLine({
  messages,
  unreadFromIndex,
}: {
  messages: Message[];
  unreadFromIndex: number | null;
}) {
  const [atBottom, setAtBottom] = useState(true);

  return (
    <Virtuoso
      style={{ height: '600px' }}
      data={messages}
      followOutput={(isAtBottom) => isAtBottom ? 'smooth' : false}
      atBottomStateChange={setAtBottom}
      itemContent={(index, message) => (
        <>
          {/* Render "New Messages" indicator before first unread */}
          {index === unreadFromIndex && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '4px 16px',
                color: '#e53e3e',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <div style={{ flex: 1, height: 1, background: '#e53e3e', marginRight: 8 }} />
              New Messages
              <div style={{ flex: 1, height: 1, background: '#e53e3e', marginLeft: 8 }} />
            </div>
          )}
          <div style={{ padding: '8px 16px' }}>
            <strong>{message.author}</strong>: {message.content}
          </div>
        </>
      )}
    />
  );
}
```

---

## INTEGRATION NOTES

### Project-Specific Configuration

This project uses a FastAPI backend with WebSocket or polling for real-time messages. Connect react-virtuoso to the existing API like this:

```tsx
// Integration with existing backend API structure
import { Virtuoso } from 'react-virtuoso';

function ChannelMessageList({ channelId }: { channelId: string }) {
  const [messages, setMessages] = useState<AlertRecord[]>([]);
  const [firstItemIndex, setFirstItemIndex] = useState(1_000_000);
  const [hasMore, setHasMore] = useState(true);

  // Load older messages when user scrolls to top
  const loadOlderMessages = async () => {
    if (!hasMore || messages.length === 0) return;
    const cursor = messages[0].id;
    const res = await fetch(`/api/alerts?before=${cursor}&limit=50`);
    const older = await res.json();
    if (older.length < 50) setHasMore(false);
    setFirstItemIndex(prev => prev - older.length);
    setMessages(prev => [...older, ...prev]);
  };

  return (
    <Virtuoso
      style={{ height: '100%' }}
      firstItemIndex={firstItemIndex}
      initialTopMostItemIndex={messages.length - 1}
      data={messages}
      startReached={hasMore ? loadOlderMessages : undefined}
      followOutput="smooth"
      itemContent={(_, alert) => <AlertMessage alert={alert} />}
    />
  );
}
```

### `followOutput` Behavior Options

```tsx
// Always auto-scroll to newest message
followOutput={true}

// Smooth auto-scroll only when already at bottom (Slack behavior)
followOutput={(isAtBottom) => isAtBottom ? 'smooth' : false}

// Always smooth-scroll to bottom
followOutput="smooth"
```

### TypeScript Support
react-virtuoso ships with full TypeScript definitions. No `@types/` package needed.

```tsx
import { Virtuoso, VirtuosoHandle, GroupedVirtuoso } from 'react-virtuoso';
// VirtuosoHandle gives you: scrollToIndex, scrollTo, scrollBy, autoscrollToBottom
```

---

## ALTERNATIVES CONSIDERED

### @tanstack/react-virtual v3.13.19
- **Stars:** 6,700 | **Bundle:** ~4 KB | **Downloads:** ~9.8M/week
- **Verdict:** Excellent general-purpose virtualizer but a poor fit for chat. It is a headless utility with no component layer — you write all scroll position logic, bottom-anchor behavior, and sticky headers yourself. A GitHub discussion (#477, still open as of Feb 2025) confirms bidirectional chat loading is not well-supported. Best for data tables and append-only feeds.
- **Use if:** You need the smallest possible bundle and are building append-only (no prepend) virtualized lists.

### react-window v2.2.7
- **Stars:** 17,100 | **Bundle:** ~6 KB | **Downloads:** ~4.5M/week
- **Verdict:** The v2 rewrite added a `useDynamicRowHeight` hook that significantly improves variable height handling. However, it still lacks native `followOutput`, sticky group headers, and prepend-without-jump. You build these yourself. Maintained by Brian Vaughn (ex-React core team).
- **Use if:** Bundle size is critical (6 KB) and you're comfortable writing 100–200 lines of custom scroll logic for chat behaviors.

### react-virtualized v9.22.6
- **Stars:** 27,100 (legacy) | **Bundle:** ~100+ KB | **Downloads:** ~1.4M/week
- **Verdict:** **Do not use for new projects.** The library is effectively stale with no meaningful updates in over a year. Its own README recommends react-window as an alternative. The `CellMeasurer` API for dynamic heights is notoriously fragile with async content (images, media). React 19 compatibility is unverified.
- **Use if:** You are maintaining an existing codebase that already depends on it and cannot migrate.

### VirtuosoMessageList (paid tier of react-virtuoso)
- **Cost:** ~$168/developer/year
- **Verdict:** The only library specifically engineered for bidirectional chat. Adds clean imperative API: `prepend(items)`, `append(items)`, `autoscrollToBottom()`, streaming message support. If budget allows and this is a core product feature, worth evaluating.
- **Use if:** `firstItemIndex` approach proves unreliable under high message volume or rapid prepend operations.

---

## KNOWN CAVEATS WITH react-virtuoso

1. **`firstItemIndex` complexity:** The prepend approach using a virtual index offset (starting at 1,000,000) is unconventional. It works but can have edge cases with rapid consecutive prepend operations. Test thoroughly with your API pagination.

2. **Image/media height flicker:** When messages contain images with unknown dimensions, there can be a brief scroll position jump as images load and get measured by ResizeObserver. Mitigate with CSS `min-height` on image containers or skeleton loaders.

3. **SSR/Next.js:** react-virtuoso is a client-only library. Wrap in `dynamic(() => import('...'), { ssr: false })` in Next.js.

4. **Paid tier for advanced chat:** The free `Virtuoso` component covers ~90% of chat use cases. The remaining 10% (AI streaming messages, very high-frequency updates) requires `VirtuosoMessageList`.

---

## SOURCES

- [react-virtuoso GitHub](https://github.com/petyosi/react-virtuoso)
- [react-virtuoso npm](https://www.npmjs.com/package/react-virtuoso)
- [react-virtuoso Prepend Items Docs](https://virtuoso.dev/prepend-items/)
- [react-virtuoso GroupedList Docs](https://virtuoso.dev/grouped-list/)
- [VirtuosoMessageList Pricing](https://virtuoso.dev/pricing/)
- [TanStack Virtual GitHub](https://github.com/TanStack/virtual)
- [TanStack Virtual Chat Discussion #477](https://github.com/TanStack/virtual/discussions/477)
- [TanStack Virtual Dynamic Heights Issue #832](https://github.com/TanStack/virtual/issues/832)
- [react-window GitHub](https://github.com/bvaughn/react-window)
- [react-virtualized "Is it dead?" Issue #1810](https://github.com/bvaughn/react-virtualized/issues/1810)
- [npm trends comparison](https://npmtrends.com/@tanstack/virtual-core-vs-react-virtualized-vs-react-virtuoso-vs-react-window)
