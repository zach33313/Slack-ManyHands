/**
 * members/components/MemberProfileCard.tsx
 *
 * Profile card shown on hover/click of a user avatar or name.
 * Displays full profile information and action buttons.
 *
 * Uses Radix Dialog for modal display.
 *
 * Shows:
 *   - Large avatar (72px)
 *   - Display name and title/role text
 *   - Status emoji + status text
 *   - Timezone with current local time
 *   - Workspace role badge (OWNER/ADMIN)
 *   - "Message" button to open DM
 *
 * Usage:
 *   <MemberProfileCard member={member} open={open} onOpenChange={setOpen}>
 *     <button>View Profile</button>
 *   </MemberProfileCard>
 */

'use client';

import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MessageSquare, Clock } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { MemberRole } from '@/shared/types';
import { UserAvatar } from './UserAvatar';
import type { MemberWithUser } from '../types';

const ROLE_BADGE_STYLES: Record<string, string> = {
  [MemberRole.OWNER]:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  [MemberRole.ADMIN]:
    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  [MemberRole.MEMBER]: '',
};

/**
 * Get the current local time for a given IANA timezone string.
 */
function getLocalTime(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date());
  } catch {
    return '';
  }
}

interface MemberProfileCardProps {
  /** The member to display profile for */
  member: MemberWithUser;
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Optional callback when "Message" is clicked */
  onMessageClick?: (userId: string) => void;
}

export function MemberProfileCard({
  member,
  open,
  onOpenChange,
  onMessageClick,
}: MemberProfileCardProps) {
  const { user, role } = member;
  const displayName = user.name || user.email;
  const showRoleBadge = role === MemberRole.OWNER || role === MemberRole.ADMIN;

  const localTime = useMemo(() => {
    if (!user.timezone) return null;
    return getLocalTime(user.timezone);
  }, [user.timezone]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[360px] p-0 gap-0 overflow-hidden">
        {/* Header with colored banner */}
        <div className="h-16 bg-gradient-to-r from-blue-500 to-purple-600" />

        <div className="px-5 pb-5">
          {/* Avatar overlapping the banner */}
          <div className="-mt-9 mb-3">
            <div className="rounded-full border-4 border-background inline-block">
              <UserAvatar user={user} size="lg" showPresence />
            </div>
          </div>

          <DialogHeader className="space-y-1 text-left">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-xl font-bold">
                {displayName}
              </DialogTitle>
              {showRoleBadge && (
                <span
                  className={cn(
                    'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                    ROLE_BADGE_STYLES[role]
                  )}
                >
                  {role}
                </span>
              )}
            </div>
            {user.title && (
              <DialogDescription className="text-sm text-muted-foreground">
                {user.title}
              </DialogDescription>
            )}
          </DialogHeader>

          {/* Status */}
          {(user.statusEmoji || user.statusText) && (
            <div className="mt-3 flex items-center gap-1.5 text-sm">
              {user.statusEmoji && (
                <span className="text-base">{user.statusEmoji}</span>
              )}
              {user.statusText && (
                <span className="text-muted-foreground">{user.statusText}</span>
              )}
            </div>
          )}

          {/* Timezone / local time */}
          {user.timezone && localTime && (
            <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>
                {localTime} local time ({user.timezone})
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => {
                onMessageClick?.(user.id);
                onOpenChange(false);
              }}
            >
              <MessageSquare className="mr-1.5 h-4 w-4" />
              Message
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
