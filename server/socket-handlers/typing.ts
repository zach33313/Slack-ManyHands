/**
 * server/socket-handlers/typing.ts
 *
 * Typing indicator handlers for Socket.IO.
 *
 * Maintains an in-memory map of channelId → typing users with auto-expire timeouts.
 * Broadcasts the current list of typing users to the channel room whenever it changes.
 *
 * Handles:
 * - typing:start — Adds user to the channel's typing set with 3s auto-expire
 * - typing:stop  — Removes user from the channel's typing set
 * - disconnect    — Cleans up all typing entries for the disconnected user
 */

import type { Socket, Server as SocketIOServer } from 'socket.io';
import { prisma } from '../../shared/lib/prisma';
import { channelRoom, TYPING_TIMEOUT } from '../../shared/lib/constants';
import type { TypingUser } from '../../shared/types';
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

type AppServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/** Per-user typing entry with auto-expire timer */
interface TypingEntry {
  userId: string;
  name: string;
  timeout: NodeJS.Timeout;
}

/**
 * In-memory typing state.
 * Maps channelId → Map<userId, TypingEntry>.
 */
const typingByChannel = new Map<string, Map<string, TypingEntry>>();

/**
 * Returns the current list of typing users for a channel,
 * excluding a specific user (the one who triggered the update).
 */
function getTypingUsers(channelId: string, excludeUserId?: string): TypingUser[] {
  const channelTyping = typingByChannel.get(channelId);
  if (!channelTyping) return [];

  const users: TypingUser[] = [];
  for (const [uid, entry] of channelTyping) {
    if (uid !== excludeUserId) {
      users.push({ userId: entry.userId, name: entry.name });
    }
  }
  return users;
}

/**
 * Removes a user from a channel's typing set, cleaning up empty maps.
 */
function removeTypingUser(channelId: string, userId: string): void {
  const channelTyping = typingByChannel.get(channelId);
  if (!channelTyping) return;

  const entry = channelTyping.get(userId);
  if (entry) {
    clearTimeout(entry.timeout);
    channelTyping.delete(userId);
  }

  // Clean up empty channel maps
  if (channelTyping.size === 0) {
    typingByChannel.delete(channelId);
  }
}

/**
 * Broadcasts the current typing users list to a channel room.
 * Emits to all sockets in the room except the triggering socket.
 */
function broadcastTypingUsers(
  socket: AppSocket,
  channelId: string,
  excludeUserId: string
): void {
  const users = getTypingUsers(channelId, excludeUserId);
  socket.to(channelRoom(channelId)).emit('typing:users', {
    channelId,
    users,
  });
}

/**
 * Registers typing indicator handlers on a connected socket.
 */
export function registerTypingHandlers(
  socket: AppSocket,
  io: AppServer
): void {
  const userId = socket.data.userId;

  /**
   * typing:start — The user has started typing in a channel.
   *
   * Adds the user to the channel's typing set with a 3-second auto-expire timeout.
   * If already typing, resets the timeout. Broadcasts updated typing users list
   * to the channel room (excluding the typer themselves).
   */
  socket.on('typing:start', async ({ channelId }) => {
    if (!channelId) return;

    // Get or create the channel typing map
    let channelTyping = typingByChannel.get(channelId);
    if (!channelTyping) {
      channelTyping = new Map();
      typingByChannel.set(channelId, channelTyping);
    }

    // Clear existing timeout if re-starting
    const existing = channelTyping.get(userId);
    if (existing) {
      clearTimeout(existing.timeout);
    }

    // Resolve the user's display name from the database on first typing event
    let userName = existing?.name || '';
    if (!userName) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        });
        userName = user?.name || 'Someone';
      } catch {
        userName = 'Someone';
      }
    }

    // Set auto-expire timeout — stop typing after TYPING_TIMEOUT ms of inactivity
    const timeout = setTimeout(() => {
      removeTypingUser(channelId, userId);
      // Broadcast that this user stopped typing
      io.to(channelRoom(channelId)).emit('typing:users', {
        channelId,
        users: getTypingUsers(channelId),
      });
    }, TYPING_TIMEOUT);

    channelTyping.set(userId, { userId, name: userName, timeout });

    // Broadcast to channel room (excluding the typer)
    broadcastTypingUsers(socket, channelId, userId);
  });

  /**
   * typing:stop — The user has stopped typing in a channel.
   *
   * Removes the user from the channel's typing set and broadcasts
   * the updated typing users list.
   */
  socket.on('typing:stop', ({ channelId }) => {
    if (!channelId) return;

    removeTypingUser(channelId, userId);
    broadcastTypingUsers(socket, channelId, userId);
  });

  /**
   * On disconnect, remove the user from all channels' typing sets.
   * This prevents stale "user is typing" indicators.
   */
  socket.on('disconnect', () => {
    // Find all channels where this user is typing and clean up
    for (const [channelId, channelTyping] of typingByChannel) {
      if (channelTyping.has(userId)) {
        removeTypingUser(channelId, userId);

        // Broadcast updated typing users to the channel
        io.to(channelRoom(channelId)).emit('typing:users', {
          channelId,
          users: getTypingUsers(channelId),
        });
      }
    }
  });
}
