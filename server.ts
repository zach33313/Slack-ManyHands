/**
 * server.ts
 *
 * Custom HTTP/HTTPS server entry point that integrates Next.js with Socket.IO.
 *
 * Creates a single server that handles:
 * - All Next.js page/API requests via the Next.js request handler
 * - Socket.IO WebSocket/polling connections on the /socket.io path
 *
 * If certs/key.pem and certs/cert.pem exist, the server runs over HTTPS
 * (required for WebRTC mediaDevices on non-localhost origins).
 * Otherwise falls back to plain HTTP.
 *
 * Usage:
 *   Development: tsx watch server.ts
 *   Production:  node dist/server/server.js
 */

import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
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

// Check for TLS certificates
const certPath = resolve(__dirname, 'certs/cert.pem');
const keyPath = resolve(__dirname, 'certs/key.pem');
const hasSSL = existsSync(certPath) && existsSync(keyPath);

app.prepare().then(() => {
  const handler = (req: any, res: any) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  };

  const server = hasSSL
    ? createHttpsServer(
        {
          key: readFileSync(keyPath),
          cert: readFileSync(certPath),
        },
        handler
      )
    : createHttpServer(handler);

  const protocol = hasSSL ? 'https' : 'http';

  // Create typed Socket.IO server on the same HTTP/HTTPS server
  const io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(server, {
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
  server.listen(port, hostname, () => {
    console.log(
      `> Server listening on ${protocol}://${hostname}:${port} (${dev ? 'development' : 'production'})`
    );
    if (hasSSL) {
      console.log('> TLS enabled — loaded certs from certs/');
    } else {
      console.log('> TLS disabled — mediaDevices (calls) only works on localhost');
    }
  });
});
