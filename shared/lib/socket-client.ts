/**
 * shared/lib/socket-client.ts
 *
 * Socket.IO client singleton — browser-only.
 *
 * This module must only be imported inside "use client" components via useEffect.
 * Never import this file in Server Components or server-side code.
 *
 * The singleton pattern ensures a single persistent WebSocket connection
 * is shared across all components, rather than creating one per component.
 *
 * Usage:
 *   // In a "use client" component:
 *   import { getSocket } from '@/shared/lib/socket-client'
 *   const socket = getSocket()
 *   socket.emit('channel:join', { channelId })
 *
 * Prefer the useSocket() hook from shared/hooks/useSocket.ts over importing this directly.
 */

'use client';

import { io, type Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@/shared/types/socket';

/** Typed Socket.IO client instance */
export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | undefined;

/**
 * Returns the shared Socket.IO client instance, creating it on first call.
 *
 * The socket connects to the same origin on the /socket.io path.
 * Authentication is handled automatically via the NextAuth session cookie
 * (same origin = cookies sent automatically on the HTTP handshake).
 *
 * @returns The singleton AppSocket instance
 */
export function getSocket(): AppSocket {
  if (!socket) {
    socket = io({
      // Same origin — no explicit host/port needed
      path: '/socket.io',
      // Start with long-polling, upgrade to WebSocket (handles proxies/load balancers)
      transports: ['polling', 'websocket'],
      // Send NextAuth session cookie with the handshake
      withCredentials: true,
      // Reconnect up to 5 times on disconnect
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    if (process.env.NODE_ENV === 'development') {
      socket.on('connect', () =>
        console.log('[socket] connected:', socket?.id)
      );
      socket.on('disconnect', (reason) =>
        console.log('[socket] disconnected:', reason)
      );
      socket.on('connect_error', (err) =>
        console.error('[socket] connect_error:', err.message)
      );
    }
  }

  return socket;
}

/**
 * Disconnect the socket and clear the singleton.
 * Call this on sign-out to clean up the connection.
 */
export function disconnectSocket(): void {
  socket?.disconnect();
  socket = undefined;
}
