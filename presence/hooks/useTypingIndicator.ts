/**
 * presence/hooks/useTypingIndicator.ts
 *
 * React hook for typing indicator state management.
 *
 * Provides:
 *   - startTyping(channelId) — emits typing:start, sets 3s auto-stop timeout
 *   - stopTyping(channelId) — emits typing:stop, clears timeout
 *   - typingUsers — list of currently typing users for the given channelId
 *
 * Listens to typing:users events from the server and updates the
 * Zustand presence store.
 *
 * Usage:
 *   const { startTyping, stopTyping, typingUsers } = useTypingIndicator(channelId)
 *   // In editor onChange: startTyping(channelId)
 *   // On submit or blur: stopTyping(channelId)
 */

'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useSocket } from '@/shared/hooks/useSocket';
import { usePresenceStore } from '@/presence/store';
import { TYPING_TIMEOUT } from '@/shared/lib/constants';
import type { TypingUsersPayload } from '@/shared/types/socket';
import type { TypingUser } from '@/shared/types';

interface UseTypingIndicatorReturn {
  /** Call when the user starts typing in a channel */
  startTyping: (channelId: string) => void;
  /** Call when the user stops typing (submit, blur, or inactivity) */
  stopTyping: (channelId: string) => void;
  /** Current list of typing users for the given channelId */
  typingUsers: TypingUser[];
}

/**
 * Hook for typing indicator functionality.
 *
 * @param channelId - The channel to track typing users for
 * @returns Typed start/stop functions and current typing users list
 */
export function useTypingIndicator(
  channelId: string | null
): UseTypingIndicatorReturn {
  const socket = useSocket();
  const setTypingUsers = usePresenceStore((s) => s.setTypingUsers);
  const typingByChannel = usePresenceStore((s) => s.typingByChannel);

  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastChannelId = useRef<string | null>(null);

  /**
   * Start typing indicator — emits to server and sets auto-stop timer.
   * Calling this repeatedly resets the auto-stop timer.
   */
  const startTyping = useCallback(
    (chId: string) => {
      if (!socket.connected) return;

      socket.emit('typing:start', { channelId: chId });
      lastChannelId.current = chId;

      // Reset auto-stop timer
      if (autoStopTimer.current) {
        clearTimeout(autoStopTimer.current);
      }

      autoStopTimer.current = setTimeout(() => {
        socket.emit('typing:stop', { channelId: chId });
        autoStopTimer.current = null;
      }, TYPING_TIMEOUT);
    },
    [socket]
  );

  /**
   * Stop typing indicator — emits to server and clears auto-stop timer.
   */
  const stopTyping = useCallback(
    (chId: string) => {
      if (!socket.connected) return;

      socket.emit('typing:stop', { channelId: chId });

      if (autoStopTimer.current) {
        clearTimeout(autoStopTimer.current);
        autoStopTimer.current = null;
      }
    },
    [socket]
  );

  // Listen to typing:users events from the server
  useEffect(() => {
    const handleTypingUsers = (payload: TypingUsersPayload) => {
      setTypingUsers(payload.channelId, payload.users);
    };

    socket.on('typing:users', handleTypingUsers);

    return () => {
      socket.off('typing:users', handleTypingUsers);

      // Clean up: stop typing when unmounting
      if (autoStopTimer.current) {
        clearTimeout(autoStopTimer.current);
        if (lastChannelId.current) {
          socket.emit('typing:stop', { channelId: lastChannelId.current });
        }
      }
    };
  }, [socket, setTypingUsers]);

  // Get typing users for the current channel
  const typingUsers = useMemo(() => {
    if (!channelId) return [];
    return typingByChannel[channelId] ?? [];
  }, [channelId, typingByChannel]);

  return { startTyping, stopTyping, typingUsers };
}
