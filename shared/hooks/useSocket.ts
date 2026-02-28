/**
 * shared/hooks/useSocket.ts
 *
 * React hook that returns the typed Socket.IO client singleton.
 *
 * Ensures the socket is only accessed in browser context (never during SSR)
 * and that the socket is connected before returning.
 *
 * Usage:
 *   "use client"
 *   const socket = useSocket()
 *   useEffect(() => {
 *     socket.on('message:new', handleNewMessage)
 *     return () => { socket.off('message:new', handleNewMessage) }
 *   }, [socket])
 */

'use client';

import { useEffect, useRef } from 'react';
import { getSocket, type AppSocket } from '@/shared/lib/socket-client';

/**
 * Returns the shared Socket.IO client instance.
 * Safe to call in any "use client" component.
 *
 * The socket connects on first call and is reused for the lifetime of the app.
 * Components are responsible for removing event listeners in their cleanup functions.
 *
 * @returns Typed AppSocket instance
 */
export function useSocket(): AppSocket {
  const socketRef = useRef<AppSocket | null>(null);

  if (!socketRef.current) {
    socketRef.current = getSocket();
  }

  return socketRef.current;
}
