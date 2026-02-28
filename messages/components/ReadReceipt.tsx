'use client';

/**
 * messages/components/ReadReceipt.tsx
 *
 * Read receipt indicators for messages.
 * - DMs: single check (sent), double check (read by recipient)
 * - Groups: "Seen by N" text with hover tooltip showing reader avatars
 *
 * Emits channel:mark-read on mount and every 30s heartbeat while viewing.
 * Listens for channel:user-read to update read state in real-time.
 */

import { useEffect, useState, useCallback } from 'react';
import { Check, CheckCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSocket } from '@/shared/hooks/useSocket';
import type { ChannelUserReadPayload } from '@/shared/types/socket';
import type { UserSummary } from '@/shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReadReceiptProps {
  channelId: string;
  messageId: string;
  messageCreatedAt: Date;
  /** Current user's ID (to exclude from "seen by") */
  currentUserId: string;
  /** Is this a DM channel (2-person only)? */
  isDM: boolean;
  /** Members of the channel (for group read receipts) */
  members?: Array<{
    userId: string;
    user: UserSummary;
    lastReadAt: Date | null;
  }>;
}

// ---------------------------------------------------------------------------
// Mark-read hook
// ---------------------------------------------------------------------------

export function useMarkChannelRead(channelId: string, messageId: string) {
  const socket = useSocket();

  const markRead = useCallback(() => {
    if (!socket || !channelId || !messageId) return;
    socket.emit('channel:mark-read', { channelId, messageId });
  }, [socket, channelId, messageId]);

  useEffect(() => {
    markRead();

    // Heartbeat every 30 seconds while viewing
    const interval = setInterval(markRead, 30_000);
    return () => clearInterval(interval);
  }, [markRead]);
}

// ---------------------------------------------------------------------------
// DM read indicator
// ---------------------------------------------------------------------------

interface DMReadIndicatorProps {
  messageId: string;
  messageCreatedAt: Date;
  currentUserId: string;
  channelId: string;
  /** The other participant in the DM */
  recipientLastReadAt: Date | null;
}

export function DMReadIndicator({
  messageId,
  messageCreatedAt,
  currentUserId,
  channelId,
  recipientLastReadAt: initialLastReadAt,
}: DMReadIndicatorProps) {
  const [recipientLastReadAt, setRecipientLastReadAt] = useState<Date | null>(
    initialLastReadAt
  );
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;

    function onUserRead(payload: ChannelUserReadPayload) {
      if (payload.channelId !== channelId) return;
      if (payload.userId === currentUserId) return; // Ignore own reads
      setRecipientLastReadAt(payload.readAt);
    }

    socket.on('channel:user-read', onUserRead);
    return () => {
      socket.off('channel:user-read', onUserRead);
    };
  }, [socket, channelId, currentUserId]);

  const isRead =
    recipientLastReadAt !== null &&
    new Date(recipientLastReadAt) >= new Date(messageCreatedAt);

  if (isRead) {
    return (
      <span className="inline-flex items-center" title="Seen">
        <CheckCheck className="h-3.5 w-3.5 text-blue-500" />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center" title="Sent">
      <Check className="h-3.5 w-3.5 text-muted-foreground" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Group "Seen by N" indicator
// ---------------------------------------------------------------------------

interface GroupReadIndicatorProps {
  messageId: string;
  messageCreatedAt: Date;
  currentUserId: string;
  channelId: string;
  members: Array<{
    userId: string;
    user: UserSummary;
    lastReadAt: Date | null;
  }>;
}

export function GroupReadIndicator({
  messageId,
  messageCreatedAt,
  currentUserId,
  channelId,
  members,
}: GroupReadIndicatorProps) {
  const [readByMap, setReadByMap] = useState<Map<string, Date>>(() => {
    const m = new Map<string, Date>();
    for (const member of members) {
      if (
        member.userId !== currentUserId &&
        member.lastReadAt &&
        new Date(member.lastReadAt) >= new Date(messageCreatedAt)
      ) {
        m.set(member.userId, new Date(member.lastReadAt));
      }
    }
    return m;
  });

  const socket = useSocket();

  // Build user map for fast lookups
  const userMap = new Map<string, UserSummary>();
  for (const m of members) userMap.set(m.userId, m.user);

  useEffect(() => {
    if (!socket) return;

    function onUserRead(payload: ChannelUserReadPayload) {
      if (payload.channelId !== channelId) return;
      if (payload.userId === currentUserId) return;
      // Only count if they read at or after this message
      if (new Date(payload.readAt) >= new Date(messageCreatedAt)) {
        setReadByMap((prev) => {
          const next = new Map(prev);
          next.set(payload.userId, payload.readAt);
          return next;
        });
      }
    }

    socket.on('channel:user-read', onUserRead);
    return () => {
      socket.off('channel:user-read', onUserRead);
    };
  }, [socket, channelId, currentUserId, messageCreatedAt]);

  const readers = Array.from(readByMap.keys()).map((uid) => ({
    userId: uid,
    user: userMap.get(uid),
  }));

  if (readers.length === 0) return null;

  const displayReaders = readers.slice(0, 5);
  const extraCount = readers.length - displayReaders.length;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 cursor-default">
            <div className="flex -space-x-1">
              {displayReaders.map(({ userId, user }) => (
                <div
                  key={userId}
                  className="w-3.5 h-3.5 rounded-full border border-background bg-primary/20 flex items-center justify-center text-[7px] font-bold text-primary overflow-hidden"
                  title={user?.name ?? userId}
                >
                  {user?.image ? (
                    <img
                      src={user.image}
                      alt={user.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    (user?.name ?? userId).charAt(0).toUpperCase()
                  )}
                </div>
              ))}
              {extraCount > 0 && (
                <div className="w-3.5 h-3.5 rounded-full border border-background bg-muted flex items-center justify-center text-[7px] text-muted-foreground">
                  +{extraCount}
                </div>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground">
              Seen by {readers.length}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="space-y-1">
            {readers.map(({ userId, user }) => (
              <div key={userId} className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[8px] overflow-hidden">
                  {user?.image ? (
                    <img src={user.image} alt={user?.name ?? ''} className="w-full h-full object-cover" />
                  ) : (
                    (user?.name ?? userId).charAt(0).toUpperCase()
                  )}
                </div>
                <span>{user?.name ?? userId}</span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Main export (auto-selects DM vs Group)
// ---------------------------------------------------------------------------

export function ReadReceipt({
  channelId,
  messageId,
  messageCreatedAt,
  currentUserId,
  isDM,
  members = [],
}: ReadReceiptProps) {
  if (isDM) {
    const recipient = members.find((m) => m.userId !== currentUserId);
    return (
      <DMReadIndicator
        messageId={messageId}
        messageCreatedAt={messageCreatedAt}
        currentUserId={currentUserId}
        channelId={channelId}
        recipientLastReadAt={recipient?.lastReadAt ?? null}
      />
    );
  }

  return (
    <GroupReadIndicator
      messageId={messageId}
      messageCreatedAt={messageCreatedAt}
      currentUserId={currentUserId}
      channelId={channelId}
      members={members}
    />
  );
}
