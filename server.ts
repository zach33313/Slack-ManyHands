/**
 * server.ts
 *
 * Custom HTTP server entry point that integrates Next.js with Socket.IO.
 *
 * Creates a single http.Server that handles:
 * - All Next.js page/API requests via the Next.js request handler
 * - Socket.IO WebSocket/polling connections on the /socket.io path
 *
 * This same-origin approach means NextAuth session cookies are sent
 * automatically on Socket.IO handshakes — no CORS or manual token passing.
 *
 * Usage:
 *   Development: tsx watch server.ts
 *   Production:  node dist/server/server.js
 */

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { applyAuthMiddleware } from './server/socket-auth';
import { registerHandlers } from './server/socket-handlers';
import { startScheduledMessagesCron } from './server/cron/scheduled-messages';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from './shared/types/socket';

// Extend globalThis to hold the Socket.IO instance for access from API routes
declare global {
  // eslint-disable-next-line no-var
  var __socketio: SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  > | undefined;
}

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // Create typed Socket.IO server on the same HTTP server
  const io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, {
    // Same origin — CORS disabled for same-port setup
    cors: undefined,
    // Connection timeouts
    pingTimeout: 60_000,
    pingInterval: 25_000,
  });

  // Store io instance globally so API Route Handlers can emit events via getIO()
  globalThis.__socketio = io;

  // Apply NextAuth JWT authentication middleware to validate every connection
  applyAuthMiddleware(io);

  // Register all domain event handlers (messages, presence, typing, channels,
  // polls, canvas, read receipts)
  registerHandlers(io);

  // Start background cron jobs (must run after Socket.IO is initialized)
  startScheduledMessagesCron();

  const hostname = process.env.HOSTNAME || '0.0.0.0';
  httpServer.listen(port, hostname, () => {
    console.log(
      `> Server listening on ${hostname}:${port} (${dev ? 'development' : 'production'})`
    );
  });
});
