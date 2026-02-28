'use client';

/**
 * components/ui/TypingIndicator.tsx
 *
 * Animated typing indicator showing three bouncing dots.
 * Each dot has a staggered bounce animation (0.1s offset each).
 * Used in the channel message list to show who is typing.
 *
 * Usage:
 *   import { TypingIndicator } from '@/components/ui/TypingIndicator';
 *   <TypingIndicator typingUsers={['Alice', 'Bob']} />
 */

import { m, AnimatePresence } from 'framer-motion';

interface TypingIndicatorProps {
  typingUsers: string[];
}

/** Three bouncing dot animation */
function BouncingDots() {
  return (
    <div className="flex items-center gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <m.span
          key={i}
          className="block h-1.5 w-1.5 rounded-full bg-current"
          animate={{ y: [0, -4, 0] }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.1,
          }}
        />
      ))}
    </div>
  );
}

function formatTypingText(users: string[]): string {
  if (users.length === 1) return `${users[0]} is typing`;
  if (users.length === 2) return `${users[0]} and ${users[1]} are typing`;
  if (users.length === 3) return `${users[0]}, ${users[1]}, and ${users[2]} are typing`;
  return `${users.length} people are typing`;
}

export function TypingIndicator({ typingUsers }: TypingIndicatorProps) {
  return (
    <AnimatePresence>
      {typingUsers.length > 0 && (
        <m.div
          key="typing-indicator"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="flex items-center gap-1.5 overflow-hidden px-5 py-1 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
          aria-label={formatTypingText(typingUsers)}
        >
          <BouncingDots />
          <span className="font-medium">{formatTypingText(typingUsers)}</span>
        </m.div>
      )}
    </AnimatePresence>
  );
}
