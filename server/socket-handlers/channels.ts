/**
 * server/socket-handlers/channels.ts
 *
 * Channel room management for Socket.IO.
 *
 * Handles:
 * - channel:join  — Socket joins the channel room (after verifying membership)
 * - channel:leave — Socket leaves the channel room
 *
 * Channel rooms use the naming convention `channel:${channelId}` (via channelRoom()).
 * Only users who are members of the channel in the database are allowed to join.
 */

import type { Socket } from 'socket.io';
import { prisma } from '../../shared/lib/prisma';
import { channelRoom } from '../../shared/lib/constants';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../../shared/types/socket';
import { getActiveHuddlePayload } from './huddles';

type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * Registers channel room management handlers on a connected socket.
 */
export function registerChannelHandlers(socket: AppSocket): void {
  const userId = socket.data.userId;

  /**
   * channel:join — Subscribe to a channel's real-time events.
   *
   * Verifies the user is a member of the channel before joining the room.
   * If not a member, the join is silently rejected (logged server-side).
   */
  socket.on('channel:join', async ({ channelId }) => {
    try {
      if (!channelId) {
        console.warn(`[channels] channel:join missing channelId from user ${userId}`);
        return;
      }

      // Verify the user is a member of this channel
      const membership = await prisma.channelMember.findUnique({
        where: {
          channelId_userId: {
            channelId,
            userId,
          },
        },
      });

      if (!membership) {
        console.warn(
          `[channels] User ${userId} attempted to join channel ${channelId} without membership`
        );
        return;
      }

      const room = channelRoom(channelId);
      socket.join(room);
      console.log(`[channels] User ${userId} joined channel room ${room}`);

      // Send active huddle state if one exists in this channel
      const huddlePayload = getActiveHuddlePayload(channelId);
      if (huddlePayload) {
        socket.emit('huddle:started', huddlePayload);
      }

      // Update lastReadAt to mark the channel as read when the user views it
      try {
        await prisma.channelMember.update({
          where: {
            channelId_userId: { channelId, userId },
          },
          data: { lastReadAt: new Date() },
        });
      } catch (e) {
        console.error(`[channels] Failed to update lastReadAt for user ${userId} in channel ${channelId}:`, e);
      }
    } catch (err) {
      console.error(`[channels] channel:join error for user ${userId}:`, err);
    }
  });

  /**
   * channel:leave — Unsubscribe from a channel's real-time events.
   */
  socket.on('channel:leave', ({ channelId }) => {
    if (!channelId) {
      return;
    }

    const room = channelRoom(channelId);
    socket.leave(room);
    console.log(`[channels] User ${userId} left channel room ${room}`);
  });
}
