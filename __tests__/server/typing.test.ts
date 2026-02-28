/**
 * Tests for server/socket-handlers/typing.ts
 *
 * Verifies typing indicator handlers:
 * - typing:start adds user to typing set and emits to room
 * - typing:stop removes user from typing set
 * - auto-expire after 3s
 * - disconnect cleans up typing state
 */

// Mock @prisma/client
const mockPrismaUser = {
  findUnique: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    user: mockPrismaUser,
  })),
}));

jest.mock('../../shared/lib/constants', () => ({
  channelRoom: (id: string) => `channel:${id}`,
  userRoom: (id: string) => `user:${id}`,
  workspaceRoom: (id: string) => `workspace:${id}`,
  TYPING_TIMEOUT: 3_000,
}));

import { registerTypingHandlers } from '../../server/socket-handlers/typing';

describe('Typing Handlers', () => {
  let socket: any;
  let io: any;
  let handlers: Record<string, (...args: any[]) => void>;
  let socketToEmit: jest.Mock;
  let socketTo: jest.Mock;
  let ioEmit: jest.Mock;
  let ioTo: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    socketToEmit = jest.fn();
    socketTo = jest.fn().mockReturnValue({ emit: socketToEmit });
    ioEmit = jest.fn();
    ioTo = jest.fn().mockReturnValue({ emit: ioEmit });

    handlers = {};
    socket = {
      data: { userId: 'user-1', email: 'user1@test.com' },
      on: jest.fn((event: string, handler: any) => {
        handlers[event] = handler;
      }),
      to: socketTo,
    };

    io = {
      to: ioTo,
    };

    mockPrismaUser.findUnique.mockResolvedValue({ name: 'Test User' });
  });

  afterEach(() => {
    jest.useRealTimers();
    // Clean up typing state
    if (handlers['disconnect']) {
      handlers['disconnect']();
    }
  });

  function registerAndSetup() {
    registerTypingHandlers(socket, io);
  }

  describe('event registration', () => {
    it('registers all typing event handlers', () => {
      registerAndSetup();

      expect(socket.on).toHaveBeenCalledWith('typing:start', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('typing:stop', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });
  });

  describe('typing:start', () => {
    it('adds user to typing set and emits to channel room', async () => {
      registerAndSetup();

      await handlers['typing:start']({ channelId: 'ch-1' });

      // Should broadcast to other users in channel room (via socket.to, excluding sender)
      expect(socketTo).toHaveBeenCalledWith('channel:ch-1');
      expect(socketToEmit).toHaveBeenCalledWith('typing:users', {
        channelId: 'ch-1',
        users: [], // Excludes the typer themselves
      });
    });

    it('fetches user name from database', async () => {
      registerAndSetup();

      await handlers['typing:start']({ channelId: 'ch-1' });

      expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { name: true },
      });
    });

    it('does nothing when channelId is empty', async () => {
      registerAndSetup();

      await handlers['typing:start']({ channelId: '' });

      expect(socketTo).not.toHaveBeenCalled();
    });

    it('uses "Someone" when user name is not found', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);
      registerAndSetup();

      await handlers['typing:start']({ channelId: 'ch-1' });

      // Should still work without throwing
      expect(socketTo).toHaveBeenCalledWith('channel:ch-1');
    });

    it('uses cached name on subsequent typing:start calls', async () => {
      registerAndSetup();

      await handlers['typing:start']({ channelId: 'ch-1' });
      mockPrismaUser.findUnique.mockClear();

      await handlers['typing:start']({ channelId: 'ch-1' });

      // Should NOT call DB again for the same channel (name was cached)
      expect(mockPrismaUser.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('typing:stop', () => {
    it('removes user from typing set and broadcasts update', async () => {
      registerAndSetup();

      // First start typing
      await handlers['typing:start']({ channelId: 'ch-1' });
      socketTo.mockClear();
      socketToEmit.mockClear();

      // Then stop
      handlers['typing:stop']({ channelId: 'ch-1' });

      expect(socketTo).toHaveBeenCalledWith('channel:ch-1');
      expect(socketToEmit).toHaveBeenCalledWith('typing:users', {
        channelId: 'ch-1',
        users: [],
      });
    });

    it('does nothing when channelId is empty', () => {
      registerAndSetup();

      handlers['typing:stop']({ channelId: '' });

      expect(socketTo).not.toHaveBeenCalled();
    });

    it('does nothing when user was not typing', () => {
      registerAndSetup();

      // Stop without starting - should not throw
      expect(() => handlers['typing:stop']({ channelId: 'ch-1' })).not.toThrow();
    });
  });

  describe('auto-expire after 3s', () => {
    it('removes user from typing set after TYPING_TIMEOUT (3s)', async () => {
      registerAndSetup();

      await handlers['typing:start']({ channelId: 'ch-1' });

      // Clear mocks so we only capture the auto-expire emission
      ioTo.mockClear();
      ioEmit.mockClear();

      // Advance past the 3s timeout
      jest.advanceTimersByTime(3_000);

      // The auto-expire uses io.to (not socket.to) to broadcast
      expect(ioTo).toHaveBeenCalledWith('channel:ch-1');
      expect(ioEmit).toHaveBeenCalledWith('typing:users', {
        channelId: 'ch-1',
        users: [],
      });
    });

    it('resets timeout when typing:start is called again', async () => {
      registerAndSetup();

      await handlers['typing:start']({ channelId: 'ch-1' });

      // Advance 2s
      jest.advanceTimersByTime(2_000);

      // Start typing again — resets timeout
      await handlers['typing:start']({ channelId: 'ch-1' });

      ioTo.mockClear();
      ioEmit.mockClear();

      // After another 2s (total 4s from first start, but only 2s from restart)
      jest.advanceTimersByTime(2_000);

      // Should NOT have auto-expired yet
      expect(ioEmit).not.toHaveBeenCalled();

      // After 1 more second (3s from restart)
      jest.advanceTimersByTime(1_000);

      // Now it should have expired
      expect(ioTo).toHaveBeenCalledWith('channel:ch-1');
      expect(ioEmit).toHaveBeenCalledWith('typing:users', {
        channelId: 'ch-1',
        users: [],
      });
    });
  });

  describe('disconnect cleanup', () => {
    it('removes user from all typing channels on disconnect', async () => {
      registerAndSetup();

      // Start typing in two channels
      await handlers['typing:start']({ channelId: 'ch-1' });
      await handlers['typing:start']({ channelId: 'ch-2' });

      ioTo.mockClear();
      ioEmit.mockClear();

      handlers['disconnect']();

      // Should broadcast cleanup for both channels
      expect(ioTo).toHaveBeenCalledWith('channel:ch-1');
      expect(ioTo).toHaveBeenCalledWith('channel:ch-2');
    });

    it('handles disconnect when user was not typing', () => {
      registerAndSetup();

      // Should not throw
      expect(() => handlers['disconnect']()).not.toThrow();
    });
  });

  describe('multiple users typing', () => {
    it('shows other typing users when multiple users are typing', async () => {
      // Set up two sockets for two different users
      const handlers2: Record<string, (...args: any[]) => void> = {};
      const socket2ToEmit = jest.fn();
      const socket2To = jest.fn().mockReturnValue({ emit: socket2ToEmit });
      const socket2: any = {
        data: { userId: 'user-2', email: 'user2@test.com' },
        on: jest.fn((event: string, handler: any) => {
          handlers2[event] = handler;
        }),
        to: socket2To,
      };

      registerAndSetup();
      registerTypingHandlers(socket2, io);

      // User 1 starts typing
      await handlers['typing:start']({ channelId: 'ch-1' });

      // User 2 starts typing - should see user 1 in the list
      mockPrismaUser.findUnique.mockResolvedValue({ name: 'User Two' });
      await handlers2['typing:start']({ channelId: 'ch-1' });

      // The broadcast from user-2 should show user-1 (excludes the sender)
      expect(socket2To).toHaveBeenCalledWith('channel:ch-1');
      expect(socket2ToEmit).toHaveBeenCalledWith('typing:users', {
        channelId: 'ch-1',
        users: [{ userId: 'user-1', name: 'Test User' }],
      });

      // Clean up user-2
      handlers2['disconnect']();
    });
  });
});
