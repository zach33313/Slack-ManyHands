/**
 * Tests for server/socket-emitter.ts
 *
 * Verifies the helper functions for emitting Socket.IO events:
 * - getIO() returns the global Socket.IO instance or throws
 * - emitToChannel() sends events to the correct channel room
 * - emitToUser() sends events to the correct user room
 * - emitToWorkspace() sends events to the correct workspace room
 */

import { getIO, emitToChannel, emitToUser, emitToWorkspace } from '../../server/socket-emitter';

// Mock the constants module
jest.mock('../../shared/lib/constants', () => ({
  channelRoom: (id: string) => `channel:${id}`,
  userRoom: (id: string) => `user:${id}`,
  workspaceRoom: (id: string) => `workspace:${id}`,
}));

describe('socket-emitter', () => {
  let mockEmit: jest.Mock;
  let mockTo: jest.Mock;
  let mockIo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEmit = jest.fn();
    mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
    mockIo = { to: mockTo };

    // Set global __socketio
    (globalThis as any).__socketio = mockIo;
  });

  afterEach(() => {
    delete (globalThis as any).__socketio;
  });

  describe('getIO', () => {
    it('returns the global Socket.IO instance', () => {
      const io = getIO();
      expect(io).toBe(mockIo);
    });

    it('throws when Socket.IO instance is not initialized', () => {
      delete (globalThis as any).__socketio;

      expect(() => getIO()).toThrow(
        'Socket.IO server not initialized. Ensure server.ts has started.'
      );
    });
  });

  describe('emitToChannel', () => {
    it('emits event to the correct channel room', () => {
      const messageData = { id: 'msg-1', channelId: 'ch-1' } as any;
      emitToChannel('ch-1', 'message:new', messageData);

      expect(mockTo).toHaveBeenCalledWith('channel:ch-1');
      expect(mockEmit).toHaveBeenCalledWith('message:new', messageData);
    });

    it('does not throw when Socket.IO is not initialized (logs error)', () => {
      delete (globalThis as any).__socketio;

      // Should not throw, just log error
      expect(() => {
        emitToChannel('ch-1', 'message:new', {} as any);
      }).not.toThrow();
    });

    it('handles different event types', () => {
      emitToChannel('ch-2', 'message:deleted', { messageId: 'msg-2', channelId: 'ch-2' });

      expect(mockTo).toHaveBeenCalledWith('channel:ch-2');
      expect(mockEmit).toHaveBeenCalledWith('message:deleted', {
        messageId: 'msg-2',
        channelId: 'ch-2',
      });
    });
  });

  describe('emitToUser', () => {
    it('emits event to the correct user room', () => {
      const notification = { id: 'notif-1' } as any;
      emitToUser('user-1', 'notification:new', notification);

      expect(mockTo).toHaveBeenCalledWith('user:user-1');
      expect(mockEmit).toHaveBeenCalledWith('notification:new', notification);
    });

    it('does not throw when Socket.IO is not initialized', () => {
      delete (globalThis as any).__socketio;

      expect(() => {
        emitToUser('user-1', 'notification:new', {} as any);
      }).not.toThrow();
    });
  });

  describe('emitToWorkspace', () => {
    it('emits event to the correct workspace room', () => {
      const presenceData = { userId: 'u1', status: 'online' as any };
      emitToWorkspace('ws-1', 'presence:update', presenceData);

      expect(mockTo).toHaveBeenCalledWith('workspace:ws-1');
      expect(mockEmit).toHaveBeenCalledWith('presence:update', presenceData);
    });

    it('does not throw when Socket.IO is not initialized', () => {
      delete (globalThis as any).__socketio;

      expect(() => {
        emitToWorkspace('ws-1', 'presence:update', {} as any);
      }).not.toThrow();
    });
  });
});
