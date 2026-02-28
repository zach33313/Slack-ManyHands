/**
 * server/socket-handlers/read-receipts.ts
 *
 * Read receipt event handlers for Socket.IO.
 *
 * Handles:
 * - channel:mark-read — Update ChannelMember.lastReadAt for the current user
 *                       and emit channel:user-read to the channel room.
 *
 * This allows clients to track which messages each user has seen, enabling
 * unread count badges and "seen by" indicators.
 */

import type { Socket } from 'socket.io';
import { prisma } from '../../shared/lib/prisma';
import { channelRoom } from '../../shared/lib/constants';
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

/**
 * Registers read receipt event handlers on a connected socket.
 */
export function registerReadReceiptHandlers(socket: AppSocket): void {
  const userId = socket.data.userId;

  /**
   * channel:mark-read — Mark a channel as read up to a specific message.
   *
   * Updates the ChannelMember.lastReadAt timestamp to now() for the current
   * user in the specified channel. Emits channel:user-read to all sockets in
   * the channel room so other clients can update their "seen by" indicators.
   */
  socket.on('channel:mark-read', async ({ channelId, messageId }) => {
    try {
      if (!channelId || !messageId) {
        console.warn(`[read-receipts] channel:mark-read — missing channelId or messageId from user ${userId}`);
        return;
      }

      const readAt = new Date();

      // Update the lastReadAt for this user's channel membership
      const updated = await prisma.channelMember.updateMany({
        where: {
          channelId,
          userId,
        },
        data: {
          lastReadAt: readAt,
        },
      });

      if (updated.count === 0) {
        console.warn(
          `[read-receipts] channel:mark-read — user ${userId} is not a member of channel ${channelId}`
        );
        return;
      }

      // Broadcast the read receipt to all sockets in the channel room
      socket.nsp
        .to(channelRoom(channelId))
        .emit('channel:user-read', {
          channelId,
          messageId,
          userId,
          readAt,
        });
    } catch (err) {
      console.error(`[read-receipts] channel:mark-read error for user ${userId}:`, err);
    }
  });
}
