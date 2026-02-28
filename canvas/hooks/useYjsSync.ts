'use client';

/**
 * canvas/hooks/useYjsSync.ts
 *
 * Custom Yjs sync provider over Socket.IO.
 * Handles real-time collaboration, awareness (cursors), and auto-saving.
 *
 * Returns: { yDoc, awareness }
 */

import { useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { getSocket } from '@/shared/lib/socket-client';
import { saveCanvas, createCanvasVersion } from '../actions';

const SAVE_DEBOUNCE_MS = 5000;       // 5 second debounce for auto-save
const SNAPSHOT_INTERVAL_MS = 300000; // 5 minute auto-snapshot

export interface AwarenessUser {
  name: string;
  color: string;
  userId: string;
}

export interface UseYjsSyncReturn {
  yDoc: Y.Doc;
  awareness: Map<number, { user?: AwarenessUser; cursor?: unknown }>;
}

/**
 * Assign a deterministic color from a fixed palette based on userId.
 */
function userColor(userId: string): string {
  const colors = [
    '#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) & 0xffffffff;
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Encode a Uint8Array to base64 string.
 */
function uint8ToBase64(arr: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

/**
 * Decode a base64 string to Uint8Array.
 */
function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return arr;
}

export function useYjsSync(
  canvasId: string | null,
  channelId: string | null,
  currentUserId: string | null,
  currentUserName: string | null
): UseYjsSyncReturn {
  const yDocRef = useRef<Y.Doc>(new Y.Doc());
  const awarenessRef = useRef<Map<number, { user?: AwarenessUser; cursor?: unknown }>>(new Map());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isInitializedRef = useRef(false);

  // Stable save function
  const debouncedSave = useCallback(() => {
    if (!channelId) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(async () => {
      try {
        const yDoc = yDocRef.current;
        const state = Y.encodeStateAsUpdate(yDoc);
        const base64 = uint8ToBase64(state);
        await saveCanvas(channelId, base64);
      } catch (err) {
        console.error('[useYjsSync] Auto-save failed:', err);
      }
    }, SAVE_DEBOUNCE_MS);
  }, [channelId]);

  useEffect(() => {
    if (!canvasId || !channelId || !currentUserId || isInitializedRef.current) return;
    isInitializedRef.current = true;

    const yDoc = yDocRef.current;
    const socket = getSocket();

    // Join canvas room
    socket.emit('canvas:join', { canvasId });

    // Handle initial state from server
    const handleInitialState = (payload: { canvasId: string; state: unknown }) => {
      if (payload.canvasId !== canvasId) return;
      try {
        const state = payload.state as string;
        if (state && typeof state === 'string') {
          const update = base64ToUint8(state);
          Y.applyUpdate(yDoc, update);
        }
      } catch (err) {
        console.error('[useYjsSync] Failed to apply initial state:', err);
      }
    };

    // Handle remote updates
    const handleRemoteUpdate = (payload: { canvasId: string; update: unknown }) => {
      if (payload.canvasId !== canvasId) return;
      try {
        const update = payload.update as string;
        if (update && typeof update === 'string') {
          const uint8 = base64ToUint8(update);
          Y.applyUpdate(yDoc, uint8, 'remote');
        }
      } catch (err) {
        console.error('[useYjsSync] Failed to apply remote update:', err);
      }
    };

    // Handle awareness from server
    const handleAwareness = (payload: { canvasId: string; states: Record<string, unknown> }) => {
      if (payload.canvasId !== canvasId) return;
      const map = awarenessRef.current;
      map.clear();
      let clientId = 0;
      for (const [, state] of Object.entries(payload.states)) {
        map.set(clientId++, state as { user?: AwarenessUser; cursor?: unknown });
      }
    };

    // Listen for canvas events
    socket.on('canvas:initial-state', handleInitialState);
    socket.on('canvas:update', handleRemoteUpdate);
    socket.on('canvas:awareness', handleAwareness);

    // Emit local doc updates to server
    const handleLocalUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return; // Don't echo back remote updates
      try {
        const base64 = uint8ToBase64(update);
        socket.emit('canvas:update', { canvasId, update: base64 });
        debouncedSave();
      } catch (err) {
        console.error('[useYjsSync] Failed to emit update:', err);
      }
    };

    yDoc.on('update', handleLocalUpdate);

    // Emit our awareness state
    const emitAwareness = () => {
      if (!currentUserId || !currentUserName) return;
      const state = {
        user: {
          name: currentUserName,
          color: userColor(currentUserId),
          userId: currentUserId,
        },
      };
      socket.emit('canvas:awareness', { canvasId, state });
    };

    // Send awareness immediately and every 30 seconds
    emitAwareness();
    const awarenessInterval = setInterval(emitAwareness, 30000);

    // Auto-snapshot every 5 minutes
    snapshotTimerRef.current = setInterval(async () => {
      if (!currentUserId || !canvasId) return;
      try {
        const state = Y.encodeStateAsUpdate(yDoc);
        const base64 = uint8ToBase64(state);
        await createCanvasVersion(canvasId, base64, currentUserId);
      } catch (err) {
        console.error('[useYjsSync] Auto-snapshot failed:', err);
      }
    }, SNAPSHOT_INTERVAL_MS);

    return () => {
      // Leave canvas room
      socket.emit('canvas:leave', { canvasId });

      // Cleanup listeners
      socket.off('canvas:initial-state', handleInitialState);
      socket.off('canvas:update', handleRemoteUpdate);
      socket.off('canvas:awareness', handleAwareness);
      yDoc.off('update', handleLocalUpdate);

      clearInterval(awarenessInterval);

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      if (snapshotTimerRef.current) {
        clearInterval(snapshotTimerRef.current);
      }

      isInitializedRef.current = false;
    };
  }, [canvasId, channelId, currentUserId, currentUserName, debouncedSave]);

  return {
    yDoc: yDocRef.current,
    awareness: awarenessRef.current,
  };
}
