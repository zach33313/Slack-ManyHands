/**
 * server/socket-handlers/presence.ts
 *
 * Presence tracking for Socket.IO.
 *
 * Maintains an in-memory map of userId → expiry timer to track online status.
 * No database writes for heartbeats — only writes lastSeenAt when a user goes offline.
 *
 * Handles:
 * - presence:heartbeat — Resets/creates a 90s timer; emits 'online' on first heartbeat
 * - workspace:join — Joins the workspace room for receiving workspace-level events
 * - disconnect — Immediately clears timer and emits offline status
 *
 * Presence updates are broadcast to the user's workspace room.
 */

import type { Socket } from 'socket.io';
import { prisma } from '../../shared/lib/prisma';
import {
  workspaceRoom,
  PRESENCE_TIMEOUT,
} from '../../shared/lib/constants';
import { PresenceStatus } from '../../shared/types';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../../shared/types/socket';

type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * In-memory presence tracker.
 * Maps userId → Map<socketId, NodeJS.Timeout>.
 *
 * Each connected socket (browser tab) has its own independent timer.
 * A user is only considered offline when their LAST socket's timer expires
 * or disconnects. This prevents a disconnect on one tab from marking a user
 * offline while another tab is still active.
 */
const presenceTimers = new Map<string, Map<string, NodeJS.Timeout>>();

/**
 * Marks a user as offline: emits presence:update to their workspace room,
 * and updates lastSeenAt in the database.
 *
 * Callers are responsible for cleaning up presenceTimers before calling this.
 */
async function markOffline(
  socket: AppSocket,
  userId: string
): Promise<void> {
  // Emit offline status to all workspace rooms this socket is in
  // The socket's rooms include workspace rooms (workspace:xxx)
  for (const room of socket.rooms) {
    if (room.startsWith('workspace:')) {
      socket.to(room).emit('presence:update', {
        userId,
        status: PresenceStatus.OFFLINE,
      });
    }
  }
  // Also notify the sender
  socket.emit('presence:update', {
    userId,
    status: PresenceStatus.OFFLINE,
  });

  // Update lastSeenAt in the database (best-effort, non-blocking)
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { updatedAt: new Date() },
    });
  } catch (err) {
    console.error(`[presence] Failed to update lastSeenAt for user ${userId}:`, err);
  }
}

/**
 * Registers presence tracking handlers on a connected socket.
 */
export function registerPresenceHandlers(socket: AppSocket): void {
  const userId = socket.data.userId;

  /**
   * workspace:join — Join the workspace room to receive workspace-level events
   * (presence updates, channel created, member joined, etc.).
   *
   * Also stores the workspaceId on socket.data for reference.
   */
  socket.on('workspace:join', ({ workspaceId }) => {
    if (!workspaceId) {
      return;
    }

    const room = workspaceRoom(workspaceId);
    socket.join(room);
    socket.data.workspaceId = workspaceId;
    console.log(`[presence] User ${userId} joined workspace room ${room}`);
  });

  /**
   * presence:heartbeat — Keep the user's online status alive.
   *
   * Client should send this every 30s (PRESENCE_HEARTBEAT_INTERVAL).
   * The server resets a 90s (PRESENCE_TIMEOUT) timer. If the timer expires
   * without another heartbeat, the user is marked offline.
   *
   * On the first heartbeat (no existing timer), emits 'online' status
   * to the workspace room.
   */
  socket.on('presence:heartbeat', () => {
    let userTimers = presenceTimers.get(userId);
    // First socket for this user — user is transitioning online
    const isFirstSocket = !userTimers || userTimers.size === 0;

    if (!userTimers) {
      userTimers = new Map<string, NodeJS.Timeout>();
      presenceTimers.set(userId, userTimers);
    }

    // Clear this socket's existing timer (if any)
    const existingTimer = userTimers.get(socket.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set a new expiry timer scoped to this socket
    const timer = setTimeout(() => {
      const timers = presenceTimers.get(userId);
      if (timers) {
        timers.delete(socket.id);
        if (timers.size === 0) {
          presenceTimers.delete(userId);
          void markOffline(socket, userId);
        }
      }
    }, PRESENCE_TIMEOUT);

    userTimers.set(socket.id, timer);

    // Broadcast ONLINE only when this is the user's first active socket
    if (isFirstSocket) {
      for (const room of socket.rooms) {
        if (room.startsWith('workspace:')) {
          socket.to(room).emit('presence:update', {
            userId,
            status: PresenceStatus.ONLINE,
          });
        }
      }
      // Also notify the sender so they see their own online status
      socket.emit('presence:update', {
        userId,
        status: PresenceStatus.ONLINE,
      });
    }
  });

  /**
   * On disconnect, clear only this socket's timer.
   * Only mark the user offline when their last socket disconnects.
   * This fires before the socket is removed from all rooms,
   * so we can still broadcast to workspace rooms.
   */
  socket.on('disconnect', () => {
    const userTimers = presenceTimers.get(userId);
    if (userTimers) {
      const timer = userTimers.get(socket.id);
      if (timer) {
        clearTimeout(timer);
      }
      userTimers.delete(socket.id);
      // Only emit OFFLINE if no other tabs/sockets remain for this user
      if (userTimers.size === 0) {
        presenceTimers.delete(userId);
        void markOffline(socket, userId);
      }
    }
  });
}

/**
 * Returns whether a user is currently tracked as online.
 * A user is online if they have at least one active socket timer.
 */
export function isUserOnline(userId: string): boolean {
  const userTimers = presenceTimers.get(userId);
  return !!(userTimers && userTimers.size > 0);
}
