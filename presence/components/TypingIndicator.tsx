/**
 * presence/components/TypingIndicator.tsx
 *
 * Display component shown below the message input when other users
 * are typing in the current channel.
 *
 * Shows:
 *   - "Alice is typing..."
 *   - "Alice and Bob are typing..."
 *   - "Alice, Bob, and Charlie are typing..."
 *   - "Several people are typing..." (4+ users)
 *
 * Includes animated bouncing dots.
 * Hidden when no users are typing.
 *
 * Usage:
 *   <TypingIndicator channelId={channelId} />
 */

'use client';

import { useMemo, useRef } from 'react';
import { cn } from '@/shared/lib/utils';
import { usePresenceStore } from '@/presence/store';
import type { TypingUser } from '@/shared/types';

const EMPTY_TYPING: TypingUser[] = [];

interface TypingIndicatorProps {
  /** Channel to display typing users for */
  channelId: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Format the typing users list into a human-readable string.
 */
function formatTypingText(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  if (names.length === 3)
    return `${names[0]}, ${names[1]}, and ${names[2]} are typing`;
  return 'Several people are typing';
}

export function TypingIndicator({
  channelId,
  className,
}: TypingIndicatorProps) {
  const typingUsers = usePresenceStore(
    (s) => s.typingByChannel[channelId] ?? EMPTY_TYPING
  );

  const typingText = useMemo(() => {
    const names = typingUsers.map((u) => u.name);
    return formatTypingText(names);
  }, [typingUsers]);

  if (typingUsers.length === 0) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-4 py-1 text-xs text-muted-foreground',
        className
      )}
      role="status"
      aria-live="polite"
    >
      {/* Animated dots */}
      <span className="inline-flex items-center gap-0.5">
        <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
        <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
        <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
      </span>
      <span>{typingText}</span>
    </div>
  );
}
