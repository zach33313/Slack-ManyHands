# Animation Decision Matrix: When to Use Tailwindcss-Animate vs Framer Motion

## Quick Reference

| Scenario | Use | Why |
|----------|-----|-----|
| Dialog/Sheet/Dropdown appear/disappear | tailwindcss-animate | Radix UI data-state integration is perfect |
| Loading spinner (Loader2) | tailwindcss-animate | Simple, performant, CSS-only |
| Skeleton pulse | Either | Both work fine, tailwindcss-animate is simpler |
| Message enters list (Socket.IO) | Framer Motion | Needs coordination with virtuoso |
| Search results appear in stagger | Framer Motion | Requires animation sequencing |
| Hover effects on buttons | tailwindcss-animate | Simple group pseudo-class works |
| Gesture animations (drag/swipe) | Framer Motion | Requires motion hooks |
| Page transitions | Depends | Consider route change context |
| Floating action button (FAB) | Framer Motion | Allows complex entrance |
| Toast notifications | Depends | Sonner handles itself, wrapper can enhance |
| Reaction emoji bounce | Framer Motion | Needs spring physics |
| Unread badge pulse | Framer Motion | Coordination with parent motion |
| Form validation errors shake | Framer Motion | Requires shake keyframes |

---

## Decision Tree

```
Does the animation need to be coordinated
with component mount/unmount in a list?
    ├─ YES → Framer Motion
    └─ NO → Is it a simple state change (open/closed)?
        ├─ YES → tailwindcss-animate (Radix UI)
        └─ NO → Do you need spring physics or complex sequencing?
            ├─ YES → Framer Motion
            └─ NO → tailwindcss-animate
```

---

## Detailed Comparison

### 1. Dialog Opening/Closing

**Component**: `components/ui/dialog.tsx`

**Analysis**:
- Controlled by Radix UI's `data-[state=open/closed]` attribute
- Already has perfect tailwindcss-animate integration
- No Socket.IO or list coordination needed

**Decision**: ✅ **Keep tailwindcss-animate**

**Current code** (OPTIMAL):
```tsx
<DialogPrimitive.Content
  className={cn(
    'data-[state=open]:animate-in'
    'data-[state=closed]:animate-out'
    'data-[state=closed]:fade-out-0'
    'data-[state=open]:fade-in-0'
    'data-[state=closed]:zoom-out-95'
    'data-[state=open]:zoom-in-95'
    'data-[state=closed]:slide-out-to-left-1/2'
    'data-[state=open]:slide-in-from-left-1/2'
  )}
/>
```

**Why this is perfect**:
- Radix UI manages state automatically
- CSS classes apply instantly when state changes
- No JavaScript coordination needed
- Works with SSR
- ~0KB bundle cost (already have tailwindcss-animate)

---

### 2. Sheet (Sidebar) Animation

**Component**: `components/ui/sheet.tsx`

**Analysis**:
- Same as Dialog: Radix UI controlled
- Side-specific animations (slide from direction)
- No need for Framer Motion

**Decision**: ✅ **Keep tailwindcss-animate**

**Current code** (OPTIMAL):
```tsx
const sheetVariants = cva(
  'data-[state=open]:animate-in'
  'data-[state=closed]:animate-out'
  'data-[state=closed]:slide-out-to-left'
  'data-[state=open]:slide-in-from-left'
);
```

---

### 3. Dropdown Menu Animation

**Component**: `components/ui/dropdown-menu.tsx`

**Analysis**:
- Radix UI Portal + data-state driven
- Standard zoom + slide animation
- No complex orchestration needed

**Decision**: ✅ **Keep tailwindcss-animate**

**Current code** (OPTIMAL):
```tsx
<DropdownMenuPrimitive.Content
  className={cn(
    'data-[state=open]:animate-in'
    'data-[state=closed]:animate-out'
    'data-[state=closed]:zoom-out-95'
    'data-[state=open]:zoom-in-95'
    'data-[side=bottom]:slide-in-from-top-2'
  )}
/>
```

---

### 4. Skeleton Loading Pulse

**Component**: `components/ui/skeleton.tsx`

**Current code**:
```tsx
<div className="animate-pulse rounded-md bg-primary/10" />
```

**Analysis**:
- Simple, always-on animation
- No state coordination
- Either approach works equally well

**Decision**: ⚠️ **Keep tailwindcss-animate (for now)**

**Why**:
- Simpler code
- Already works
- Minimal bundle impact
- Can enhance later if needed

**When to upgrade to Framer Motion**:
- Want consistent timing across multiple skeletons
- Need to stagger skeleton animations
- Want different timing per skeleton type

**Enhanced version** (if needed):
```tsx
<motion.div
  className="rounded-md bg-primary/10"
  animate={{ opacity: [0.5, 1, 0.5] }}
  transition={{ duration: 1.5, repeat: Infinity }}
/>
```

---

### 5. MessageList Item Entrance

**Component**: `messages/components/MessageList.tsx`

**Current code** (static, no animation):
```tsx
<div>
  <MessageItem message={message} />
</div>
```

**Analysis**:
- Items added dynamically via Socket.IO
- Part of virtualized list (react-virtuoso)
- Needs coordination with virtual unmount/mount
- Not a simple state change

**Decision**: 🚀 **Use Framer Motion**

**Why Framer Motion is necessary**:
1. **Virtuoso coordination**: Virtual scrolling unmounts items without triggering React dismount
2. **Animation sequencing**: Multiple items entering simultaneously need per-item animation
3. **Complex mounting**: Item might already exist (prepended history) vs newly received (Socket.IO)
4. **Spring physics**: Can use `type: "spring"` for natural feel

**Implementation**:
```tsx
<motion.div
  key={`message-${message.id}`}
  initial={{ opacity: 0, y: -10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2 }}
>
  <MessageItem message={message} />
</motion.div>
```

**Why NOT tailwindcss-animate**:
- No `data-state` attribute available
- Manual control of mounting animation needed
- react-virtuoso doesn't trigger CSS state changes

---

### 6. Search Results Animation (Stagger)

**Component**: `search/components/SearchModal.tsx`

**Current code** (presumed static):
```tsx
<div className="space-y-2">
  {results.map((result) => (
    <SearchResultItem key={result.id} result={result} />
  ))}
</div>
```

**Analysis**:
- Multiple items entering at once
- Stagger effect makes UX feel snappier
- Not driven by Radix UI state
- Requires animation orchestration

**Decision**: 🚀 **Use Framer Motion**

**Why Framer Motion is necessary**:
1. **Stagger children**: Framer Motion has built-in `staggerChildren`
2. **Sequence control**: Each result enters at different time
3. **State-based enter**: Results change based on search input

**Implementation**:
```tsx
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

<motion.div
  variants={containerVariants}
  initial="hidden"
  animate="visible"
>
  {results.map((result) => (
    <motion.div key={result.id} variants={itemVariants}>
      <SearchResultItem result={result} />
    </motion.div>
  ))}
</motion.div>
```

**Why NOT tailwindcss-animate**:
- No built-in stagger mechanism
- Would need per-item delay classes (messy)
- Framer Motion designed exactly for this pattern

---

### 7. Button Hover Effects

**Component**: Various (e.g., `components/ui/button.tsx`)

**Current code**:
```tsx
<button className="hover:bg-primary/90 transition-colors" />
```

**Analysis**:
- Simple state change (hover)
- CSS pseudo-class driven
- No coordination needed

**Decision**: ✅ **Keep tailwindcss-animate** (or plain CSS)

**Why**:
- CSS `hover:` pseudo-class is perfect for this
- No JavaScript needed
- Instant response to user interaction
- More accessible (respects `prefers-reduced-motion`)

**Not recommended**:
```tsx
// ❌ Overkill - useHover hook would be needed
<motion.button
  whileHover={{ backgroundColor: '#...' }}
/>
```

---

### 8. Scroll-to-Bottom Button Appearance

**Component**: `messages/components/MessageList.tsx` (line 328)

**Current code**:
```tsx
{!isAtBottom && (
  <button>
    <ArrowDown />
  </button>
)}
```

**Analysis**:
- Simple conditional rendering
- Appears/disappears based on state
- Could be Framer Motion enhancement but not necessary

**Decision**: ⚠️ **Either approach works**

**Option A** (tailwindcss-animate + CSS):
```tsx
{!isAtBottom && (
  <button
    className="animate-in fade-in slide-in-from-bottom-4"
  >
    <ArrowDown />
  </button>
)}
```

**Option B** (Framer Motion - recommended):
```tsx
<AnimatePresence>
  {!isAtBottom && (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2 }}
    >
      <ArrowDown />
    </motion.button>
  )}
</AnimatePresence>
```

**Recommendation**: Use Framer Motion here because:
1. Exit animation (leaving is as important as entering)
2. Combined entrance + exit makes it feel responsive
3. Already using Framer Motion in MessageList

---

### 9. Toast Notifications

**Component**: `components/ui/sonner.tsx`

**Current code**:
```tsx
<Sonner
  toastOptions={{
    classNames: { ... }
  }}
/>
```

**Analysis**:
- Sonner handles its own animations
- Built-in with position transitions
- No state coordination needed

**Decision**: ✅ **Keep Sonner defaults**

**Why**:
- Sonner is optimized for toasts
- Has built-in entrance/exit animations
- No need to modify

**Enhancement** (optional):
```tsx
// If you need custom toast UI with Framer Motion:
export const MotionToastContent = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 20 }}
  >
    {children}
  </motion.div>
);

// Use in your components
toast(() => <MotionToastContent>...</MotionToastContent>);
```

---

### 10. Reaction Emoji Bounce

**Component**: `messages/components/ReactionBar.tsx`

**Current code** (presumed static):
```tsx
<button>
  👍 {count}
</button>
```

**Analysis**:
- Single-element animation
- Bounces when reaction added
- Needs spring physics for natural feel
- Not Radix UI controlled

**Decision**: 🚀 **Use Framer Motion**

**Why Framer Motion is necessary**:
1. **Spring physics**: `type: "spring"` gives natural bounce
2. **Gesture detection**: Can detect click and trigger bounce
3. **Keyframes**: Easy to define bounce sequence

**Implementation**:
```tsx
'use client';

import { motion } from 'framer-motion';

interface ReactionProps {
  emoji: string;
  count: number;
  onAdd: () => void;
}

export function Reaction({ emoji, count, onAdd }: ReactionProps) {
  const [isAdded, setIsAdded] = React.useState(false);

  const handleClick = () => {
    onAdd();
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 500);
  };

  return (
    <motion.button
      onClick={handleClick}
      animate={isAdded ? { scale: [1, 1.3, 1] } : { scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 20,
      }}
      className="flex items-center gap-1 rounded px-2 py-1 hover:bg-accent"
    >
      <span>{emoji}</span>
      <span className="text-sm">{count}</span>
    </motion.button>
  );
}
```

**Why NOT tailwindcss-animate**:
- Spring physics not available
- Would need complex CSS keyframes
- Framer Motion built for this

---

## Summary by Component Type

### Radix UI Primitives (Use tailwindcss-animate)
- Dialog
- Sheet
- Dropdown Menu
- Popover
- Tooltip
- Select
- Tabs (if using Radix)

**Reason**: Radix UI's `data-state` attribute is designed for this

---

### List Items (Use Framer Motion)
- MessageList items
- SearchModal results
- Channel list items
- Any dynamic list with add/remove

**Reason**: Need coordination with mounting/unmounting

---

### Simple CSS (Use tailwindcss-animate)
- Loading spinners
- Hover effects
- Basic loaders
- Skeleton pulses
- Transition-colors on buttons

**Reason**: CSS is simpler and performant

---

### Complex Interactions (Use Framer Motion)
- Bounce/spring animations
- Gesture animations
- Staggered lists
- Coordinated multi-element animations
- Animation sequences

**Reason**: Framer Motion designed for these patterns

---

## Bundle Size Impact

```
Base project: ~45KB gzipped

+ tailwindcss-animate: Already included (~2KB)
+ framer-motion@11 with LazyMotion: ~16KB lazy
  └─ Only loaded when motion component renders

Total impact: ~16KB (loaded on demand)
```

---

## Performance Checklist

When choosing between tailwindcss-animate and Framer Motion:

**Choose tailwindcss-animate if**:
- ✅ Animation is simple (fade, slide, zoom)
- ✅ Driven by CSS pseudo-class or data attribute
- ✅ No JavaScript state coordination needed
- ✅ Simplicity is a goal

**Choose Framer Motion if**:
- ✅ Need spring physics (`type: "spring"`)
- ✅ Coordinating multiple child animations
- ✅ Animation depends on JavaScript state
- ✅ Need gesture support
- ✅ Exit animation as important as enter
- ✅ List item animations with virtualization

---

## Migration Guidance

### Phase 1: Setup (No Changes)
- Install Framer Motion
- Add LazyMotion wrapper
- Keep all existing tailwindcss-animate

### Phase 2: Enhance (Additive)
- Add MessageList item animations
- Add scroll-to-bottom button animation
- Add search results stagger

### Phase 3: Advanced (Optional)
- Reaction emoji bounces
- Complex gesture animations
- Page transitions

---

## Resources

- **Tailwindcss-animate Docs**: https://www.npmjs.com/package/tailwindcss-animate
- **Framer Motion Docs**: https://www.framer.com/motion/
- **Radix UI + CSS Animation**: https://www.radix-ui.com/
