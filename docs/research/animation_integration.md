# Framer Motion Animation Integration Strategy

## RECOMMENDATION

**Use Framer Motion v11 (latest 2025) with a hybrid approach**: Keep tailwindcss-animate for simple state-based animations (dialogs, dropdowns, sheets), adopt Framer Motion only for enhanced component interactions, list animations, and complex gesture-driven animations. This maintains simplicity while adding sophisticated animation capabilities.

---

## Why This Approach

### Current State Analysis
- **Existing animations**: Dialog, Sheet, Dropdown use `data-[state=open]:animate-in` classes (tailwindcss-animate)
- **Virtual scrolling**: MessageList uses react-virtuoso v4.18.1 for performance
- **Pattern**: Radix UI primitives (with 'use client') wrapped by shadcn/ui components
- **Stack**: Next.js 14.2 (App Router), React 18.3, Tailwind 3.4

### Why Hybrid Approach Works
1. **Zero breaking changes**: Existing animations work as-is
2. **Progressive enhancement**: Add Framer Motion where it adds real value
3. **Performance**: Avoid overcomplicating simple animations
4. **React-Virtuoso compatibility**: Framer Motion AnimatePresence works with virtuoso when properly configured

---

## INSTALLATION

```bash
npm install framer-motion@11.0.8
```

Or with yarn/bun:
```bash
yarn add framer-motion@11.0.8
bun add framer-motion@11.0.8
```

**Verify installation**:
```bash
npm ls framer-motion
```

---

## CORE PATTERNS

### Pattern 1: Wrapping Existing shadcn/ui Components (NO CHANGES)

**Do NOT modify existing shadcn/ui components**. Keep using tailwindcss-animate for:
- Dialog animations
- Sheet animations
- Dropdown menu animations
- Skeleton components

These work perfectly with Radix UI's built-in animation hooks.

**Example**: Dialog.tsx already has optimal animations:
```tsx
// ✅ KEEP AS-IS - DO NOT MODIFY
<DialogPrimitive.Content
  className={cn(
    '...duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out...'
  )}
/>
```

---

### Pattern 2: Framer Motion for List Item Animations

**Best use case**: MessageList where items are being added/removed in real-time via Socket.IO

**Location**: `messages/components/MessageItem.tsx`

**Approach**: Wrap MessageItem with Framer Motion without modifying MessageItem component

```tsx
// In MessageList.tsx - wrap the item rendering
import { motion, AnimatePresence } from 'framer-motion';

export function MessageList({ channelId, ...props }: MessageListProps) {
  // ... existing code ...

  return (
    <div className="relative h-full">
      <GroupedVirtuoso
        // ... existing props ...
        itemContent={(index) => {
          const arrayIndex = index - firstItemIndex;
          const message = messages[arrayIndex];
          if (!message) return null;

          // ✅ Wrap with motion.div but DON'T modify MessageItem
          return (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {unreadIndex !== null && arrayIndex === unreadIndex && <UnreadLine />}
              <MessageItem
                message={message}
                previousMessage={previousMessage}
                currentUserId={currentUserId}
                channelName={channelName}
              />
            </motion.div>
          );
        }}
      />
    </div>
  );
}
```

---

### Pattern 3: AnimatePresence + react-virtuoso (CRITICAL)

**⚠️ IMPORTANT**: AnimatePresence does NOT work well with virtual scrolling by default.

**Solution**: Use AnimatePresence ONLY for completely unmounted items, not virtualized items.

```tsx
// ❌ DO NOT DO THIS
<AnimatePresence>
  <GroupedVirtuoso ... />
</AnimatePresence>

// ✅ DO THIS: AnimatePresence inside item renderer
<GroupedVirtuoso
  itemContent={(index) => (
    <AnimatePresence mode="wait">
      <motion.div key={message.id} {...} >
        <MessageItem />
      </motion.div>
    </AnimatePresence>
  )}
/>
```

**Why**: Virtual scrolling unmounts/mounts items frequently. AnimatePresence outside the list won't track these properly. Put AnimatePresence at the item level or around items you're adding via Socket.IO that aren't virtualized.

---

### Pattern 4: LazyMotion at Layout Level (OPTIMIZATION)

**Location**: `app/layout.tsx`

**Purpose**: Reduce initial JS bundle size by lazy-loading Framer Motion features

```tsx
'use client';

import { LazyMotion, domAnimation } from 'framer-motion';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/providers/theme-provider';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {/* Wrap all animated content with LazyMotion */}
          <LazyMotion features={domAnimation}>
            {children}
          </LazyMotion>
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

**Benefits**:
- Reduces initial bundle by ~40% (Framer Motion is ~26KB gzipped)
- domAnimation features are still available (most common animations)
- Lazy-loads only when a motion component is actually rendered

---

### Pattern 5: Wrapping Toast Notifications (Sonner)

**Current state**: Sonner is already animation-optimized

**Enhanced approach**: Add custom Framer Motion wrapper for specific toast types

```tsx
// components/ui/motion-toast.tsx
'use client';

import { motion } from 'framer-motion';
import { toast } from 'sonner';

export function showMotionToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  // Sonner handles animations, but we can add custom motion to container
  toast(message, {
    className: 'motion-toast',
    duration: 4000,
  });
}

// For custom UI that needs Framer Motion:
export const MotionToastContent = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 20 }}
    transition={{ duration: 0.2 }}
  >
    {children}
  </motion.div>
);
```

**Keep as-is**: Default Sonner Toaster in layout.tsx works great with its own animations.

---

### Pattern 6: Enhanced Skeleton Loading

**Current**: Basic `animate-pulse` in Skeleton component

**Enhanced approach**: Add Framer Motion variants for more control

```tsx
// components/ui/skeleton.tsx
'use client';

import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';

function Skeleton({
  className,
  animated = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { animated?: boolean }) {
  // Keep tailwindcss-animate for simple case
  if (!animated) {
    return (
      <div
        className={cn('animate-pulse rounded-md bg-primary/10', className)}
        {...props}
      />
    );
  }

  // Or use Framer Motion for consistent timing
  return (
    <motion.div
      className={cn('rounded-md bg-primary/10', className)}
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity }}
      {...props}
    />
  );
}

export { Skeleton };
```

---

### Pattern 7: Create client/animations.ts Module (REUSABLE)

**Location**: `client/animations.ts` (create if doesn't exist)

**Purpose**: Centralized animation variants for consistency

```tsx
// client/animations.ts
import { Variants } from 'framer-motion';

export const fadeInOut: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 },
};

export const slideInUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 20 },
  transition: { duration: 0.3 },
};

export const slideInDown: Variants = {
  initial: { opacity: 0, y: -20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.3 },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
  transition: { duration: 0.2 },
};

// Stagger variants for lists
export const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2 },
  },
};
```

**Usage**:
```tsx
import { slideInUp, containerVariants, itemVariants } from '@/client/animations';

<motion.div variants={containerVariants} initial="hidden" animate="visible">
  {items.map((item) => (
    <motion.div key={item.id} variants={itemVariants}>
      {item.content}
    </motion.div>
  ))}
</motion.div>
```

---

## COMPONENT-BY-COMPONENT STRATEGY

### Components That Keep Current Animations (tailwindcss-animate)
✅ Dialog (`components/ui/dialog.tsx`)
✅ Sheet (`components/ui/sheet.tsx`)
✅ DropdownMenu (`components/ui/dropdown-menu.tsx`)
✅ Popover (`components/ui/popover.tsx`)
✅ Tooltip (`components/ui/tooltip.tsx`)
✅ Skeleton (`components/ui/skeleton.tsx`) - basic version
✅ Sonner Toaster

**Reason**: Radix UI handles these perfectly with data-state attributes. Framer Motion would add unnecessary complexity.

### Components To Enhance with Framer Motion
🚀 MessageList → Item animations when added/removed via Socket.IO
🚀 MessageItem → Hover animations, reaction animations
🚀 SearchModal → Staggered result animations
🚀 WorkspaceSwitcher → Menu animations
🚀 ThreadPanel → Messages entrance animations
🚀 Modal dialogs with custom content → Enhanced transitions
🚀 Loading states → Better skeleton animations

---

## React-Virtuoso + Framer Motion: CRITICAL GOTCHAS

### ❌ Problem: AnimatePresence Doesn't Track Virtual Unmounts

Virtual scrolling unmounts items without triggering React's standard unmount lifecycle.

### ✅ Solution #1: Key-based Animation

```tsx
<GroupedVirtuoso
  itemContent={(index) => {
    const message = messages[arrayIndex];
    return (
      // Key on message ID ensures same element gets same animation key
      <motion.div
        key={`message-${message.id}`}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <MessageItem message={message} />
      </motion.div>
    );
  }}
/>
```

### ✅ Solution #2: Animate Only Newly Added Items

Track which messages are new, animate only those:

```tsx
const newMessageIds = useRef<Set<string>>(new Set());

// When message is added via socket
useEffect(() => {
  newMessageIds.current.add(message.id);
  setTimeout(() => newMessageIds.current.delete(message.id), 500);
}, [message]);

// In item renderer
<motion.div
  initial={newMessageIds.current.has(message.id) ? { opacity: 0, y: 10 } : false}
  animate={{ opacity: 1, y: 0 }}
>
```

### ✅ Solution #3: Separate Animated Container for New Messages

For unread notifications, use AnimatePresence outside the virtual list:

```tsx
// Separate list for newly arrived messages (not virtualized)
<AnimatePresence>
  {newMessages.map((msg) => (
    <motion.div
      key={msg.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <NewMessageAlert message={msg} />
    </motion.div>
  ))}
</AnimatePresence>

// Main virtualized list (no AnimatePresence)
<GroupedVirtuoso itemContent={(index) => <MessageItem />} />
```

---

## 'use client' Directive Requirements

### Required for Framer Motion Components

```tsx
'use client';

import { motion, AnimatePresence } from 'framer-motion';

// ✅ All motion components need 'use client'
export function AnimatedComponent() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      Content
    </motion.div>
  );
}
```

### Current Project Status
✅ `dialog.tsx` - already has 'use client'
✅ `sheet.tsx` - already has 'use client'
✅ `dropdown-menu.tsx` - already has 'use client'
✅ `sonner.tsx` - already has 'use client'
✅ `messages/components/MessageItem.tsx` - already has 'use client'
✅ `messages/components/MessageList.tsx` - already has 'use client'

**No additional 'use client' directives needed** - interactive components already marked.

---

## INTEGRATION CHECKLIST

### Phase 1: Setup (Non-Breaking)
- [ ] Install framer-motion@11.0.8
- [ ] Add LazyMotion wrapper to `app/layout.tsx`
- [ ] Create `client/animations.ts` with variant presets
- [ ] Update tailwind.config.ts if adding custom animation durations

### Phase 2: Enhance Existing Features (Low Risk)
- [ ] Add message item entrance animations to MessageList
- [ ] Enhance Skeleton component with Framer Motion variant
- [ ] Add reaction animations to ReactionBar
- [ ] Animate new unread badge

### Phase 3: New Interactive Animations (Medium Risk)
- [ ] Staggered animations for SearchModal results
- [ ] WorkspaceSwitcher menu animations
- [ ] ThreadPanel entrance animations
- [ ] Modal dialog content animations

### Phase 4: Advanced (Higher Risk - Do Last)
- [ ] Gesture animations (drag/swipe on mobile)
- [ ] Page transition animations
- [ ] Complex sequenced animations

---

## TESTING STRATEGY

### Before deploying animations:

```bash
# 1. Bundle size check
npm run build

# 2. Visual regression (compare before/after screenshots)
# Use tools like Percy.io or manual testing

# 3. Performance profiling
# React DevTools Profiler: Check if animations cause re-renders
# Chrome DevTools: Check frame rate (aim for 60fps)

# 4. Virtual scrolling test
# Scroll MessageList with animations enabled
# Check for jank or dropped frames
```

### React DevTools Profiler Setup

```tsx
// Wrap animated component for profiling
<Profiler id="MessageList" onRender={onRenderCallback}>
  <MessageList />
</Profiler>
```

---

## ALTERNATIVES CONSIDERED

### 1. React Spring (@react-spring/web)
**Why NOT chosen**: Heavier learning curve, less suitable for UI animations where Framer Motion excels

### 2. Tailwindcss-animate Only
**Why NOT sufficient**: Limited for complex gestures, interactive animations, staggered lists

### 3. CSS Animations Only
**Why NOT sufficient**: Harder to orchestrate complex sequences, no built-in gesture support

### 4. Full Framer Motion Migration
**Why NOT chosen**: Would require rewriting working animations, introduces breaking changes, adds unnecessary complexity

---

## PERFORMANCE CONSIDERATIONS

### Bundle Size Impact
```
framer-motion@11: ~26KB gzipped
With LazyMotion: ~16KB lazy-loaded (40% reduction)
```

### Animation Best Practices
1. **Prefer `transform` and `opacity`** (GPU accelerated)
2. **Avoid animating `width`, `height`, `top`, `left`** (CPU intensive)
3. **Use `willChange` CSS for heavy animations** (in tailwindcss-animate)
4. **Test on low-end devices** (Lighthouse throttling)

### Example: Optimized Animation
```tsx
// ✅ GOOD - uses transform (GPU accelerated)
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
/>

// ❌ BAD - animates layout properties
<motion.div
  initial={{ opacity: 0, height: 0 }}
  animate={{ opacity: 1, height: 'auto' }}
/>
```

---

## FILES TO MODIFY (Phase 1)

### 1. `app/layout.tsx`
Add LazyMotion wrapper:
```tsx
import { LazyMotion, domAnimation } from 'framer-motion';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <ThemeProvider>
          <LazyMotion features={domAnimation}>
            {children}
          </LazyMotion>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

### 2. Create `client/animations.ts`
New file with animation presets

### 3. `messages/components/MessageList.tsx` (Optional Phase 2)
Wrap MessageItem in motion.div

---

## RESOURCES

- **Framer Motion Docs**: https://www.framer.com/motion/
- **React-Virtuoso + Animations**: Handle with `key` prop strategy
- **Radix UI + Framer**: Keep Radix for primitives, Framer for enhancements
- **Next.js 14 Animation Guide**: https://nextjs.org/docs/guides/animations

---

## Summary Table

| Component | Current | Recommendation | Effort | Risk |
|-----------|---------|-----------------|--------|------|
| Dialog | Tailwind animate | Keep as-is | 0 | None |
| Sheet | Tailwind animate | Keep as-is | 0 | None |
| DropdownMenu | Tailwind animate | Keep as-is | 0 | None |
| Skeleton | animate-pulse | Optional: Framer Motion variant | 1hr | Low |
| MessageList | Virtuoso + Loader2 | Add item entrance animations | 2hrs | Low |
| MessageItem | Static | Add hover/reaction animations | 3hrs | Medium |
| SearchModal | Static | Add staggered results animation | 2hrs | Low |
| Custom Modals | Custom CSS | Framer Motion transitions | 2-4hrs | Medium |

**Total estimated effort**: 8-12 hours for full Phase 1-2 integration

