/**
 * server/socket-handlers/index.ts
 *
 * Registers all domain Socket.IO event handlers on each connected socket.
 *
 * This is the central wiring point called from server.ts after the Socket.IO
 * server is created and auth middleware is applied. Each domain handler module
 * registers its own event listeners on the socket.
 *
 * Flow:
 *   server.ts → registerHandlers(io) → io.on('connection', ...) →
 *     joins user to personal room → registers domain handlers → logs connection
 */

import type { Server as SocketIOServer } from 'socket.io';
import { userRoom } from '../../shared/lib/constants';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../../shared/types/socket';
import { registerMessageHandlers } from './messages';
import { registerPresenceHandlers } from './presence';
import { registerTypingHandlers } from './typing';
import { registerChannelHandlers } from './channels';
import { registerPollHandlers } from './polls';
import { registerCanvasHandlers } from './canvas';
import { registerReadReceiptHandlers } from './read-receipts';
import { registerCallHandlers } from './calls';
import { registerHuddleHandlers } from './huddles';

type AppServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * Registers the 'connection' event listener on the Socket.IO server.
 * For each connected socket:
 *   1. Logs the connection with userId
 *   2. Joins the socket to the user's personal room (user:${userId})
 *   3. Registers all domain-specific event handlers
 *   4. Sets up disconnect logging and presence cleanup
 *
 * @param io - The typed Socket.IO server instance
 */
export function registerHandlers(io: AppServer): void {
  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    console.log(`[socket] Connected: ${socket.id} (user: ${userId})`);

    // Join the user's personal room for user-specific events
    // (notifications, DM pings, etc.)
    const room = userRoom(userId);
    socket.join(room);
    console.log(`[socket] User ${userId} joined room: ${room}`);

    // Register all domain event handlers
    registerChannelHandlers(socket);
    registerMessageHandlers(socket);
    registerPresenceHandlers(socket);
    registerTypingHandlers(socket, io);
    registerPollHandlers(socket);
    registerCanvasHandlers(socket);
    registerReadReceiptHandlers(socket);
    registerCallHandlers(socket, io);
    registerHuddleHandlers(socket, io);

    // Log disconnections (presence cleanup is handled by registerPresenceHandlers)
    socket.on('disconnect', (reason) => {
      console.log(
        `[socket] Disconnected: ${socket.id} (user: ${userId}, reason: ${reason})`
      );
    });
  });
}
