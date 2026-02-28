/**
 * presence/hooks/usePresence.ts
 *
 * React hook for managing the current user's presence status.
 *
 * On mount:
 *   - Sends presence:heartbeat via Socket.IO every 30s
 *   - Listens to presence:update events and updates Zustand presenceMap
 *   - Detects user inactivity (no mouse/keyboard for 10 min) → sends away status
 *   - On tab focus: sends online heartbeat
 *   - On tab blur: starts inactivity timer
 *   - Cleanup on unmount
 *
 * Usage:
 *   // Call once at the app layout level
 *   usePresence()
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useSocket } from '@/shared/hooks/useSocket';
import { usePresenceStore } from '@/presence/store';
import { PRESENCE_HEARTBEAT_INTERVAL } from '@/shared/lib/constants';
import type { PresenceUpdatePayload } from '@/shared/types/socket';

/** Inactivity timeout before switching to "away" (10 minutes) */
const INACTIVITY_TIMEOUT = 10 * 60 * 1000;

/**
 * Hook that manages the current user's online presence.
 * Should be called once at the app layout level.
 *
 * Sends heartbeats every 30s while active, listens for presence updates
 * from other users, and detects inactivity to mark as "away".
 */
export function usePresence() {
  const socket = useSocket();
  const setPresence = usePresenceStore((s) => s.setPresence);

  const heartbeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInactive = useRef(false);

  /** Send a heartbeat to the server */
  const sendHeartbeat = useCallback(() => {
    if (socket.connected) {
      socket.emit('presence:heartbeat');
    }
  }, [socket]);

  /** Reset the inactivity timer on user activity */
  const resetInactivityTimer = useCallback(() => {
    // If was inactive, send heartbeat to go back online
    if (isInactive.current) {
      isInactive.current = false;
      sendHeartbeat();
    }

    // Clear and reset the inactivity timer
    if (inactivityTimer.current) {
      clearTimeout(inactivityTimer.current);
    }

    inactivityTimer.current = setTimeout(() => {
      isInactive.current = true;
      // Server will handle the expiry; we just stop sending heartbeats
      // The server's 90s timer will eventually mark us offline
    }, INACTIVITY_TIMEOUT);
  }, [sendHeartbeat]);

  useEffect(() => {
    // --- Presence update listener ---
    const handlePresenceUpdate = (payload: PresenceUpdatePayload) => {
      setPresence(payload.userId, payload.status);
    };

    socket.on('presence:update', handlePresenceUpdate);

    // --- Heartbeat interval ---
    // Send initial heartbeat immediately
    sendHeartbeat();

    // Then send every PRESENCE_HEARTBEAT_INTERVAL ms
    heartbeatInterval.current = setInterval(() => {
      if (!isInactive.current) {
        sendHeartbeat();
      }
    }, PRESENCE_HEARTBEAT_INTERVAL);

    // --- User activity detection ---
    const activityEvents = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];

    const handleActivity = () => {
      resetInactivityTimer();
    };

    for (const event of activityEvents) {
      document.addEventListener(event, handleActivity, { passive: true });
    }

    // Start initial inactivity timer
    resetInactivityTimer();

    // --- Tab visibility ---
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Tab focused — send heartbeat immediately
        isInactive.current = false;
        sendHeartbeat();
        resetInactivityTimer();
      }
      // Tab blurred — inactivity timer continues running
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // --- Window focus/blur ---
    const handleWindowFocus = () => {
      isInactive.current = false;
      sendHeartbeat();
      resetInactivityTimer();
    };

    window.addEventListener('focus', handleWindowFocus);

    // --- Cleanup ---
    return () => {
      socket.off('presence:update', handlePresenceUpdate);

      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
        heartbeatInterval.current = null;
      }

      if (inactivityTimer.current) {
        clearTimeout(inactivityTimer.current);
        inactivityTimer.current = null;
      }

      for (const event of activityEvents) {
        document.removeEventListener(event, handleActivity);
      }

      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [socket, setPresence, sendHeartbeat, resetInactivityTimer]);
}
