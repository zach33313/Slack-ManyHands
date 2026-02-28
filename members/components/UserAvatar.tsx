/**
 * members/components/UserAvatar.tsx
 *
 * Reusable avatar component that displays a user's profile image or
 * initials fallback on a colored background. Optionally shows a
 * PresenceIndicator dot in the bottom-right corner.
 *
 * Uses Next.js Image component for optimization and Radix UI Avatar
 * for fallback handling.
 *
 * Size variants: xs (20px), sm (28px), md (36px), lg (72px)
 *
 * Usage:
 *   <UserAvatar user={author} size="md" showPresence />
 */

'use client';

import Image from 'next/image';
import { cn } from '@/shared/lib/utils';
import { getInitials } from '@/shared/lib/utils';
import { PresenceIndicator } from './PresenceIndicator';
import { AVATAR_SIZE_PX, type AvatarSize } from '../types';

/** Stable set of background colors for initials fallback */
const FALLBACK_COLORS = [
  'bg-red-500',
  'bg-blue-500',
  'bg-green-500',
  'bg-yellow-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-cyan-500',
];

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'h-5 w-5',
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
  lg: 'h-[72px] w-[72px]',
};

const TEXT_SIZE: Record<AvatarSize, string> = {
  xs: 'text-[8px]',
  sm: 'text-[10px]',
  md: 'text-xs',
  lg: 'text-xl',
};

const PRESENCE_POSITION: Record<AvatarSize, string> = {
  xs: '-bottom-0 -right-0',
  sm: '-bottom-0.5 -right-0.5',
  md: '-bottom-0.5 -right-0.5',
  lg: '-bottom-1 -right-1',
};

/**
 * Generate a deterministic color from a user ID for the initials fallback.
 */
function getColorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

interface UserAvatarProps {
  /** User info for rendering the avatar */
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  /** Avatar size variant */
  size?: AvatarSize;
  /** Whether to show the presence indicator dot */
  showPresence?: boolean;
  /** Additional CSS classes for the outer container */
  className?: string;
  /** Click handler */
  onClick?: () => void;
}

export function UserAvatar({
  user,
  size = 'md',
  showPresence = false,
  className,
  onClick,
}: UserAvatarProps) {
  const px = AVATAR_SIZE_PX[size];
  const initials = getInitials(user.name || 'U');
  const bgColor = getColorForId(user.id);

  return (
    <div
      className={cn('relative inline-flex shrink-0', className)}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {user.image ? (
        <div
          className={cn(
            'relative overflow-hidden rounded-full',
            SIZE_CLASSES[size]
          )}
        >
          <Image
            src={user.image}
            alt={user.name || 'User avatar'}
            width={px}
            height={px}
            className="h-full w-full object-cover"
            unoptimized={user.image.startsWith('data:')}
          />
        </div>
      ) : (
        <div
          className={cn(
            'flex items-center justify-center rounded-full text-white font-medium',
            SIZE_CLASSES[size],
            TEXT_SIZE[size],
            bgColor
          )}
          aria-label={user.name || 'User'}
        >
          {initials}
        </div>
      )}

      {showPresence && (
        <span className={cn('absolute', PRESENCE_POSITION[size])}>
          <PresenceIndicator userId={user.id} size={size} />
        </span>
      )}
    </div>
  );
}
