/**
 * members/components/PresenceIndicator.tsx
 *
 * Colored dot component showing a user's online/away/offline status.
 * Subscribes to the Zustand presence store for real-time updates.
 *
 * Colors:
 *   - online:  green filled circle
 *   - away:    yellow filled circle
 *   - offline: gray ring (outline only)
 *
 * Usage:
 *   <PresenceIndicator userId={user.id} size="md" />
 */

'use client';

import { cn } from '@/shared/lib/utils';
import { PresenceStatus } from '@/shared/types';
import { usePresenceStore } from '@/presence/store';
import type { AvatarSize } from '../types';

const DOT_SIZE: Record<AvatarSize, string> = {
  xs: 'h-2 w-2',
  sm: 'h-2.5 w-2.5',
  md: 'h-3 w-3',
  lg: 'h-4 w-4',
};

const DOT_BORDER: Record<AvatarSize, string> = {
  xs: 'border',
  sm: 'border',
  md: 'border-2',
  lg: 'border-2',
};

interface PresenceIndicatorProps {
  /** The user whose presence to display */
  userId: string;
  /** Size variant — synced with avatar size */
  size?: AvatarSize;
  /** Additional CSS classes */
  className?: string;
}

export function PresenceIndicator({
  userId,
  size = 'md',
  className,
}: PresenceIndicatorProps) {
  const status = usePresenceStore(
    (s) => s.presenceMap[userId] ?? PresenceStatus.OFFLINE
  );

  return (
    <span
      className={cn(
        'inline-block rounded-full border-background',
        DOT_SIZE[size],
        DOT_BORDER[size],
        status === PresenceStatus.ONLINE && 'bg-green-500',
        status === PresenceStatus.AWAY && 'bg-yellow-500',
        status === PresenceStatus.OFFLINE &&
          'border-muted-foreground/50 bg-transparent',
        className
      )}
      aria-label={`Status: ${status}`}
      role="status"
    />
  );
}
