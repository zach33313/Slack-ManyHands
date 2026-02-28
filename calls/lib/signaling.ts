/**
 * calls/lib/signaling.ts
 *
 * Helper functions wrapping Socket.IO emit for all call and huddle signaling events.
 * Centralizes event emission so hooks don't embed raw socket.emit calls.
 *
 * Usage:
 *   import { emitCallInitiate, emitCallSignal } from '@/calls/lib/signaling'
 *   emitCallInitiate(socket, channelId, '1:1')
 */

import type { AppSocket } from '@/shared/lib/socket-client';
import type { CallType } from '@/calls/types';

// ---------------------------------------------------------------------------
// Call signaling helpers
// ---------------------------------------------------------------------------

/** Initiate a 1:1 call or channel huddle */
export function emitCallInitiate(
  socket: AppSocket,
  channelId: string,
  type: CallType
): void {
  socket.emit('call:initiate', { channelId, type });
}

/** Accept an incoming call */
export function emitCallAccept(socket: AppSocket, callId: string): void {
  socket.emit('call:accept', { callId });
}

/** Decline an incoming call */
export function emitCallDecline(socket: AppSocket, callId: string): void {
  socket.emit('call:decline', { callId });
}

/** Hang up / leave an active call */
export function emitCallHangup(socket: AppSocket, callId: string): void {
  socket.emit('call:hangup', { callId });
}

/** Send a WebRTC signal to a specific peer via the signaling server */
export function emitCallSignal(
  socket: AppSocket,
  callId: string,
  toUserId: string,
  signal: unknown
): void {
  socket.emit('call:signal', { callId, toUserId, signal });
}

/** Toggle mute / camera state during a call */
export function emitCallToggleMedia(
  socket: AppSocket,
  callId: string,
  isMuted: boolean,
  isCameraOn: boolean
): void {
  socket.emit('call:toggle-media', { callId, isMuted, isCameraOn });
}

// ---------------------------------------------------------------------------
// Huddle signaling helpers
// ---------------------------------------------------------------------------

/** Join a channel huddle */
export function emitHuddleJoin(socket: AppSocket, channelId: string): void {
  socket.emit('huddle:join', { channelId });
}

/** Leave a channel huddle */
export function emitHuddleLeave(socket: AppSocket, channelId: string): void {
  socket.emit('huddle:leave', { channelId });
}

/** Send a WebRTC signal to a specific huddle peer */
export function emitHuddleSignal(
  socket: AppSocket,
  channelId: string,
  toUserId: string,
  signal: unknown
): void {
  socket.emit('huddle:signal', { channelId, toUserId, signal });
}

/** Toggle mute / camera state in a huddle */
export function emitHuddleToggleMedia(
  socket: AppSocket,
  channelId: string,
  isMuted: boolean,
  isCameraOn: boolean
): void {
  socket.emit('huddle:toggle-media', { channelId, isMuted, isCameraOn });
}
