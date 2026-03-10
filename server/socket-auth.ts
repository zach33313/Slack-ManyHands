/**
 * server/socket-auth.ts
 *
 * Socket.IO authentication middleware using NextAuth v5 JWT validation.
 *
 * On each connection handshake, extracts the NextAuth session cookie from the
 * raw HTTP headers, decrypts and validates the JWT using getToken() from
 * next-auth/jwt, and attaches the userId to socket.data for downstream handlers.
 *
 * Because the Socket.IO server runs on the same origin and port as Next.js,
 * session cookies are sent automatically — no manual token passing needed.
 */

import { getToken } from 'next-auth/jwt';
import type { Server as SocketIOServer } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../shared/types/socket';

type AppServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * Applies NextAuth JWT authentication middleware to the Socket.IO server.
 *
 * Every incoming connection must have a valid NextAuth session cookie.
 * If the token is invalid or missing, the connection is rejected with
 * an 'unauthorized' error.
 *
 * After validation, the user's ID and email are attached to socket.data
 * for all downstream event handlers to use.
 */
export function applyAuthMiddleware(io: AppServer): void {
  io.use(async (socket, next) => {
    try {
      // socket.request is the raw HTTP IncomingMessage from the upgrade/polling request
      const req = socket.request as typeof socket.request & {
        cookies?: Record<string, string>;
      };

      // NextAuth v5 cookie name depends on whether AUTH_URL uses HTTPS.
      // HTTPS (including dev with self-signed certs): __Secure-authjs.session-token
      // HTTP (plain localhost dev): authjs.session-token
      const isSecure =
        process.env.NODE_ENV === 'production' ||
        process.env.AUTH_URL?.startsWith('https');
      const cookieName = isSecure
        ? '__Secure-authjs.session-token'
        : 'authjs.session-token';

      // Parse cookies from the raw Cookie header if not already parsed
      if (!req.cookies) {
        const cookieHeader = req.headers.cookie || '';
        req.cookies = Object.fromEntries(
          cookieHeader.split(';').map((c) => {
            const [key, ...rest] = c.trim().split('=');
            return [key, rest.join('=')];
          })
        );
      }

      // Use next-auth/jwt getToken to decrypt and validate the session JWT
      const token = await getToken({
        req: req as any,
        secret: process.env.AUTH_SECRET!,
        cookieName,
      });

      if (!token || !token.sub) {
        return next(new Error('unauthorized'));
      }

      // Attach authenticated user info to socket.data for downstream handlers
      socket.data.userId = token.sub;
      socket.data.email = (token.email as string) || '';

      next();
    } catch (err) {
      console.error('[socket-auth] Authentication error:', err);
      next(new Error('unauthorized'));
    }
  });
}
