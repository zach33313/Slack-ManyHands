/**
 * Tests for server/socket-handlers/presence.ts
 *
 * Verifies presence tracking:
 * - presence:heartbeat marks user online, emits online on first heartbeat
 * - disconnect emits offline status
 * - heartbeat timeout (90s simulated) emits offline
 * - workspace:join joins socket to workspace room
 */

// Mock @prisma/client
const mockPrismaUser = {
  update: jest.fn(),
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
  PRESENCE_TIMEOUT: 90_000,
  PRESENCE_HEARTBEAT_INTERVAL: 30_000,
}));

jest.mock('../../shared/types', () => ({
  PresenceStatus: {
    ONLINE: 'online',
    AWAY: 'away',
    OFFLINE: 'offline',
  },
}));

import { registerPresenceHandlers, isUserOnline } from '../../server/socket-handlers/presence';

describe('Presence Handlers', () => {
  let socket: any;
  let handlers: Record<string, (...args: any[]) => void>;
  let mockToEmit: jest.Mock;
  let mockTo: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockToEmit = jest.fn();
    mockTo = jest.fn().mockReturnValue({ emit: mockToEmit });

    handlers = {};
    socket = {
      data: { userId: 'user-1', email: 'user1@test.com' },
      on: jest.fn((event: string, handler: any) => {
        handlers[event] = handler;
      }),
      join: jest.fn(),
      to: mockTo,
      rooms: new Set(['socket-id-1']),
    };

    mockPrismaUser.update.mockResolvedValue({});
  });

  afterEach(() => {
    jest.useRealTimers();
    // Clean up presence timers between tests by disconnecting
    if (handlers['disconnect']) {
      handlers['disconnect']();
    }
  });

  function registerAndSetup() {
    registerPresenceHandlers(socket);
  }

  describe('event registration', () => {
    it('registers all presence event handlers', () => {
      registerAndSetup();

      expect(socket.on).toHaveBeenCalledWith('workspace:join', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('presence:heartbeat', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });
  });

  describe('workspace:join', () => {
    it('joins socket to workspace room', () => {
      registerAndSetup();

      handlers['workspace:join']({ workspaceId: 'ws-1' });

      expect(socket.join).toHaveBeenCalledWith('workspace:ws-1');
      expect(socket.data.workspaceId).toBe('ws-1');
    });

    it('does nothing when workspaceId is missing', () => {
      registerAndSetup();

      handlers['workspace:join']({ workspaceId: '' });

      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  describe('presence:heartbeat', () => {
    it('emits online status on first heartbeat', () => {
      socket.rooms = new Set(['socket-id-1', 'workspace:ws-1']);
      registerAndSetup();

      handlers['presence:heartbeat']();

      expect(mockTo).toHaveBeenCalledWith('workspace:ws-1');
      expect(mockToEmit).toHaveBeenCalledWith('presence:update', {
        userId: 'user-1',
        status: 'online',
      });
    });

    it('does not emit online on subsequent heartbeats', () => {
      socket.rooms = new Set(['socket-id-1', 'workspace:ws-1']);
      registerAndSetup();

      handlers['presence:heartbeat']();
      mockTo.mockClear();
      mockToEmit.mockClear();

      handlers['presence:heartbeat']();

      // Should not emit presence:update for subsequent heartbeats
      expect(mockToEmit).not.toHaveBeenCalledWith('presence:update', expect.objectContaining({
        status: 'online',
      }));
    });

    it('marks user as online via isUserOnline', () => {
      registerAndSetup();

      // Before heartbeat
      // Note: isUserOnline may or may not be accurate depending on cleanup
      handlers['presence:heartbeat']();

      expect(isUserOnline('user-1')).toBe(true);
    });
  });

  describe('heartbeat timeout', () => {
    it('emits offline status when timeout expires (90s)', () => {
      socket.rooms = new Set(['socket-id-1', 'workspace:ws-1']);
      registerAndSetup();

      handlers['presence:heartbeat']();
      mockTo.mockClear();
      mockToEmit.mockClear();

      // Advance past the 90s timeout
      jest.advanceTimersByTime(90_000);

      expect(mockTo).toHaveBeenCalledWith('workspace:ws-1');
      expect(mockToEmit).toHaveBeenCalledWith('presence:update', {
        userId: 'user-1',
        status: 'offline',
      });
    });

    it('resets timeout on subsequent heartbeats', () => {
      socket.rooms = new Set(['socket-id-1', 'workspace:ws-1']);
      registerAndSetup();

      handlers['presence:heartbeat']();

      // Advance 60s (below timeout)
      jest.advanceTimersByTime(60_000);

      // Send another heartbeat — resets the timer
      mockTo.mockClear();
      mockToEmit.mockClear();
      handlers['presence:heartbeat']();

      // Advance another 60s — still below new timeout
      jest.advanceTimersByTime(60_000);

      // Should NOT have emitted offline yet
      expect(mockToEmit).not.toHaveBeenCalledWith('presence:update', expect.objectContaining({
        status: 'offline',
      }));

      // Advance the remaining 30s to trigger timeout
      jest.advanceTimersByTime(30_000);

      expect(mockToEmit).toHaveBeenCalledWith('presence:update', {
        userId: 'user-1',
        status: 'offline',
      });
    });

    it('updates lastSeenAt in database when going offline via timeout', () => {
      socket.rooms = new Set(['socket-id-1', 'workspace:ws-1']);
      registerAndSetup();

      handlers['presence:heartbeat']();
      jest.advanceTimersByTime(90_000);

      expect(mockPrismaUser.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { updatedAt: expect.any(Date) },
      });
    });
  });

  describe('disconnect', () => {
    it('emits offline status immediately', () => {
      socket.rooms = new Set(['socket-id-1', 'workspace:ws-1']);
      registerAndSetup();

      handlers['presence:heartbeat']();
      mockTo.mockClear();
      mockToEmit.mockClear();

      handlers['disconnect']();

      expect(mockTo).toHaveBeenCalledWith('workspace:ws-1');
      expect(mockToEmit).toHaveBeenCalledWith('presence:update', {
        userId: 'user-1',
        status: 'offline',
      });
    });

    it('clears the heartbeat timer', () => {
      registerAndSetup();

      handlers['presence:heartbeat']();
      expect(isUserOnline('user-1')).toBe(true);

      handlers['disconnect']();

      // After disconnect, user should no longer be tracked
      expect(isUserOnline('user-1')).toBe(false);
    });

    it('handles disconnect without prior heartbeat', () => {
      registerAndSetup();

      // Should not throw even if no heartbeat was sent
      expect(() => handlers['disconnect']()).not.toThrow();
    });
  });
});
