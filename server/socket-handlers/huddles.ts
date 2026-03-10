/**
 * server/socket-handlers/huddles.ts
 *
 * Group huddle signaling handler for Socket.IO.
 *
 * Huddles are persistent, channel-scoped audio/video rooms. Unlike 1:1 calls,
 * there is no ring phase — users join and leave freely at any time.
 * Maximum participants enforced server-side: 6.
 *
 * Lifecycle:
 *   - First user joins  → huddle:started     emitted to channel room
 *   - More users join   → huddle:user-joined emitted to channel room
 *   - User leaves       → huddle:user-left   emitted to channel room
 *   - Last user leaves  → huddle:ended       emitted to channel room
 *
 * WebRTC topology: full mesh via simple-peer.
 * On join, the server sends the current participant list (huddle:participants)
 * so the client can initiate a peer connection with each existing participant
 * by exchanging huddle:signal messages.
 */

import type { Socket, Server as SocketIOServer } from 'socket.io';
import { prisma } from '../../shared/lib/prisma';
import { channelRoom, userRoom } from '../../shared/lib/constants';
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

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

const MAX_HUDDLE_PARTICIPANTS = 6;

interface ParticipantState {
  userId: string;
  user: { id: string; name: string | null; image: string | null };
  isMuted: boolean;
  isCameraOn: boolean;
  joinedAt: Date;
}

interface HuddleState {
  channelId: string;
  participants: Map<string, ParticipantState>;
  startedAt: Date;
}

/** channelId → huddle state */
const activeHuddles = new Map<string, HuddleState>();

/** userId → channelId — ensures a user is in at most one huddle at a time */
const userActiveHuddle = new Map<string, string>();

// ---------------------------------------------------------------------------
// Public helpers (used by channels.ts for huddle state sync on channel:join)
// ---------------------------------------------------------------------------

/**
 * Returns the active huddle participants for a channel, or null if no huddle.
 * Used by channel:join to send huddle state to users entering a channel.
 */
export function getActiveHuddlePayload(channelId: string) {
  const huddle = activeHuddles.get(channelId);
  if (!huddle || huddle.participants.size === 0) return null;
  return {
    channelId,
    participants: Array.from(huddle.participants.values()).map(toPayload),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPayload(p: ParticipantState) {
  return {
    userId: p.userId,
    user: {
      id: p.user.id,
      name: p.user.name ?? 'Unknown',
      image: p.user.image,
    },
    isMuted: p.isMuted,
    isCameraOn: p.isCameraOn,
    joinedAt: p.joinedAt,
  };
}

/**
 * Remove a user from their active huddle and emit the appropriate events.
 * If the huddle becomes empty after the user leaves, emit huddle:ended.
 */
async function handleHuddleLeave(
  io: AppServer,
  userId: string,
  channelId: string,
): Promise<void> {
  const huddle = activeHuddles.get(channelId);
  if (!huddle) return;

  if (!huddle.participants.has(userId)) return;

  huddle.participants.delete(userId);
  userActiveHuddle.delete(userId);

  io.to(channelRoom(channelId)).emit('huddle:user-left', { channelId, userId });

  console.log(`[huddles] ${userId} left huddle in channel ${channelId}`);

  if (huddle.participants.size === 0) {
    activeHuddles.delete(channelId);
    io.to(channelRoom(channelId)).emit('huddle:ended', { channelId });
    console.log(`[huddles] Huddle ended in channel ${channelId} (all participants left)`);
  }
}

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------

export function registerHuddleHandlers(socket: AppSocket, io: AppServer): void {
  const userId = socket.data.userId;

  // ─── huddle:join ──────────────────────────────────────────────────────────
  socket.on('huddle:join', async ({ channelId }) => {
    // If already in a different huddle, leave it first
    const existingChannel = userActiveHuddle.get(userId);
    if (existingChannel && existingChannel !== channelId) {
      await handleHuddleLeave(io, userId, existingChannel);
    }

    // Already in this huddle — idempotent
    if (userActiveHuddle.get(userId) === channelId) return;

    let huddle = activeHuddles.get(channelId);

    if (huddle && huddle.participants.size >= MAX_HUDDLE_PARTICIPANTS) {
      console.warn(
        `[huddles] Huddle in channel ${channelId} is full (max ${MAX_HUDDLE_PARTICIPANTS})`,
      );
      return;
    }

    try {
      const userRecord = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, image: true },
      });
      if (!userRecord) return;

      const participantState: ParticipantState = {
        userId,
        user: userRecord,
        isMuted: false,
        isCameraOn: false,
        joinedAt: new Date(),
      };

      const isNewHuddle = !huddle;

      if (!huddle) {
        huddle = {
          channelId,
          participants: new Map(),
          startedAt: new Date(),
        };
        activeHuddles.set(channelId, huddle);
      }

      huddle.participants.set(userId, participantState);
      userActiveHuddle.set(userId, channelId);

      // Send current participant snapshot to the joiner
      const allParticipants = Array.from(huddle.participants.values()).map(toPayload);
      socket.emit('huddle:participants', { channelId, participants: allParticipants });

      if (isNewHuddle) {
        io.to(channelRoom(channelId)).emit('huddle:started', {
          channelId,
          participants: allParticipants,
        });
        console.log(`[huddles] Huddle started in channel ${channelId} by ${userId}`);
      } else {
        io.to(channelRoom(channelId)).emit('huddle:user-joined', {
          channelId,
          participant: toPayload(participantState),
        });
        console.log(`[huddles] ${userId} joined huddle in channel ${channelId}`);
      }
    } catch (err) {
      console.error('[huddles] huddle:join error:', err);
    }
  });

  // ─── huddle:leave ─────────────────────────────────────────────────────────
  socket.on('huddle:leave', ({ channelId }) => {
    void handleHuddleLeave(io, userId, channelId);
  });

  // ─── huddle:signal ────────────────────────────────────────────────────────
  // Relay WebRTC offer/answer/ICE candidate between huddle peers
  socket.on('huddle:signal', ({ channelId, toUserId, signal }) => {
    const huddle = activeHuddles.get(channelId);
    if (!huddle) return;

    // Verify the sender is an active participant in this huddle
    if (!huddle.participants.has(userId)) return;

    // Verify the target is also a participant in this huddle
    if (!huddle.participants.has(toUserId)) return;

    io.to(userRoom(toUserId)).emit('huddle:signal', {
      channelId,
      fromUserId: userId,
      signal,
    });
  });

  // ─── huddle:toggle-media ──────────────────────────────────────────────────
  socket.on('huddle:toggle-media', ({ channelId, isMuted, isCameraOn }) => {
    const huddle = activeHuddles.get(channelId);
    if (!huddle) return;

    const participant = huddle.participants.get(userId);
    if (!participant) return;

    participant.isMuted = isMuted;
    participant.isCameraOn = isCameraOn;

    io.to(channelRoom(channelId)).emit('huddle:media-toggled', {
      channelId,
      userId,
      isMuted,
      isCameraOn,
    });
  });

  // ─── disconnect cleanup ───────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const channelId = userActiveHuddle.get(userId);
    if (channelId) {
      void handleHuddleLeave(io, userId, channelId);
    }
  });
}
