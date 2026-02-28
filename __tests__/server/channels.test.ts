/**
 * Tests for server/socket-handlers/channels.ts
 *
 * Verifies channel room management:
 * - channel:join adds socket to room (verified member)
 * - channel:join rejects non-members
 * - channel:leave removes socket from room
 */

// Mock @prisma/client
const mockPrismaChannelMember = {
  findUnique: jest.fn(),
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

import { registerChannelHandlers } from '../../server/socket-handlers/channels';

describe('Channel Handlers', () => {
  let socket: any;
  let handlers: Record<string, (...args: any[]) => void>;

  beforeEach(() => {
    jest.clearAllMocks();

    handlers = {};
    socket = {
      data: { userId: 'user-1', email: 'user1@test.com' },
      on: jest.fn((event: string, handler: any) => {
        handlers[event] = handler;
      }),
      join: jest.fn(),
      leave: jest.fn(),
    };

    registerChannelHandlers(socket);
  });

  describe('event registration', () => {
    it('registers channel:join and channel:leave handlers', () => {
      expect(socket.on).toHaveBeenCalledWith('channel:join', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('channel:leave', expect.any(Function));
    });
  });

  describe('channel:join', () => {
    it('joins socket to channel room when user is a member', async () => {
      mockPrismaChannelMember.findUnique.mockResolvedValue({
        channelId: 'ch-1',
        userId: 'user-1',
      });

      await handlers['channel:join']({ channelId: 'ch-1' });

      expect(mockPrismaChannelMember.findUnique).toHaveBeenCalledWith({
        where: {
          channelId_userId: {
            channelId: 'ch-1',
            userId: 'user-1',
          },
        },
      });

      expect(socket.join).toHaveBeenCalledWith('channel:ch-1');
    });

    it('rejects join when user is not a member', async () => {
      mockPrismaChannelMember.findUnique.mockResolvedValue(null);

      await handlers['channel:join']({ channelId: 'ch-1' });

      expect(socket.join).not.toHaveBeenCalled();
    });

    it('does nothing when channelId is empty', async () => {
      await handlers['channel:join']({ channelId: '' });

      expect(mockPrismaChannelMember.findUnique).not.toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('handles database errors gracefully', async () => {
      mockPrismaChannelMember.findUnique.mockRejectedValue(new Error('DB error'));

      // Should not throw
      await expect(handlers['channel:join']({ channelId: 'ch-1' })).resolves.toBeUndefined();
      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  describe('channel:leave', () => {
    it('removes socket from channel room', () => {
      handlers['channel:leave']({ channelId: 'ch-1' });

      expect(socket.leave).toHaveBeenCalledWith('channel:ch-1');
    });

    it('does nothing when channelId is empty', () => {
      handlers['channel:leave']({ channelId: '' });

      expect(socket.leave).not.toHaveBeenCalled();
    });
  });
});
