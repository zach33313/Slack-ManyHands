/**
 * Tests for server/socket-handlers/canvas.ts
 *
 * Verifies canvas collaboration event handlers:
 * - canvas:join      — joins room, emits canvas:initial-state with stored content
 * - canvas:leave     — leaves canvas room
 * - canvas:update    — broadcasts to other editors, schedules debounced DB save
 * - canvas:awareness — broadcasts cursor state to other editors (not sender)
 *
 * Uses mocked Prisma client and Jest fake timers for debounce testing.
 */

// ---------------------------------------------------------------------------
// Prisma mocks — declared BEFORE jest.mock() calls
// ---------------------------------------------------------------------------

const mockPrismaCanvas = {
  findUnique: jest.fn(),
  update: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    canvas: mockPrismaCanvas,
  })),
}));

jest.mock('../../shared/lib/constants', () => ({
  channelRoom: (id: string) => `channel:${id}`,
  userRoom: (id: string) => `user:${id}`,
  workspaceRoom: (id: string) => `workspace:${id}`,
}));

import { registerCanvasHandlers } from '../../server/socket-handlers/canvas';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Canvas Handlers', () => {
  let socket: any;
  let socket2: any; // second editor for broadcast tests
  let handlers: Record<string, (...args: any[]) => Promise<void>>;
  let handlers2: Record<string, (...args: any[]) => Promise<void>>;
  let mockEmit: jest.Mock;      // socket.emit (to sender only)
  let mockSocketTo: jest.Mock;  // socket.to (broadcast to room, excluding sender)
  let mockBroadcastEmit: jest.Mock; // what socket.to(room).emit() calls

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    mockEmit = jest.fn();
    mockBroadcastEmit = jest.fn();
    mockSocketTo = jest.fn().mockReturnValue({ emit: mockBroadcastEmit });

    handlers = {};
    socket = {
      data: { userId: 'user-1', email: 'user1@test.com' },
      id: 'socket-id-1',
      on: jest.fn((event: string, handler: any) => {
        handlers[event] = handler;
      }),
      emit: mockEmit,
      to: mockSocketTo,
      join: jest.fn(),
      leave: jest.fn(),
    };

    registerCanvasHandlers(socket);

    // Second socket (different user, same canvas) for broadcast tests
    handlers2 = {};
    socket2 = {
      data: { userId: 'user-2', email: 'user2@test.com' },
      id: 'socket-id-2',
      on: jest.fn((event: string, handler: any) => {
        handlers2[event] = handler;
      }),
      emit: jest.fn(),
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      join: jest.fn(),
      leave: jest.fn(),
    };
    registerCanvasHandlers(socket2);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Event registration
  // -------------------------------------------------------------------------

  describe('event registration', () => {
    it('registers canvas:join, canvas:leave, canvas:update, and canvas:awareness', () => {
      expect(socket.on).toHaveBeenCalledWith('canvas:join', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('canvas:leave', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('canvas:update', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('canvas:awareness', expect.any(Function));
    });
  });

  // -------------------------------------------------------------------------
  // canvas:join
  // -------------------------------------------------------------------------

  describe('canvas:join', () => {
    it('joins the canvas room and emits initial-state with parsed JSON content', async () => {
      const storedContent = { type: 'doc', content: [{ type: 'text', text: 'Hello' }] };
      mockPrismaCanvas.findUnique.mockResolvedValue({
        id: 'canvas-1',
        contentJson: JSON.stringify(storedContent),
        isActive: true,
      });

      await handlers['canvas:join']({ canvasId: 'canvas-1' });

      expect(socket.join).toHaveBeenCalledWith('canvas:canvas-1');
      expect(mockEmit).toHaveBeenCalledWith('canvas:initial-state', {
        canvasId: 'canvas-1',
        state: storedContent,
      });
    });

    it('emits initial-state with raw string when contentJson is not valid JSON', async () => {
      const rawBase64 = 'SGVsbG8gV29ybGQ='; // base64 string
      mockPrismaCanvas.findUnique.mockResolvedValue({
        id: 'canvas-1',
        contentJson: rawBase64,
        isActive: true,
      });

      await handlers['canvas:join']({ canvasId: 'canvas-1' });

      expect(socket.join).toHaveBeenCalledWith('canvas:canvas-1');
      expect(mockEmit).toHaveBeenCalledWith('canvas:initial-state', {
        canvasId: 'canvas-1',
        state: rawBase64, // raw string forwarded as-is
      });
    });

    it('emits initial-state with empty JSON string content', async () => {
      mockPrismaCanvas.findUnique.mockResolvedValue({
        id: 'canvas-empty',
        contentJson: '{}',
        isActive: true,
      });

      await handlers['canvas:join']({ canvasId: 'canvas-empty' });

      expect(mockEmit).toHaveBeenCalledWith('canvas:initial-state', {
        canvasId: 'canvas-empty',
        state: {},
      });
    });

    it('does nothing when canvasId is missing', async () => {
      await handlers['canvas:join']({ canvasId: '' });

      expect(mockPrismaCanvas.findUnique).not.toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('does nothing when canvas is not found in DB', async () => {
      mockPrismaCanvas.findUnique.mockResolvedValue(null);

      await handlers['canvas:join']({ canvasId: 'nonexistent' });

      expect(socket.join).not.toHaveBeenCalled();
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('queries the canvas by canvasId (not channelId)', async () => {
      mockPrismaCanvas.findUnique.mockResolvedValue({
        id: 'canvas-1',
        contentJson: '{}',
        isActive: true,
      });

      await handlers['canvas:join']({ canvasId: 'canvas-1' });

      expect(mockPrismaCanvas.findUnique).toHaveBeenCalledWith({
        where: { id: 'canvas-1' },
        select: { id: true, contentJson: true, isActive: true },
      });
    });

    it('handles database errors gracefully', async () => {
      mockPrismaCanvas.findUnique.mockRejectedValue(new Error('DB error'));

      await expect(
        handlers['canvas:join']({ canvasId: 'canvas-1' })
      ).resolves.toBeUndefined();

      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // canvas:leave
  // -------------------------------------------------------------------------

  describe('canvas:leave', () => {
    it('leaves the canvas room', async () => {
      await handlers['canvas:leave']({ canvasId: 'canvas-1' });

      expect(socket.leave).toHaveBeenCalledWith('canvas:canvas-1');
    });

    it('does nothing when canvasId is missing', async () => {
      await handlers['canvas:leave']({ canvasId: '' });

      expect(socket.leave).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // canvas:update
  // -------------------------------------------------------------------------

  describe('canvas:update', () => {
    it('broadcasts Yjs update to other editors in the canvas room (not sender)', () => {
      const update = 'base64-yjs-update-data';
      handlers['canvas:update']({ canvasId: 'canvas-1', update });

      // Should broadcast to other sockets in the canvas room
      expect(mockSocketTo).toHaveBeenCalledWith('canvas:canvas-1');
      expect(mockBroadcastEmit).toHaveBeenCalledWith('canvas:update', {
        canvasId: 'canvas-1',
        update,
      });
    });

    it('does NOT emit back to the sender (uses socket.to not socket.nsp.to)', () => {
      const update = 'some-yjs-update';
      handlers['canvas:update']({ canvasId: 'canvas-1', update });

      // socket.emit (to self) should NOT be called for updates
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('does NOT call canvas.update immediately (debounced)', () => {
      const update = 'yjs-update-data';
      handlers['canvas:update']({ canvasId: 'canvas-1', update });

      // DB update should NOT be called immediately
      expect(mockPrismaCanvas.update).not.toHaveBeenCalled();
    });

    it('saves canvas to DB after 5-second debounce', async () => {
      const update = 'yjs-update-data';
      handlers['canvas:update']({ canvasId: 'canvas-1', update });

      // Before timer fires — no DB call
      expect(mockPrismaCanvas.update).not.toHaveBeenCalled();

      // Advance timers past the debounce window
      await jest.advanceTimersByTimeAsync(5001);

      expect(mockPrismaCanvas.update).toHaveBeenCalledWith({
        where: { id: 'canvas-1' },
        data: { contentJson: 'yjs-update-data' },
      });
    });

    it('resets debounce timer when multiple updates arrive', async () => {
      handlers['canvas:update']({ canvasId: 'canvas-1', update: 'update-1' });
      await jest.advanceTimersByTimeAsync(3000); // only 3s — debounce not fired

      handlers['canvas:update']({ canvasId: 'canvas-1', update: 'update-2' });
      await jest.advanceTimersByTimeAsync(3000); // still 3s after last update

      // Still no DB call — debounce was reset
      expect(mockPrismaCanvas.update).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(2001); // now 5s after last update

      // Should save the LATEST update, not the first
      expect(mockPrismaCanvas.update).toHaveBeenCalledTimes(1);
      expect(mockPrismaCanvas.update).toHaveBeenCalledWith({
        where: { id: 'canvas-1' },
        data: { contentJson: 'update-2' },
      });
    });

    it('serializes non-string updates to JSON for storage', async () => {
      const update = { type: 'yjsUpdate', data: [1, 2, 3] };
      handlers['canvas:update']({ canvasId: 'canvas-1', update });

      await jest.advanceTimersByTimeAsync(5001);

      expect(mockPrismaCanvas.update).toHaveBeenCalledWith({
        where: { id: 'canvas-1' },
        data: { contentJson: JSON.stringify(update) },
      });
    });

    it('does nothing when canvasId is missing', () => {
      handlers['canvas:update']({ canvasId: '', update: 'data' });

      expect(mockSocketTo).not.toHaveBeenCalled();
      expect(mockPrismaCanvas.update).not.toHaveBeenCalled();
    });

    it('does nothing when update is undefined', () => {
      handlers['canvas:update']({ canvasId: 'canvas-1', update: undefined });

      expect(mockSocketTo).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // canvas:awareness
  // -------------------------------------------------------------------------

  describe('canvas:awareness', () => {
    it('broadcasts cursor/selection state to other editors in the room', () => {
      const state = { cursor: { line: 5, col: 10 }, selection: null };
      handlers['canvas:awareness']({ canvasId: 'canvas-1', state });

      expect(mockSocketTo).toHaveBeenCalledWith('canvas:canvas-1');
      expect(mockBroadcastEmit).toHaveBeenCalledWith('canvas:awareness', {
        canvasId: 'canvas-1',
        states: { 'user-1': state },
      });
    });

    it('wraps state in a map keyed by userId', () => {
      const state = { cursor: { line: 1, col: 0 } };
      handlers['canvas:awareness']({ canvasId: 'canvas-1', state });

      const emittedPayload = mockBroadcastEmit.mock.calls[0][1];
      expect(emittedPayload.states).toHaveProperty('user-1');
      expect(emittedPayload.states['user-1']).toEqual(state);
    });

    it('does NOT send back to the sender (uses socket.to)', () => {
      const state = { cursor: { line: 0, col: 0 } };
      handlers['canvas:awareness']({ canvasId: 'canvas-1', state });

      // socket.emit (to self) should not be called
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('does nothing when canvasId is missing', () => {
      handlers['canvas:awareness']({ canvasId: '', state: { cursor: null } });

      expect(mockSocketTo).not.toHaveBeenCalled();
    });

    it('does nothing when state is undefined', () => {
      handlers['canvas:awareness']({ canvasId: 'canvas-1', state: undefined });

      expect(mockSocketTo).not.toHaveBeenCalled();
    });

    it('supports any serializable awareness state shape', () => {
      const complexState = {
        user: { name: 'Alice', color: '#ff0000' },
        cursor: { line: 10, col: 5 },
        selection: { anchor: 100, head: 200 },
      };
      handlers['canvas:awareness']({ canvasId: 'canvas-1', state: complexState });

      const emittedPayload = mockBroadcastEmit.mock.calls[0][1];
      expect(emittedPayload.states['user-1']).toEqual(complexState);
    });
  });
});
