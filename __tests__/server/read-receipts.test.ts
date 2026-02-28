/**
 * Tests for server/socket-handlers/read-receipts.ts
 *
 * Verifies the channel:mark-read event handler:
 * - Updates ChannelMember.lastReadAt for the authenticated user
 * - Emits channel:user-read to the channel room with userId, messageId, and readAt
 * - Rejects when user is not a channel member (updateMany returns count: 0)
 * - Silently ignores missing/empty fields
 */

// ---------------------------------------------------------------------------
// Prisma mocks
// ---------------------------------------------------------------------------

const mockPrismaChannelMember = {
  updateMany: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    channelMember: mockPrismaChannelMember,
  })),
}));

jest.mock('../../shared/lib/constants', () => ({
  channelRoom: (id: string) => `channel:${id}`,
  userRoom: (id: string) => `user:${id}`,
  workspaceRoom: (id: string) => `workspace:${id}`,
}));

import { registerReadReceiptHandlers } from '../../server/socket-handlers/read-receipts';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Read Receipt Handlers', () => {
  let socket: any;
  let handlers: Record<string, (...args: any[]) => Promise<void>>;
  let mockNspEmit: jest.Mock;
  let mockNspTo: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockNspEmit = jest.fn();
    mockNspTo = jest.fn().mockReturnValue({ emit: mockNspEmit });

    handlers = {};
    socket = {
      data: { userId: 'user-1', email: 'user1@test.com' },
      on: jest.fn((event: string, handler: any) => {
        handlers[event] = handler;
      }),
      nsp: { to: mockNspTo },
    };

    registerReadReceiptHandlers(socket);
  });

  // -------------------------------------------------------------------------
  // Event registration
  // -------------------------------------------------------------------------

  describe('event registration', () => {
    it('registers channel:mark-read handler', () => {
      expect(socket.on).toHaveBeenCalledWith('channel:mark-read', expect.any(Function));
    });
  });

  // -------------------------------------------------------------------------
  // channel:mark-read
  // -------------------------------------------------------------------------

  describe('channel:mark-read', () => {
    it('updates ChannelMember.lastReadAt and emits channel:user-read', async () => {
      mockPrismaChannelMember.updateMany.mockResolvedValue({ count: 1 });

      const before = new Date();
      await handlers['channel:mark-read']({
        channelId: 'ch-1',
        messageId: 'msg-123',
      });
      const after = new Date();

      // Should update the channel member's lastReadAt
      expect(mockPrismaChannelMember.updateMany).toHaveBeenCalledWith({
        where: { channelId: 'ch-1', userId: 'user-1' },
        data: { lastReadAt: expect.any(Date) },
      });

      // Verify the readAt timestamp is approximately now
      const readAt = mockPrismaChannelMember.updateMany.mock.calls[0][0].data.lastReadAt as Date;
      expect(readAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(readAt.getTime()).toBeLessThanOrEqual(after.getTime());

      // Should emit to the channel room
      expect(mockNspTo).toHaveBeenCalledWith('channel:ch-1');
      expect(mockNspEmit).toHaveBeenCalledWith('channel:user-read', {
        channelId: 'ch-1',
        messageId: 'msg-123',
        userId: 'user-1',
        readAt: expect.any(Date),
      });
    });

    it('emits to the correct channel room', async () => {
      mockPrismaChannelMember.updateMany.mockResolvedValue({ count: 1 });

      await handlers['channel:mark-read']({ channelId: 'ch-xyz', messageId: 'msg-1' });

      expect(mockNspTo).toHaveBeenCalledWith('channel:ch-xyz');
    });

    it('includes the authenticated userId in the emitted event', async () => {
      mockPrismaChannelMember.updateMany.mockResolvedValue({ count: 1 });

      await handlers['channel:mark-read']({ channelId: 'ch-1', messageId: 'msg-1' });

      expect(mockNspEmit).toHaveBeenCalledWith(
        'channel:user-read',
        expect.objectContaining({ userId: 'user-1' })
      );
    });

    it('includes the messageId in the emitted event', async () => {
      mockPrismaChannelMember.updateMany.mockResolvedValue({ count: 1 });

      await handlers['channel:mark-read']({ channelId: 'ch-1', messageId: 'msg-42' });

      expect(mockNspEmit).toHaveBeenCalledWith(
        'channel:user-read',
        expect.objectContaining({ messageId: 'msg-42' })
      );
    });

    it('does NOT emit when user is not a channel member (updateMany count=0)', async () => {
      mockPrismaChannelMember.updateMany.mockResolvedValue({ count: 0 });

      await handlers['channel:mark-read']({ channelId: 'ch-1', messageId: 'msg-1' });

      // updateMany was called but returned 0 updated rows
      expect(mockPrismaChannelMember.updateMany).toHaveBeenCalled();
      // No event should be emitted for non-members
      expect(mockNspEmit).not.toHaveBeenCalled();
    });

    it('does nothing when channelId is missing', async () => {
      await handlers['channel:mark-read']({ channelId: '', messageId: 'msg-1' });

      expect(mockPrismaChannelMember.updateMany).not.toHaveBeenCalled();
      expect(mockNspEmit).not.toHaveBeenCalled();
    });

    it('does nothing when messageId is missing', async () => {
      await handlers['channel:mark-read']({ channelId: 'ch-1', messageId: '' });

      expect(mockPrismaChannelMember.updateMany).not.toHaveBeenCalled();
      expect(mockNspEmit).not.toHaveBeenCalled();
    });

    it('handles database errors gracefully without throwing', async () => {
      mockPrismaChannelMember.updateMany.mockRejectedValue(new Error('DB failure'));

      await expect(
        handlers['channel:mark-read']({ channelId: 'ch-1', messageId: 'msg-1' })
      ).resolves.toBeUndefined();

      expect(mockNspEmit).not.toHaveBeenCalled();
    });

    it('uses different userId for different authenticated sockets', async () => {
      // Register a second handler for a different user
      const socket2 = {
        data: { userId: 'user-2', email: 'user2@test.com' },
        on: jest.fn((event: string, handler: any) => {
          handlers2[event] = handler;
        }),
        nsp: { to: mockNspTo },
      } as unknown as Parameters<typeof registerReadReceiptHandlers>[0];
      const handlers2: Record<string, any> = {};
      registerReadReceiptHandlers(socket2);

      mockPrismaChannelMember.updateMany.mockResolvedValue({ count: 1 });

      await handlers2['channel:mark-read']({ channelId: 'ch-1', messageId: 'msg-1' });

      // Should use user-2's ID in the where clause
      expect(mockPrismaChannelMember.updateMany).toHaveBeenCalledWith({
        where: { channelId: 'ch-1', userId: 'user-2' },
        data: { lastReadAt: expect.any(Date) },
      });

      // Should include user-2's ID in the emitted event
      expect(mockNspEmit).toHaveBeenCalledWith(
        'channel:user-read',
        expect.objectContaining({ userId: 'user-2' })
      );
    });
  });
});
