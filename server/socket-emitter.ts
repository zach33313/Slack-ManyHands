/**
 * server/socket-emitter.ts
 *
 * Helper functions for emitting Socket.IO events from anywhere in the server,
 * including Next.js API Route Handlers.
 *
 * The Socket.IO instance is stored on globalThis.__socketio by server.ts.
 * These helpers provide a typed, convenient interface for pushing events to
 * specific rooms (channels, users, workspaces).
 *
 * Usage from a Route Handler:
 *   import { emitToChannel } from '@/server/socket-emitter'
 *   emitToChannel(channelId, 'message:new', messageData)
 */

import type { Server as SocketIOServer } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../shared/types/socket';
import {
  channelRoom,
  userRoom,
  workspaceRoom,
} from '../shared/lib/constants';

type AppServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

// Global declaration for the Socket.IO instance stored by server.ts
declare global {
  // eslint-disable-next-line no-var
  var __socketio: AppServer | undefined;
}

/**
 * Returns the global Socket.IO server instance.
 *
 * @throws Error if the Socket.IO server has not been initialized yet
 *         (i.e., server.ts has not run).
 */
export function getIO(): AppServer {
  const io = globalThis.__socketio;
  if (!io) {
    throw new Error(
      'Socket.IO server not initialized. Ensure server.ts has started.'
    );
  }
  return io as AppServer;
}

/**
 * Emit an event to all sockets in a channel room.
 *
 * @param channelId - The channel to emit to
 * @param event - The event name (from ServerToClientEvents)
 * @param data - The event payload
 */
export function emitToChannel<E extends keyof ServerToClientEvents>(
  channelId: string,
  event: E,
  ...data: Parameters<ServerToClientEvents[E]>
): void {
  try {
    const io = getIO();
    io.to(channelRoom(channelId)).emit(event, ...data);
  } catch (err) {
    console.error(`[socket-emitter] emitToChannel(${channelId}, ${String(event)}) failed:`, err);
  }
}

/**
 * Emit an event to a specific user's personal room.
 * Useful for notifications, DM pings, and user-specific updates.
 *
 * @param userId - The user to emit to
 * @param event - The event name (from ServerToClientEvents)
 * @param data - The event payload
 */
export function emitToUser<E extends keyof ServerToClientEvents>(
  userId: string,
  event: E,
  ...data: Parameters<ServerToClientEvents[E]>
): void {
  try {
    const io = getIO();
    io.to(userRoom(userId)).emit(event, ...data);
  } catch (err) {
    console.error(`[socket-emitter] emitToUser(${userId}, ${String(event)}) failed:`, err);
  }
}

/**
 * Emit an event to all sockets in a workspace room.
 * Useful for workspace-level events (member joined, channel created, presence).
 *
 * @param workspaceId - The workspace to emit to
 * @param event - The event name (from ServerToClientEvents)
 * @param data - The event payload
 */
export function emitToWorkspace<E extends keyof ServerToClientEvents>(
  workspaceId: string,
  event: E,
  ...data: Parameters<ServerToClientEvents[E]>
): void {
  try {
    const io = getIO();
    io.to(workspaceRoom(workspaceId)).emit(event, ...data);
  } catch (err) {
    console.error(`[socket-emitter] emitToWorkspace(${workspaceId}, ${String(event)}) failed:`, err);
  }
}
