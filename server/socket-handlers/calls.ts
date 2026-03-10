/**
 * server/socket-handlers/calls.ts
 *
 * 1:1 call signaling handler for Socket.IO.
 *
 * Maintains an in-memory map of active calls and relays WebRTC
 * signaling messages between peers. Call lifecycle:
 *
 *   1. Caller emits call:initiate → server creates call record in memory,
 *      emits call:incoming to all other channel members
 *   2. Callee emits call:accept   → server emits call:accepted to all participants,
 *      WebRTC negotiation begins via call:signal relay
 *   3. Either peer emits call:hangup (or call declines/times out) →
 *      server emits call:ended to all parties and saves history to DB
 *
 * Ring timeout: if no callee accepts within 30s, the call ends with reason 'no_answer'.
 */

import type { Socket, Server as SocketIOServer } from 'socket.io';
import { prisma } from '../../shared/lib/prisma';
import { userRoom } from '../../shared/lib/constants';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  CallType,
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

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

interface ActiveCall {
  id: string;
  channelId: string;
  type: CallType;
  initiatorId: string;
  /** Users who were notified of call:incoming (for cleanup on no_answer/declined) */
  calleeIds: string[];
  /** Users who accepted and are actively in the call */
  participantIds: Set<string>;
  /** Per-participant media state */
  participantState: Map<string, { isMuted: boolean; isCameraOn: boolean }>;
  status: 'ringing' | 'connected' | 'ended';
  startedAt: Date;
  /** Cleared when the first callee accepts or call is declined/timed out */
  ringTimeout: NodeJS.Timeout | null;
}

/** callId → active call state */
const activeCalls = new Map<string, ActiveCall>();

/** userId → callId — prevents a user from being in two calls simultaneously */
const userActiveCall = new Map<string, string>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Emit call:ended to all relevant parties and clean up in-memory state.
 * Saves call history to the database asynchronously.
 */
function endCall(io: AppServer, callId: string, reason: string): void {
  const call = activeCalls.get(callId);
  if (!call || call.status === 'ended') return;

  call.status = 'ended';

  if (call.ringTimeout) {
    clearTimeout(call.ringTimeout);
    call.ringTimeout = null;
  }

  // Notify every party who was involved (accepted participants + callee(s) who may still be ringing)
  const allToNotify = new Set([...call.participantIds, ...call.calleeIds]);
  for (const uid of allToNotify) {
    io.to(userRoom(uid)).emit('call:ended', { callId, reason });
    userActiveCall.delete(uid);
  }

  activeCalls.delete(callId);

  void saveCallHistory(call);
}

/** Persist the call record and its participants to the database. */
async function saveCallHistory(call: ActiveCall): Promise<void> {
  const endedAt = new Date();
  const durationSecs = Math.round(
    (endedAt.getTime() - call.startedAt.getTime()) / 1000,
  );

  try {
    const saved = await prisma.call.create({
      data: {
        channelId: call.channelId,
        initiatorId: call.initiatorId,
        startedAt: call.startedAt,
        endedAt,
        duration: durationSecs,
      },
    });

    if (call.participantIds.size > 0) {
      await prisma.callParticipant.createMany({
        data: Array.from(call.participantIds).map((userId) => ({
          callId: saved.id,
          userId,
        })),
      });
    }
  } catch (err) {
    console.error('[calls] Failed to save call history:', err);
  }
}

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------

export function registerCallHandlers(socket: AppSocket, io: AppServer): void {
  const userId = socket.data.userId;

  // ─── call:initiate ────────────────────────────────────────────────────────
  socket.on('call:initiate', async ({ channelId, type }) => {
    console.log(`[calls] call:initiate received from ${userId} for channel ${channelId} (type: ${type})`);

    if (userActiveCall.has(userId)) {
      console.warn(`[calls] ${userId} already in a call (${userActiveCall.get(userId)}) — ignoring initiate`);
      return;
    }

    try {
      const caller = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      if (!caller) {
        console.error(`[calls] Caller user not found in DB: ${userId}`);
        return;
      }

      const members = await prisma.channelMember.findMany({
        where: { channelId, userId: { not: userId } },
        select: { userId: true },
      });

      if (members.length === 0) {
        console.warn(`[calls] No other members in channel ${channelId}`);
        return;
      }

      const callId = crypto.randomUUID();
      const calleeIds = members.map((m) => m.userId);

      const call: ActiveCall = {
        id: callId,
        channelId,
        type,
        initiatorId: userId,
        calleeIds,
        participantIds: new Set([userId]),
        participantState: new Map([[userId, { isMuted: false, isCameraOn: true }]]),
        status: 'ringing',
        startedAt: new Date(),
        ringTimeout: null,
      };

      activeCalls.set(callId, call);
      userActiveCall.set(userId, callId);

      console.log(`[calls] Emitting call:incoming to ${calleeIds.length} callee(s): ${calleeIds.join(', ')}`);
      for (const calleeId of calleeIds) {
        const room = userRoom(calleeId);
        const roomSockets = io.sockets.adapter.rooms.get(room);
        console.log(`[calls]   → ${room} (${roomSockets?.size ?? 0} socket(s) in room)`);
        io.to(room).emit('call:incoming', {
          callId,
          channelId,
          callerId: userId,
          callerName: caller.name ?? 'Unknown',
          type,
        });
      }

      // 30-second ring timeout — auto-end with 'no_answer'
      call.ringTimeout = setTimeout(() => {
        const activeCall = activeCalls.get(callId);
        if (activeCall && activeCall.status === 'ringing') {
          endCall(io, callId, 'no_answer');
          console.log(`[calls] Call ${callId} timed out (no answer)`);
        }
      }, 30_000);

      console.log(`[calls] Call ${callId} initiated by ${userId} (${caller.name}) in channel ${channelId}`);
    } catch (err) {
      console.error('[calls] call:initiate error:', err);
    }
  });

  // ─── call:accept ──────────────────────────────────────────────────────────
  socket.on('call:accept', ({ callId }) => {
    const call = activeCalls.get(callId);
    if (!call || call.status !== 'ringing') return;

    // Only intended callees may accept — prevents any authenticated user who
    // discovers a callId from joining a private call between other users.
    if (!call.calleeIds.includes(userId)) {
      console.warn(`[calls] ${userId} is not a callee for call ${callId} — ignoring accept`);
      return;
    }

    if (userActiveCall.has(userId)) {
      console.warn(`[calls] ${userId} already in a call — cannot accept ${callId}`);
      return;
    }

    if (call.ringTimeout) {
      clearTimeout(call.ringTimeout);
      call.ringTimeout = null;
    }

    call.status = 'connected';
    call.participantIds.add(userId);
    call.participantState.set(userId, { isMuted: false, isCameraOn: true });
    userActiveCall.set(userId, callId);

    // Notify all current participants (including the joiner and initiator)
    for (const uid of call.participantIds) {
      io.to(userRoom(uid)).emit('call:accepted', { callId, userId });
    }

    console.log(`[calls] Call ${callId} accepted by ${userId}`);
  });

  // ─── call:decline ─────────────────────────────────────────────────────────
  socket.on('call:decline', ({ callId }) => {
    const call = activeCalls.get(callId);
    if (!call) return;

    // Only intended callees may decline — prevents any authenticated user who
    // discovers a callId from unilaterally terminating a call between others.
    if (!call.calleeIds.includes(userId)) {
      console.warn(`[calls] ${userId} is not a callee for call ${callId} — ignoring decline`);
      return;
    }

    // Tell the initiator who declined (before endCall cleans up)
    io.to(userRoom(call.initiatorId)).emit('call:declined', { callId, userId });

    endCall(io, callId, 'declined');

    console.log(`[calls] Call ${callId} declined by ${userId}`);
  });

  // ─── call:hangup ──────────────────────────────────────────────────────────
  socket.on('call:hangup', ({ callId }) => {
    const call = activeCalls.get(callId);
    if (!call) return;

    endCall(io, callId, 'hangup');

    console.log(`[calls] Call ${callId} hung up by ${userId}`);
  });

  // ─── call:signal ──────────────────────────────────────────────────────────
  // Relay WebRTC offer/answer/ICE candidate to the target peer
  socket.on('call:signal', ({ callId, toUserId, signal }) => {
    const call = activeCalls.get(callId);
    if (!call || call.status === 'ended') return;

    // Verify the sender is an active participant in this call
    if (!call.participantIds.has(userId)) return;

    // Verify the target is also an active participant in this call
    if (!call.participantIds.has(toUserId)) return;

    io.to(userRoom(toUserId)).emit('call:signal', {
      callId,
      fromUserId: userId,
      signal,
    });
  });

  // ─── call:toggle-media ────────────────────────────────────────────────────
  socket.on('call:toggle-media', ({ callId, isMuted, isCameraOn }) => {
    const call = activeCalls.get(callId);
    if (!call || call.status === 'ended') return;

    const state = call.participantState.get(userId);
    if (!state) return;

    state.isMuted = isMuted;
    state.isCameraOn = isCameraOn;

    for (const uid of call.participantIds) {
      io.to(userRoom(uid)).emit('call:media-toggled', {
        callId,
        userId,
        isMuted,
        isCameraOn,
      });
    }
  });

  // ─── disconnect cleanup ───────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const callId = userActiveCall.get(userId);
    if (callId) {
      endCall(io, callId, 'hangup');
    }
  });
}
