/**
 * server/socket-handlers/canvas.ts
 *
 * Canvas collaboration event handlers for Socket.IO.
 *
 * Relays Yjs CRDT updates for collaborative canvas editing:
 * - canvas:join      — Join canvas room and receive initial document state
 * - canvas:leave     — Leave canvas room
 * - canvas:update    — Broadcast Yjs update to other editors; debounced DB save
 * - canvas:awareness — Broadcast cursor/selection awareness to other editors
 *
 * Canvas rooms are named `canvas:${canvasId}` to scope updates to a specific
 * canvas document independently from the channel room.
 *
 * The debounced DB save accumulates updates for 5 seconds after the last
 * update before persisting to the Canvas.contentJson column.
 */

import type { Socket } from 'socket.io';
import * as Y from 'yjs';
import { prisma } from '../../shared/lib/prisma';
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

/** Milliseconds of inactivity before a pending canvas update is persisted */
const CANVAS_SAVE_DEBOUNCE_MS = 5_000;

/**
 * Module-level maps for debounced canvas saves.
 * These persist across socket connections so multiple concurrent editors
 * on the same canvas share the same debounce window.
 */
const pendingSaveTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
/** Accumulates all base64-encoded Yjs incremental updates received within the debounce window */
const pendingCanvasUpdates = new Map<string, string[]>();

/**
 * Persist all buffered canvas updates to the database.
 *
 * All pending base64-encoded Yjs incremental updates are decoded and merged
 * via Y.mergeUpdates so no concurrent changes within the debounce window are lost.
 */
async function flushCanvasToDB(canvasId: string): Promise<void> {
  const updates = pendingCanvasUpdates.get(canvasId);
  if (!updates || updates.length === 0) return;

  try {
    // Decode each base64 update to Uint8Array, merge them, then re-encode
    const uint8Updates = updates.map((u) => new Uint8Array(Buffer.from(u, 'base64')));
    const merged = Y.mergeUpdates(uint8Updates);
    const contentJson = Buffer.from(merged).toString('base64');

    await prisma.canvas.update({
      where: { id: canvasId },
      data: { contentJson },
    });

    pendingCanvasUpdates.delete(canvasId);
    console.log(`[canvas] Saved canvas ${canvasId} to DB (merged ${updates.length} update(s))`);
  } catch (err) {
    console.error(`[canvas] Failed to persist canvas ${canvasId}:`, err);
  }
}

/**
 * Schedule a debounced save for the given canvas.
 * Resets the timer if one is already pending.
 */
function scheduleDebouncedSave(canvasId: string): void {
  const existing = pendingSaveTimeouts.get(canvasId);
  if (existing !== undefined) {
    clearTimeout(existing);
  }

  const timeout = setTimeout(() => {
    pendingSaveTimeouts.delete(canvasId);
    void flushCanvasToDB(canvasId);
  }, CANVAS_SAVE_DEBOUNCE_MS);

  pendingSaveTimeouts.set(canvasId, timeout);
}

/**
 * Registers canvas event handlers on a connected socket.
 */
export function registerCanvasHandlers(socket: AppSocket): void {
  const userId = socket.data.userId;

  /**
   * canvas:join — Subscribe to a canvas room.
   *
   * Loads the Canvas record from DB, verifies the requesting user is a
   * member of the canvas's channel, then emits `canvas:initial-state` with
   * the stored document content back to the joining socket only.
   */
  socket.on('canvas:join', async ({ canvasId }) => {
    try {
      if (!canvasId) {
        console.warn(`[canvas] canvas:join — missing canvasId from user ${userId}`);
        return;
      }

      const canvas = await prisma.canvas.findUnique({
        where: { id: canvasId },
        select: { id: true, channelId: true, contentJson: true, isActive: true },
      });

      if (!canvas) {
        console.warn(`[canvas] canvas:join — canvas ${canvasId} not found`);
        return;
      }

      // Authorization: user must be a member of the canvas's channel
      const membership = await prisma.channelMember.findUnique({
        where: {
          channelId_userId: { channelId: canvas.channelId, userId },
        },
        select: { channelId: true },
      });

      if (!membership) {
        console.warn(
          `[canvas] canvas:join — user ${userId} is not a member of channel ${canvas.channelId} (canvas ${canvasId})`
        );
        return;
      }

      const room = `canvas:${canvasId}`;
      await socket.join(room);

      // Parse stored content — could be a Yjs base64 string or JSON object
      let state: unknown;
      try {
        state = JSON.parse(canvas.contentJson);
      } catch {
        // Stored as raw base64 or non-JSON string — forward as-is
        state = canvas.contentJson;
      }

      // Send initial state to the joining user only
      socket.emit('canvas:initial-state', { canvasId, state });

      console.log(
        `[canvas] User ${userId} joined canvas ${canvasId} (room: ${room})`
      );
    } catch (err) {
      console.error(`[canvas] canvas:join error for user ${userId}:`, err);
    }
  });

  /**
   * canvas:leave — Unsubscribe from a canvas room.
   */
  socket.on('canvas:leave', async ({ canvasId }) => {
    try {
      if (!canvasId) return;
      await socket.leave(`canvas:${canvasId}`);
      console.log(`[canvas] User ${userId} left canvas ${canvasId}`);
    } catch (err) {
      console.error(`[canvas] canvas:leave error for user ${userId}:`, err);
    }
  });

  /**
   * canvas:update — Relay a Yjs document update to other editors.
   *
   * Broadcasts the update to all other sockets in the canvas room via
   * `canvas:update`. Buffers the update for a debounced DB save every 5s.
   *
   * Authorization: socket must already be in the canvas room, which is only
   * possible after a successful (authorized) canvas:join.
   */
  socket.on('canvas:update', ({ canvasId, update }) => {
    try {
      if (!canvasId || update === undefined) {
        console.warn(`[canvas] canvas:update — missing canvasId or update from user ${userId}`);
        return;
      }

      const room = `canvas:${canvasId}`;

      // Reject updates from sockets that never joined the room through canvas:join
      if (!socket.rooms.has(room)) {
        console.warn(
          `[canvas] canvas:update — user ${userId} is not in canvas room ${room} (unauthorized)`
        );
        return;
      }

      // Broadcast to all OTHER editors in this canvas room
      socket.to(room).emit('canvas:update', { canvasId, update });

      // Accumulate update for debounced DB persistence — append, never overwrite,
      // so concurrent updates within the debounce window are all preserved.
      const pending = pendingCanvasUpdates.get(canvasId) ?? [];
      pending.push(update as string);
      pendingCanvasUpdates.set(canvasId, pending);
      scheduleDebouncedSave(canvasId);
    } catch (err) {
      console.error(`[canvas] canvas:update error for user ${userId}:`, err);
    }
  });

  /**
   * canvas:awareness — Broadcast cursor/selection awareness to other editors.
   *
   * Wraps the user's awareness state in a map keyed by userId and forwards
   * it to all other sockets in the canvas room.
   *
   * Authorization: socket must already be in the canvas room, which is only
   * possible after a successful (authorized) canvas:join.
   */
  socket.on('canvas:awareness', ({ canvasId, state }) => {
    try {
      if (!canvasId || state === undefined) {
        console.warn(`[canvas] canvas:awareness — missing canvasId or state from user ${userId}`);
        return;
      }

      const room = `canvas:${canvasId}`;

      // Reject awareness from sockets that never joined the room through canvas:join
      if (!socket.rooms.has(room)) {
        console.warn(
          `[canvas] canvas:awareness — user ${userId} is not in canvas room ${room} (unauthorized)`
        );
        return;
      }

      // Broadcast this user's awareness state to all other canvas editors
      socket.to(room).emit('canvas:awareness', {
        canvasId,
        states: { [userId]: state },
      });
    } catch (err) {
      console.error(`[canvas] canvas:awareness error for user ${userId}:`, err);
    }
  });
}
