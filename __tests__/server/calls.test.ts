/**
 * Tests for server/socket-handlers/calls.ts
 *
 * Verifies 1:1 call signaling handlers:
 * - call:initiate creates call state and notifies callee
 * - call:accept transitions call to connected
 * - call:decline notifies initiator and ends call
 * - call:hangup ends call for all participants
 * - call:signal relays WebRTC signals to target peer
 * - call:toggle-media broadcasts media state changes
 * - Ring timeout auto-ends ringing calls after 30s
 * - Disconnect cleanup ends active calls
 */

// ---------------------------------------------------------------------------
// Prisma mock — must be before any imports
// ---------------------------------------------------------------------------

const mockPrismaUser = {
  findUnique: jest.fn(),
};

const mockPrismaChannelMember = {
  findMany: jest.fn(),
};

const mockPrismaCall = {
  create: jest.fn(),
};

const mockPrismaCallParticipant = {
  createMany: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    user: mockPrismaUser,
    channelMember: mockPrismaChannelMember,
    call: mockPrismaCall,
    callParticipant: mockPrismaCallParticipant,
  })),
}));

jest.mock('../../shared/lib/constants', () => ({
  channelRoom: (id: string) => `channel:${id}`,
  userRoom: (id: string) => `user:${id}`,
  workspaceRoom: (id: string) => `workspace:${id}`,
}));

import { registerCallHandlers } from '../../server/socket-handlers/calls';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface EmittedEvent {
  room: string;
  event: string;
  data: unknown;
}

/** Create a mock io that captures all io.to(room).emit(event, data) calls */
function makeIo() {
  const emittedEvents: EmittedEvent[] = [];
  const to = jest.fn().mockImplementation((room: string) => ({
    emit: jest.fn().mockImplementation((event: string, data: unknown) => {
      emittedEvents.push({ room, event, data });
    }),
  }));
  return { to, emittedEvents };
}

/** Create a mock socket for a given userId */
function makeSocket(userId: string) {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {};
  const socketEmit = jest.fn();
  const socket = {
    data: { userId },
    on: jest.fn().mockImplementation((event: string, handler: (...args: unknown[]) => unknown) => {
      handlers[event] = handler;
    }),
    emit: socketEmit,
  };
  return { socket, handlers, socketEmit };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Call Handlers', () => {
  let callerSocket: ReturnType<typeof makeSocket>;
  let calleeSocket: ReturnType<typeof makeSocket>;
  let io: ReturnType<typeof makeIo>;

  beforeEach(() => {
    jest.clearAllMocks();

    io = makeIo();
    callerSocket = makeSocket('user-caller');
    calleeSocket = makeSocket('user-callee');

    // Default DB mocks
    mockPrismaUser.findUnique.mockResolvedValue({ name: 'Alice' });
    mockPrismaChannelMember.findMany.mockResolvedValue([{ userId: 'user-callee' }]);
    mockPrismaCall.create.mockResolvedValue({ id: 'saved-call-1' });
    mockPrismaCallParticipant.createMany.mockResolvedValue({});
  });

  afterEach(() => {
    // Disconnect both sockets to clean up any in-memory call state
    callerSocket.handlers['disconnect']?.();
    calleeSocket.handlers['disconnect']?.();
  });

  // ─── Event Registration ──────────────────────────────────────────────────

  describe('event registration', () => {
    it('registers all expected event handlers', () => {
      registerCallHandlers(callerSocket.socket as any, io as any);

      expect(callerSocket.socket.on).toHaveBeenCalledWith('call:initiate', expect.any(Function));
      expect(callerSocket.socket.on).toHaveBeenCalledWith('call:accept', expect.any(Function));
      expect(callerSocket.socket.on).toHaveBeenCalledWith('call:decline', expect.any(Function));
      expect(callerSocket.socket.on).toHaveBeenCalledWith('call:hangup', expect.any(Function));
      expect(callerSocket.socket.on).toHaveBeenCalledWith('call:signal', expect.any(Function));
      expect(callerSocket.socket.on).toHaveBeenCalledWith('call:toggle-media', expect.any(Function));
      expect(callerSocket.socket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });
  });

  // ─── call:initiate ──────────────────────────────────────────────────────

  describe('call:initiate', () => {
    beforeEach(() => {
      registerCallHandlers(callerSocket.socket as any, io as any);
      registerCallHandlers(calleeSocket.socket as any, io as any);
    });

    it('queries DB for caller name and channel members', async () => {
      await callerSocket.handlers['call:initiate']({ channelId: 'ch-1', type: '1:1' });

      expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-caller' },
        select: { name: true },
      });
      expect(mockPrismaChannelMember.findMany).toHaveBeenCalledWith({
        where: { channelId: 'ch-1', userId: { not: 'user-caller' } },
        select: { userId: true },
      });
    });

    it('emits call:incoming to callee with correct payload', async () => {
      await callerSocket.handlers['call:initiate']({ channelId: 'ch-1', type: '1:1' });

      const incoming = io.emittedEvents.find(
        (e) => e.event === 'call:incoming' && e.room === 'user:user-callee',
      );
      expect(incoming).toBeDefined();
      expect(incoming!.data).toMatchObject({
        channelId: 'ch-1',
        callerId: 'user-caller',
        callerName: 'Alice',
        type: '1:1',
      });
      expect((incoming!.data as Record<string, unknown>).callId).toBeDefined();
    });

    it('generates a unique callId for each call', async () => {
      // First call
      await callerSocket.handlers['call:initiate']({ channelId: 'ch-1', type: '1:1' });
      const first = io.emittedEvents.find((e) => e.event === 'call:incoming');
      const firstCallId = (first!.data as Record<string, unknown>).callId;

      // Hang up first call so caller can initiate another
      callerSocket.handlers['call:hangup']({ callId: firstCallId });
      io.emittedEvents.length = 0;

      // Second call
      await callerSocket.handlers['call:initiate']({ channelId: 'ch-1', type: '1:1' });
      const second = io.emittedEvents.find((e) => e.event === 'call:incoming');
      const secondCallId = (second!.data as Record<string, unknown>).callId;

      expect(firstCallId).not.toBe(secondCallId);
    });

    it('does not initiate when caller already has an active call', async () => {
      // First call
      await callerSocket.handlers['call:initiate']({ channelId: 'ch-1', type: '1:1' });
      io.emittedEvents.length = 0;

      // Attempt second call — should be ignored
      await callerSocket.handlers['call:initiate']({ channelId: 'ch-2', type: '1:1' });

      expect(io.emittedEvents.filter((e) => e.event === 'call:incoming')).toHaveLength(0);
    });

    it('does nothing when caller not found in DB', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);

      await callerSocket.handlers['call:initiate']({ channelId: 'ch-1', type: '1:1' });

      expect(io.emittedEvents.filter((e) => e.event === 'call:incoming')).toHaveLength(0);
    });

    it('does nothing when no other channel members exist', async () => {
      mockPrismaChannelMember.findMany.mockResolvedValue([]);

      await callerSocket.handlers['call:initiate']({ channelId: 'ch-1', type: '1:1' });

      expect(io.emittedEvents.filter((e) => e.event === 'call:incoming')).toHaveLength(0);
    });

    it('uses "Unknown" as callerName when user name is null', async () => {
      mockPrismaUser.findUnique.mockResolvedValue({ name: null });

      await callerSocket.handlers['call:initiate']({ channelId: 'ch-1', type: '1:1' });

      const incoming = io.emittedEvents.find((e) => e.event === 'call:incoming');
      expect((incoming!.data as Record<string, unknown>).callerName).toBe('Unknown');
    });

    it('notifies multiple callees when channel has multiple members', async () => {
      mockPrismaChannelMember.findMany.mockResolvedValue([
        { userId: 'user-callee-1' },
        { userId: 'user-callee-2' },
      ]);

      await callerSocket.handlers['call:initiate']({ channelId: 'ch-group', type: '1:1' });

      const incomingForCallee1 = io.emittedEvents.find(
        (e) => e.event === 'call:incoming' && e.room === 'user:user-callee-1',
      );
      const incomingForCallee2 = io.emittedEvents.find(
        (e) => e.event === 'call:incoming' && e.room === 'user:user-callee-2',
      );
      expect(incomingForCallee1).toBeDefined();
      expect(incomingForCallee2).toBeDefined();
    });
  });

  // ─── call:accept ────────────────────────────────────────────────────────

  describe('call:accept', () => {
    let callId: string;

    beforeEach(async () => {
      registerCallHandlers(callerSocket.socket as any, io as any);
      registerCallHandlers(calleeSocket.socket as any, io as any);

      await callerSocket.handlers['call:initiate']({ channelId: 'ch-1', type: '1:1' });
      const incomingEvent = io.emittedEvents.find((e) => e.event === 'call:incoming');
      callId = (incomingEvent!.data as Record<string, unknown>).callId as string;
      io.emittedEvents.length = 0;
    });

    it('emits call:accepted to both caller and callee', () => {
      calleeSocket.handlers['call:accept']({ callId });

      const acceptedEvents = io.emittedEvents.filter((e) => e.event === 'call:accepted');
      expect(acceptedEvents.some((e) => e.room === 'user:user-caller')).toBe(true);
      expect(acceptedEvents.some((e) => e.room === 'user:user-callee')).toBe(true);
    });

    it('includes callId and callee userId in call:accepted payload', () => {
      calleeSocket.handlers['call:accept']({ callId });

      const accepted = io.emittedEvents.find((e) => e.event === 'call:accepted');
      expect(accepted!.data).toMatchObject({ callId, userId: 'user-callee' });
    });

    it('clears the ring timeout on accept', () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      calleeSocket.handlers['call:accept']({ callId });

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('does nothing when callId does not exist', () => {
      calleeSocket.handlers['call:accept']({ callId: 'nonexistent-call' });

      expect(io.emittedEvents.filter((e) => e.event === 'call:accepted')).toHaveLength(0);
    });

    it('does nothing when call is not in ringing state', () => {
      // Accept first (connects the call)
      calleeSocket.handlers['call:accept']({ callId });
      io.emittedEvents.length = 0;

      // A third party tries to accept an already-connected call
      const thirdSocket = makeSocket('user-third');
      registerCallHandlers(thirdSocket.socket as any, io as any);
      thirdSocket.handlers['call:accept']({ callId });

      expect(io.emittedEvents.filter((e) => e.event === 'call:accepted')).toHaveLength(0);
      thirdSocket.handlers['disconnect']?.();
    });

    it('does not allow a user already in another call to accept', async () => {
      // Make calleeSocket also initiate their own call
      const thirdSocket = makeSocket('user-callee'); // Same userId
      const thirdHandlers: Record<string, (...args: unknown[]) => unknown> = {};
      const thirdMock = {
        data: { userId: 'user-callee' },
        on: jest.fn((event: string, handler: (...args: unknown[]) => unknown) => {
          thirdHandlers[event] = handler;
        }),
        emit: jest.fn(),
      };
      registerCallHandlers(thirdMock as any, io as any);

      // Callee initiates their own call to a different target
      mockPrismaChannelMember.findMany.mockResolvedValue([{ userId: 'user-other' }]);
      await thirdHandlers['call:initiate']({ channelId: 'ch-other', type: '1:1' });
      io.emittedEvents.length = 0;

      // Now calleeSocket tries to accept the original call — should be rejected
      calleeSocket.handlers['call:accept']({ callId });

      expect(io.emittedEvents.filter((e) => e.event === 'call:accepted')).toHaveLength(0);

      // Cleanup
      thirdHandlers['disconnect']?.();
    });
  });

  // ─── call:decline ───────────────────────────────────────────────────────

  describe('call:decline', () => {
    let callId: string;

    beforeEach(async () => {
      registerCallHandlers(callerSocket.socket as any, io as any);
      registerCallHandlers(calleeSocket.socket as any, io as any);

      await callerSocket.handlers['call:initiate']({ channelId: 'ch-1', type: '1:1' });
      const incomingEvent = io.emittedEvents.find((e) => e.event === 'call:incoming');
      callId = (incomingEvent!.data as Record<string, unknown>).callId as string;
      io.emittedEvents.length = 0;
    });

    it('emits call:declined to the initiator with the decliner userId', () => {
      calleeSocket.handlers['call:decline']({ callId });

      const declined = io.emittedEvents.find(
        (e) => e.event === 'call:declined' && e.room === 'user:user-caller',
      );
      expect(declined).toBeDefined();
      expect(declined!.data).toMatchObject({ callId, userId: 'user-callee' });
    });

    it('emits call:ended to all parties with reason "declined"', () => {
      calleeSocket.handlers['call:decline']({ callId });

      const ended = io.emittedEvents.filter((e) => e.event === 'call:ended');
      expect(ended.length).toBeGreaterThan(0);
      ended.forEach((e) => {
        expect((e.data as Record<string, unknown>).reason).toBe('declined');
      });
    });

    it('notifies the callee themselves via call:ended', () => {
      calleeSocket.handlers['call:decline']({ callId });

      // Callee is in calleeIds so they also get call:ended
      const calleeEnded = io.emittedEvents.find(
        (e) => e.event === 'call:ended' && e.room === 'user:user-callee',
      );
      expect(calleeEnded).toBeDefined();
    });

    it('does nothing when callId does not exist', () => {
      calleeSocket.handlers['call:decline']({ callId: 'bad-id' });

      expect(io.emittedEvents.filter((e) => e.event === 'call:declined')).toHaveLength(0);
    });
  });

  // ─── call:hangup ────────────────────────────────────────────────────────

  describe('call:hangup', () => {
    let callId: string;

    beforeEach(async () => {
      registerCallHandlers(callerSocket.socket as any, io as any);
      registerCallHandlers(calleeSocket.socket as any, io as any);

      await callerSocket.handlers['call:initiate']({ channelId: 'ch-1', type: '1:1' });
      const incomingEvent = io.emittedEvents.find((e) => e.event === 'call:incoming');
      callId = (incomingEvent!.data as Record<string, unknown>).callId as string;
      calleeSocket.handlers['call:accept']({ callId });
      io.emittedEvents.length = 0;
    });

    it('emits call:ended with reason "hangup" to all participants', () => {
      callerSocket.handlers['call:hangup']({ callId });

      const ended = io.emittedEvents.filter((e) => e.event === 'call:ended');
      expect(ended.length).toBeGreaterThan(0);
      ended.forEach((e) => {
        expect(e.data).toMatchObject({ callId, reason: 'hangup' });
      });
    });

    it('notifies both caller and callee via call:ended', () => {
      callerSocket.handlers['call:hangup']({ callId });

      expect(
        io.emittedEvents.some(
          (e) => e.event === 'call:ended' && e.room === 'user:user-caller',
        ),
      ).toBe(true);
      expect(
        io.emittedEvents.some(
          (e) => e.event === 'call:ended' && e.room === 'user:user-callee',
        ),
      ).toBe(true);
    });

    it('does nothing when callId does not exist', () => {
      callerSocket.handlers['call:hangup']({ callId: 'nonexistent' });

      expect(io.emittedEvents.filter((e) => e.event === 'call:ended')).toHaveLength(0);
    });

    it('does nothing when hangup called twice (idempotent)', () => {
      callerSocket.handlers['call:hangup']({ callId });
      io.emittedEvents.length = 0;

      // Second hangup should be ignored
      callerSocket.handlers['call:hangup']({ callId });

      expect(io.emittedEvents.filter((e) => e.event === 'call:ended')).toHaveLength(0);
    });
  });

  // ─── call:signal ────────────────────────────────────────────────────────

  describe('call:signal', () => {
    let callId: string;
    const testSignal = { type: 'offer', sdp: 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\n...' };

    beforeEach(async () => {
      registerCallHandlers(callerSocket.socket as any, io as any);
      registerCallHandlers(calleeSocket.socket as any, io as any);

      await callerSocket.handlers['call:initiate']({ channelId: 'ch-1', type: '1:1' });
      const incomingEvent = io.emittedEvents.find((e) => e.event === 'call:incoming');
      callId = (incomingEvent!.data as Record<string, unknown>).callId as string;
      calleeSocket.handlers['call:accept']({ callId });
      io.emittedEvents.length = 0;
    });

    it('relays signal to the target user with fromUserId set to sender', () => {
      callerSocket.handlers['call:signal']({ callId, toUserId: 'user-callee', signal: testSignal });

      const relayed = io.emittedEvents.find(
        (e) => e.event === 'call:signal' && e.room === 'user:user-callee',
      );
      expect(relayed).toBeDefined();
      expect(relayed!.data).toMatchObject({
        callId,
        fromUserId: 'user-caller',
        signal: testSignal,
      });
    });

    it('relays signal in the reverse direction (callee → caller)', () => {
      const answerSignal = { type: 'answer', sdp: 'v=0...' };
      calleeSocket.handlers['call:signal']({ callId, toUserId: 'user-caller', signal: answerSignal });

      const relayed = io.emittedEvents.find(
        (e) => e.event === 'call:signal' && e.room === 'user:user-caller',
      );
      expect(relayed).toBeDefined();
      expect(relayed!.data).toMatchObject({ callId, fromUserId: 'user-callee' });
    });

    it('does not relay signal when call does not exist', () => {
      callerSocket.handlers['call:signal']({ callId: 'bad-id', toUserId: 'user-callee', signal: {} });

      expect(io.emittedEvents.filter((e) => e.event === 'call:signal')).toHaveLength(0);
    });

    it('does not relay signal after call has ended', () => {
      callerSocket.handlers['call:hangup']({ callId });
      io.emittedEvents.length = 0;

      callerSocket.handlers['call:signal']({ callId, toUserId: 'user-callee', signal: testSignal });

      expect(io.emittedEvents.filter((e) => e.event === 'call:signal')).toHaveLength(0);
    });
  });

  // ─── call:toggle-media ──────────────────────────────────────────────────

  describe('call:toggle-media', () => {
    let callId: string;

    beforeEach(async () => {
      registerCallHandlers(callerSocket.socket as any, io as any);
      registerCallHandlers(calleeSocket.socket as any, io as any);

      await callerSocket.handlers['call:initiate']({ channelId: 'ch-1', type: '1:1' });
      const incomingEvent = io.emittedEvents.find((e) => e.event === 'call:incoming');
      callId = (incomingEvent!.data as Record<string, unknown>).callId as string;
      calleeSocket.handlers['call:accept']({ callId });
      io.emittedEvents.length = 0;
    });

    it('broadcasts media state change to all participants', () => {
      callerSocket.handlers['call:toggle-media']({ callId, isMuted: true, isCameraOn: false });

      const toggled = io.emittedEvents.filter((e) => e.event === 'call:media-toggled');
      expect(toggled.length).toBeGreaterThan(0);
      toggled.forEach((e) => {
        expect(e.data).toMatchObject({
          callId,
          userId: 'user-caller',
          isMuted: true,
          isCameraOn: false,
        });
      });
    });

    it('sends media toggle to both caller room and callee room', () => {
      callerSocket.handlers['call:toggle-media']({ callId, isMuted: true, isCameraOn: true });

      expect(
        io.emittedEvents.some(
          (e) => e.event === 'call:media-toggled' && e.room === 'user:user-caller',
        ),
      ).toBe(true);
      expect(
        io.emittedEvents.some(
          (e) => e.event === 'call:media-toggled' && e.room === 'user:user-callee',
        ),
      ).toBe(true);
    });

    it('does nothing when call does not exist', () => {
      callerSocket.handlers['call:toggle-media']({ callId: 'bad', isMuted: true, isCameraOn: false });

      expect(io.emittedEvents.filter((e) => e.event === 'call:media-toggled')).toHaveLength(0);
    });

    it('does nothing when call has ended', () => {
      callerSocket.handlers['call:hangup']({ callId });
      io.emittedEvents.length = 0;

      callerSocket.handlers['call:toggle-media']({ callId, isMuted: true, isCameraOn: false });

      expect(io.emittedEvents.filter((e) => e.event === 'call:media-toggled')).toHaveLength(0);
    });
  });

  // ─── Ring Timeout ────────────────────────────────────────────────────────

  describe('ring timeout (30s)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('auto-ends unanswered call with reason "no_answer" after 30 seconds', async () => {
      registerCallHandlers(callerSocket.socket as any, io as any);
      registerCallHandlers(calleeSocket.socket as any, io as any);

      await callerSocket.handlers['call:initiate']({ channelId: 'ch-ring', type: '1:1' });
      expect(io.emittedEvents.find((e) => e.event === 'call:incoming')).toBeDefined();
      io.emittedEvents.length = 0;

      // Advance past the 30-second ring timeout
      jest.advanceTimersByTime(30_001);

      const ended = io.emittedEvents.filter((e) => e.event === 'call:ended');
      expect(ended.length).toBeGreaterThan(0);
      ended.forEach((e) => {
        expect((e.data as Record<string, unknown>).reason).toBe('no_answer');
      });
    });

    it('notifies all callees on ring timeout', async () => {
      mockPrismaChannelMember.findMany.mockResolvedValue([
        { userId: 'user-callee-1' },
        { userId: 'user-callee-2' },
      ]);
      registerCallHandlers(callerSocket.socket as any, io as any);

      await callerSocket.handlers['call:initiate']({ channelId: 'ch-ring-multi', type: '1:1' });
      io.emittedEvents.length = 0;

      jest.advanceTimersByTime(30_001);

      // Both callees should receive call:ended
      expect(
        io.emittedEvents.some(
          (e) => e.event === 'call:ended' && e.room === 'user:user-callee-1',
        ),
      ).toBe(true);
      expect(
        io.emittedEvents.some(
          (e) => e.event === 'call:ended' && e.room === 'user:user-callee-2',
        ),
      ).toBe(true);
    });

    it('does NOT fire timeout when call is accepted before 30 seconds', async () => {
      registerCallHandlers(callerSocket.socket as any, io as any);
      registerCallHandlers(calleeSocket.socket as any, io as any);

      await callerSocket.handlers['call:initiate']({ channelId: 'ch-accepted', type: '1:1' });
      const incomingEvent = io.emittedEvents.find((e) => e.event === 'call:incoming');
      const callId = (incomingEvent!.data as Record<string, unknown>).callId as string;

      // Accept before timeout fires
      calleeSocket.handlers['call:accept']({ callId });
      io.emittedEvents.length = 0;

      // Advance past 30 seconds — timeout should have been cleared
      jest.advanceTimersByTime(30_001);

      expect(io.emittedEvents.filter((e) => e.event === 'call:ended')).toHaveLength(0);
    });

    it('does NOT fire timeout when call is declined before 30 seconds', async () => {
      registerCallHandlers(callerSocket.socket as any, io as any);
      registerCallHandlers(calleeSocket.socket as any, io as any);

      await callerSocket.handlers['call:initiate']({ channelId: 'ch-declined-timeout', type: '1:1' });
      const incomingEvent = io.emittedEvents.find((e) => e.event === 'call:incoming');
      const callId = (incomingEvent!.data as Record<string, unknown>).callId as string;

      calleeSocket.handlers['call:decline']({ callId });
      io.emittedEvents.length = 0;

      jest.advanceTimersByTime(30_001);

      // No additional call:ended — call already ended via decline
      expect(io.emittedEvents.filter((e) => e.event === 'call:ended')).toHaveLength(0);
    });
  });

  // ─── Disconnect Cleanup ──────────────────────────────────────────────────

  describe('disconnect cleanup', () => {
    it('ends active call when the caller disconnects', async () => {
      registerCallHandlers(callerSocket.socket as any, io as any);
      registerCallHandlers(calleeSocket.socket as any, io as any);

      await callerSocket.handlers['call:initiate']({ channelId: 'ch-disc', type: '1:1' });
      const incomingEvent = io.emittedEvents.find((e) => e.event === 'call:incoming');
      const callId = (incomingEvent!.data as Record<string, unknown>).callId as string;
      calleeSocket.handlers['call:accept']({ callId });
      io.emittedEvents.length = 0;

      callerSocket.handlers['disconnect']();

      const ended = io.emittedEvents.filter((e) => e.event === 'call:ended');
      expect(ended.length).toBeGreaterThan(0);
      expect(ended.some((e) => (e.data as Record<string, unknown>).reason === 'hangup')).toBe(true);
    });

    it('ends ringing call when caller disconnects before accept', async () => {
      registerCallHandlers(callerSocket.socket as any, io as any);
      registerCallHandlers(calleeSocket.socket as any, io as any);

      await callerSocket.handlers['call:initiate']({ channelId: 'ch-disc-ring', type: '1:1' });
      io.emittedEvents.length = 0;

      callerSocket.handlers['disconnect']();

      // Callee should receive call:ended
      const calleeEnded = io.emittedEvents.find(
        (e) => e.event === 'call:ended' && e.room === 'user:user-callee',
      );
      expect(calleeEnded).toBeDefined();
    });

    it('does nothing on disconnect when user is not in any call', () => {
      registerCallHandlers(callerSocket.socket as any, io as any);

      expect(() => callerSocket.handlers['disconnect']()).not.toThrow();
      expect(io.emittedEvents.filter((e) => e.event === 'call:ended')).toHaveLength(0);
    });

    it('saves call history to DB when call ends via disconnect', async () => {
      registerCallHandlers(callerSocket.socket as any, io as any);
      registerCallHandlers(calleeSocket.socket as any, io as any);

      await callerSocket.handlers['call:initiate']({ channelId: 'ch-db', type: '1:1' });
      const incomingEvent = io.emittedEvents.find((e) => e.event === 'call:incoming');
      const callId = (incomingEvent!.data as Record<string, unknown>).callId as string;
      calleeSocket.handlers['call:accept']({ callId });

      callerSocket.handlers['disconnect']();

      // Allow async saveCallHistory to complete
      await Promise.resolve();
      await Promise.resolve();

      expect(mockPrismaCall.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            channelId: 'ch-db',
            initiatorId: 'user-caller',
          }),
        }),
      );
    });
  });
});
