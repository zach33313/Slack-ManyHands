# Framer Motion Quick Start & Implementation Guide

## Quick Setup (5 minutes)

### 1. Install Package
```bash
npm install framer-motion@11.0.8
```

### 2. Update Root Layout

**File**: `app/layout.tsx`

```tsx
'use client';

import { LazyMotion, domAnimation } from 'framer-motion';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/providers/theme-provider';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

// Note: Metadata can't be in 'use client', so this needs to stay in a separate file
// See https://nextjs.org/docs/app/api-reference/file-conventions/layout#metadata

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

### 3. Create Animation Presets File

**File**: `client/animations.ts` (create new file)

```tsx
import { Variants } from 'framer-motion';

export const fadeInOut: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const slideInUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 20 },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

export const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};
```

---

## Real Component Examples

### Example 1: MessageList Item Animations

**File**: `messages/components/MessageList.tsx`

**Current code** (around line 303):
```tsx
itemContent={(index) => {
  const arrayIndex = index - firstItemIndex;
  const message = messages[arrayIndex];
  if (!message) return null;

  const previousMessage = arrayIndex > 0 ? messages[arrayIndex - 1] : null;

  return (
    <div>
      {unreadIndex !== null && arrayIndex === unreadIndex && <UnreadLine />}
      <MessageItem
        message={message}
        previousMessage={previousMessage}
        currentUserId={currentUserId}
        channelName={channelName}
      />
    </div>
  );
}}
```

**Enhanced with Framer Motion**:
```tsx
'use client';

import { motion } from 'framer-motion'; // Add this import
import { slideInUp } from '@/client/animations'; // Add this import

// In the GroupedVirtuoso itemContent:
itemContent={(index) => {
  const arrayIndex = index - firstItemIndex;
  const message = messages[arrayIndex];
  if (!message) return null;

  const previousMessage = arrayIndex > 0 ? messages[arrayIndex - 1] : null;

  return (
    <motion.div
      key={`message-${message.id}`}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
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
```

**What changed**:
1. Added motion import
2. Wrapped return value in `<motion.div>` with animation props
3. Added `key={message.id}` for proper React key tracking
4. Did NOT modify MessageItem component itself

---

### Example 2: Enhanced Skeleton Component

**File**: `components/ui/skeleton.tsx`

**Current code**:
```tsx
import { cn } from '@/shared/lib/utils';

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-primary/10', className)}
      {...props}
    />
  );
}

export { Skeleton };
```

**Enhanced with Framer Motion**:
```tsx
'use client';

import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Use Framer Motion animation (false for simple pulse) */
  animated?: boolean;
}

function Skeleton({
  className,
  animated = false,
  ...props
}: SkeletonProps) {
  // Simple version for basic skeletons
  if (!animated) {
    return (
      <div
        className={cn('animate-pulse rounded-md bg-primary/10', className)}
        {...props}
      />
    );
  }

  // Enhanced version with consistent timing
  return (
    <motion.div
      className={cn('rounded-md bg-primary/10', className)}
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
      {...props}
    />
  );
}

export { Skeleton };
```

**Usage**:
```tsx
// Basic (existing behavior)
<Skeleton className="h-12 w-full" />

// Enhanced with Framer Motion
<Skeleton className="h-12 w-full" animated />
```

---

### Example 3: Staggered List (SearchModal)

**File**: `search/components/SearchModal.tsx` (enhanced)

**Pattern**: Animate search results with stagger effect

```tsx
'use client';

import { motion } from 'framer-motion';
import { containerVariants, itemVariants } from '@/client/animations';

interface SearchModalProps {
  results: SearchResult[];
}

export function SearchModal({ results }: SearchModalProps) {
  return (
    <motion.div
      className="space-y-2"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {results.map((result) => (
        <motion.div
          key={result.id}
          variants={itemVariants}
          transition={{ duration: 0.2 }}
        >
          <SearchResultItem result={result} />
        </motion.div>
      ))}
    </motion.div>
  );
}
```

---

### Example 4: Scroll-to-Bottom Button Animation

**File**: `messages/components/MessageList.tsx` (enhance existing button)

**Current code** (around line 328):
```tsx
{!isAtBottom && (
  <button
    type="button"
    onClick={scrollToBottom}
    className={cn(
      'absolute bottom-4 right-4 z-20',
      'flex h-10 w-10 items-center justify-center',
      'rounded-full border border-border bg-background shadow-lg',
      'transition-all hover:bg-muted hover:shadow-xl'
    )}
    aria-label="Scroll to bottom"
  >
    <ArrowDown className="h-5 w-5 text-muted-foreground" />
    {unseenCount > 0 && (
      <span className={cn(
        'absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center',
        'rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white'
      )}>
        {unseenCount > 99 ? '99+' : unseenCount}
      </span>
    )}
  </button>
)}
```

**Enhanced with Framer Motion**:
```tsx
'use client';

import { motion, AnimatePresence } from 'framer-motion';

{/* Animate button appearance/disappearance */}
<AnimatePresence>
  {!isAtBottom && (
    <motion.button
      type="button"
      onClick={scrollToBottom}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'absolute bottom-4 right-4 z-20',
        'flex h-10 w-10 items-center justify-center',
        'rounded-full border border-border bg-background shadow-lg',
        'transition-all hover:bg-muted hover:shadow-xl'
      )}
      aria-label="Scroll to bottom"
    >
      <ArrowDown className="h-5 w-5 text-muted-foreground" />
      <AnimatePresence>
        {unseenCount > 0 && (
          <motion.span
            key="badge"
            className={cn(
              'absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center',
              'rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white'
            )}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            {unseenCount > 99 ? '99+' : unseenCount}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )}
</AnimatePresence>
```

---

### Example 5: Message Actions Toolbar (Hover Animation)

**File**: `messages/components/MessageActions.tsx` (enhance)

**Pattern**: Fade in action buttons on hover

```tsx
'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

interface MessageActionsProps {
  messageId: string;
  isAuthor: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReply: () => void;
}

export function MessageActions({
  messageId,
  isAuthor,
  onEdit,
  onDelete,
  onReply,
}: MessageActionsProps) {
  return (
    <motion.div
      className="flex items-center gap-1"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={onReply}
        className="h-8 w-8 p-0"
      >
        Reply
      </Button>

      {isAuthor && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="h-8 w-8 p-0"
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-8 w-8 p-0"
          >
            Delete
          </Button>
        </>
      )}
    </motion.div>
  );
}
```

---

## Advanced Pattern: Coordinating Multiple Animations

### Unread Message Notification

**File**: `messages/components/UnreadLine.tsx` (enhanced)

```tsx
'use client';

import { motion } from 'framer-motion';

export function UnreadLine() {
  return (
    <motion.div
      className="relative my-2 flex items-center"
      initial={{ opacity: 0, scaleX: 0 }}
      animate={{ opacity: 1, scaleX: 1 }}
      exit={{ opacity: 0, scaleX: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="flex-grow border-t border-blue-500"
        animate={{ borderColor: ['#3b82f6', '#60a5fa', '#3b82f6'] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <motion.span
        className="mx-4 text-sm font-semibold text-blue-600"
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        Unread Messages
      </motion.span>
      <motion.div
        className="flex-grow border-t border-blue-500"
        animate={{ borderColor: ['#3b82f6', '#60a5fa', '#3b82f6'] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    </motion.div>
  );
}
```

---

## Testing Your Animations

### 1. Basic Functionality Test
```tsx
import { render } from '@testing-library/react';
import { motion } from 'framer-motion';

test('message animates in', async () => {
  const { container } = render(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      Test Message
    </motion.div>
  );

  // Check element exists
  expect(container.querySelector('div')).toBeInTheDocument();
});
```

### 2. Performance Test
```bash
# Build and check size
npm run build
npm ls framer-motion

# Run Lighthouse audit
npx lighthouse http://localhost:3000
```

### 3. Manual Visual Test
- Scroll MessageList and watch item entrance animations
- Toggle scroll-to-bottom button appearance
- Search and watch results animate in
- Open/close dialogs and sheets

---

## Common Issues & Solutions

### Issue 1: Animations Not Playing

**Problem**: Motion components render but animations don't run

**Solutions**:
1. Check if LazyMotion is wrapping the component
2. Verify 'use client' directive is present
3. Check browser console for errors
4. Ensure `animate` prop is set (not undefined)

```tsx
// ❌ Wrong
<motion.div initial={{ opacity: 0 }} animate={isVisible && { opacity: 1 }}>

// ✅ Correct
<motion.div
  initial={{ opacity: 0 }}
  animate={isVisible ? { opacity: 1 } : { opacity: 0 }}
>
```

### Issue 2: Jank with Virtual Scrolling

**Problem**: Animations cause frame drops in MessageList

**Solution**: Avoid AnimatePresence around virtualized list

```tsx
// ❌ Wrong - causes jank
<AnimatePresence>
  <GroupedVirtuoso itemContent={...} />
</AnimatePresence>

// ✅ Correct - animate inside renderer
<GroupedVirtuoso
  itemContent={(index) => (
    <motion.div ...>
      <MessageItem />
    </motion.div>
  )}
/>
```

### Issue 3: Exit Animations Not Playing

**Problem**: Elements disappear instantly when AnimatePresence removes them

**Solution**: Make sure element has `exit` prop

```tsx
// ❌ Wrong
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

// ✅ Correct
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
>
```

---

## Migration Checklist

- [ ] Install framer-motion@11.0.8
- [ ] Update app/layout.tsx with LazyMotion
- [ ] Create client/animations.ts
- [ ] Test build size is acceptable
- [ ] Add MessageList item animations
- [ ] Enhance Skeleton component
- [ ] Test MessageList scroll performance
- [ ] Add scroll-to-bottom button animation
- [ ] Enhance SearchModal results
- [ ] Test on low-end device (Lighthouse)
- [ ] Deploy to staging environment

---

## Next Steps

1. **Start Phase 1**: Run setup steps above
2. **Test bundle size**: `npm run build && npm ls framer-motion`
3. **Add first animation**: MessageList items (Example 1)
4. **Profile performance**: React DevTools Profiler
5. **Gradually add more**: Use Examples 2-5 as templates

---

## Resources

- **Docs**: https://www.framer.com/motion/
- **Examples**: https://www.framer.com/motion/examples/
- **API**: https://www.framer.com/motion/introduction/
- **Next.js**: https://nextjs.org/docs/app/building-your-application/optimizing/package-bundling
