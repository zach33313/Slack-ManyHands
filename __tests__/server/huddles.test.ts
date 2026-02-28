/**
 * Tests for server/socket-handlers/huddles.ts
 *
 * Verifies group huddle signaling handlers:
 * - huddle:join creates huddle on first join (huddle:started)
 * - huddle:join adds user to existing huddle (huddle:user-joined)
 * - huddle:join is idempotent (no duplicate events)
 * - huddle:join auto-leaves previous huddle on channel switch
 * - huddle:join enforces max 6 participants
 * - huddle:leave emits huddle:user-left
 * - huddle:leave emits huddle:ended when last participant leaves
 * - huddle:signal relays WebRTC signals to target user
 * - huddle:toggle-media broadcasts media state changes
 * - Disconnect auto-leaves active huddle
 */

// ---------------------------------------------------------------------------
// Prisma mock — must be before any imports
// ---------------------------------------------------------------------------

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
}));

import { registerHuddleHandlers } from '../../server/socket-handlers/huddles';

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

/** Default user record factory */
function makeUserRecord(userId: string, name: string) {
  return { id: userId, name, image: null };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Huddle Handlers', () => {
  let io: ReturnType<typeof makeIo>;
  let userA: ReturnType<typeof makeSocket>;
  let userB: ReturnType<typeof makeSocket>;

  beforeEach(() => {
    jest.clearAllMocks();

    io = makeIo();
    userA = makeSocket('user-A');
    userB = makeSocket('user-B');

    // Default: return the appropriate user record based on userId
    mockPrismaUser.findUnique.mockImplementation(({ where: { id } }: { where: { id: string } }) => {
      const users: Record<string, ReturnType<typeof makeUserRecord>> = {
        'user-A': makeUserRecord('user-A', 'Alice'),
        'user-B': makeUserRecord('user-B', 'Bob'),
        'user-C': makeUserRecord('user-C', 'Carol'),
        'user-D': makeUserRecord('user-D', 'Dave'),
        'user-E': makeUserRecord('user-E', 'Eve'),
        'user-F': makeUserRecord('user-F', 'Frank'),
        'user-G': makeUserRecord('user-G', 'Grace'),
      };
      return Promise.resolve(users[id] ?? null);
    });
  });

  afterEach(() => {
    // Clean up all active huddle state
    userA.handlers['disconnect']?.();
    userB.handlers['disconnect']?.();
  });

  // ─── Event Registration ──────────────────────────────────────────────────

  describe('event registration', () => {
    it('registers all expected event handlers', () => {
      registerHuddleHandlers(userA.socket as any, io as any);

      expect(userA.socket.on).toHaveBeenCalledWith('huddle:join', expect.any(Function));
      expect(userA.socket.on).toHaveBeenCalledWith('huddle:leave', expect.any(Function));
      expect(userA.socket.on).toHaveBeenCalledWith('huddle:signal', expect.any(Function));
      expect(userA.socket.on).toHaveBeenCalledWith('huddle:toggle-media', expect.any(Function));
      expect(userA.socket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });
  });

  // ─── huddle:join (first user) ────────────────────────────────────────────

  describe('huddle:join — first user', () => {
    beforeEach(() => {
      registerHuddleHandlers(userA.socket as any, io as any);
    });

    it('emits huddle:started to the channel room', async () => {
      await userA.handlers['huddle:join']({ channelId: 'ch-1' });

      const started = io.emittedEvents.find(
        (e) => e.event === 'huddle:started' && e.room === 'channel:ch-1',
      );
      expect(started).toBeDefined();
      expect((started!.data as Record<string, unknown>).channelId).toBe('ch-1');
    });

    it('includes the joining user in huddle:started participants', async () => {
      await userA.handlers['huddle:join']({ channelId: 'ch-1' });

      const started = io.emittedEvents.find((e) => e.event === 'huddle:started');
      const participants = (started!.data as Record<string, unknown>).participants as Array<Record<string, unknown>>;
      expect(participants).toHaveLength(1);
      expect(participants[0].userId).toBe('user-A');
    });

    it('sends huddle:participants snapshot to the joining socket', async () => {
      await userA.handlers['huddle:join']({ channelId: 'ch-1' });

      expect(userA.socketEmit).toHaveBeenCalledWith('huddle:participants', {
        channelId: 'ch-1',
        participants: expect.arrayContaining([
          expect.objectContaining({ userId: 'user-A' }),
        ]),
      });
    });

    it('includes user name and image in the participant record', async () => {
      await userA.handlers['huddle:join']({ channelId: 'ch-1' });

      expect(userA.socketEmit).toHaveBeenCalledWith(
        'huddle:participants',
        expect.objectContaining({
          participants: expect.arrayContaining([
            expect.objectContaining({
              userId: 'user-A',
              user: expect.objectContaining({ name: 'Alice' }),
            }),
          ]),
        }),
      );
    });

    it('sets initial media state to isMuted=false, isCameraOn=false', async () => {
      await userA.handlers['huddle:join']({ channelId: 'ch-1' });

      const started = io.emittedEvents.find((e) => e.event === 'huddle:started');
      const participants = (started!.data as Record<string, unknown>).participants as Array<Record<string, unknown>>;
      expect(participants[0].isMuted).toBe(false);
      expect(participants[0].isCameraOn).toBe(false);
    });

    it('does nothing when user is not found in DB', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);

      await userA.handlers['huddle:join']({ channelId: 'ch-1' });

      expect(io.emittedEvents.filter((e) => e.event === 'huddle:started')).toHaveLength(0);
    });

    it('does not emit huddle:user-joined for the first user', async () => {
      await userA.handlers['huddle:join']({ channelId: 'ch-1' });

      expect(io.emittedEvents.filter((e) => e.event === 'huddle:user-joined')).toHaveLength(0);
    });
  });

  // ─── huddle:join (subsequent users) ─────────────────────────────────────

  describe('huddle:join — subsequent users', () => {
    beforeEach(async () => {
      registerHuddleHandlers(userA.socket as any, io as any);
      registerHuddleHandlers(userB.socket as any, io as any);

      await userA.handlers['huddle:join']({ channelId: 'ch-1' });
      io.emittedEvents.length = 0;
      userA.socketEmit.mockClear();
    });

    it('emits huddle:user-joined to channel room when second user joins', async () => {
      await userB.handlers['huddle:join']({ channelId: 'ch-1' });

      const joined = io.emittedEvents.find(
        (e) => e.event === 'huddle:user-joined' && e.room === 'channel:ch-1',
      );
      expect(joined).toBeDefined();
      expect((joined!.data as Record<string, unknown>).channelId).toBe('ch-1');
    });

    it('includes the new user in huddle:user-joined participant', async () => {
      await userB.handlers['huddle:join']({ channelId: 'ch-1' });

      const joined = io.emittedEvents.find((e) => e.event === 'huddle:user-joined');
      const participant = (joined!.data as Record<string, unknown>).participant as Record<string, unknown>;
      expect(participant.userId).toBe('user-B');
    });

    it('does not emit huddle:started when joining an existing huddle', async () => {
      await userB.handlers['huddle:join']({ channelId: 'ch-1' });

      expect(io.emittedEvents.filter((e) => e.event === 'huddle:started')).toHaveLength(0);
    });

    it('sends huddle:participants with all current users to the new joiner', async () => {
      await userB.handlers['huddle:join']({ channelId: 'ch-1' });

      expect(userB.socketEmit).toHaveBeenCalledWith('huddle:participants', {
        channelId: 'ch-1',
        participants: expect.arrayContaining([
          expect.objectContaining({ userId: 'user-A' }),
          expect.objectContaining({ userId: 'user-B' }),
        ]),
      });
    });

    it('huddle:participants contains exactly 2 users after second join', async () => {
      await userB.handlers['huddle:join']({ channelId: 'ch-1' });

      const call = userB.socketEmit.mock.calls.find(
        (c) => c[0] === 'huddle:participants',
      );
      const participants = (call![1] as Record<string, unknown>).participants as unknown[];
      expect(participants).toHaveLength(2);
    });
  });

  // ─── Idempotency ────────────────────────────────────────────────────────

  describe('huddle:join — idempotency', () => {
    it('joining the same huddle twice does not emit duplicate events', async () => {
      registerHuddleHandlers(userA.socket as any, io as any);
      registerHuddleHandlers(userB.socket as any, io as any);

      await userA.handlers['huddle:join']({ channelId: 'ch-1' });
      await userB.handlers['huddle:join']({ channelId: 'ch-1' });
      io.emittedEvents.length = 0;

      // User A tries to join the same huddle again
      await userA.handlers['huddle:join']({ channelId: 'ch-1' });

      expect(io.emittedEvents.filter((e) => e.event === 'huddle:user-joined')).toHaveLength(0);
      expect(io.emittedEvents.filter((e) => e.event === 'huddle:started')).toHaveLength(0);
    });
  });

  // ─── Auto-leave on channel switch ───────────────────────────────────────

  describe('huddle:join — auto-leave on channel switch', () => {
    it('leaves the existing huddle before joining a new channel', async () => {
      registerHuddleHandlers(userA.socket as any, io as any);

      await userA.handlers['huddle:join']({ channelId: 'ch-1' });
      io.emittedEvents.length = 0;

      await userA.handlers['huddle:join']({ channelId: 'ch-2' });

      const leftCh1 = io.emittedEvents.find(
        (e) => e.event === 'huddle:user-left' && e.room === 'channel:ch-1',
      );
      const startedCh2 = io.emittedEvents.find(
        (e) => e.event === 'huddle:started' && e.room === 'channel:ch-2',
      );
      expect(leftCh1).toBeDefined();
      expect(startedCh2).toBeDefined();
    });

    it('emits huddle:ended for old channel if it was the last participant', async () => {
      registerHuddleHandlers(userA.socket as any, io as any);

      await userA.handlers['huddle:join']({ channelId: 'ch-1' });
      io.emittedEvents.length = 0;

      await userA.handlers['huddle:join']({ channelId: 'ch-2' });

      const ended = io.emittedEvents.find(
        (e) => e.event === 'huddle:ended' && e.room === 'channel:ch-1',
      );
      expect(ended).toBeDefined();
    });
  });

  // ─── Max Participants ────────────────────────────────────────────────────

  describe('huddle:join — max participants (6)', () => {
    it('rejects the 7th participant when huddle is at capacity', async () => {
      const userIds = ['user-A', 'user-B', 'user-C', 'user-D', 'user-E', 'user-F', 'user-G'];
      const sockets = userIds.map((id) => {
        const s = makeSocket(id);
        registerHuddleHandlers(s.socket as any, io as any);
        return s;
      });

      // Join 6 users successfully
      for (let i = 0; i < 6; i++) {
        await sockets[i].handlers['huddle:join']({ channelId: 'ch-max' });
      }

      const eventsBefore = io.emittedEvents.length;

      // 7th user tries to join
      await sockets[6].handlers['huddle:join']({ channelId: 'ch-max' });

      const newEvents = io.emittedEvents.slice(eventsBefore);
      expect(newEvents.filter((e) => e.event === 'huddle:user-joined')).toHaveLength(0);
      expect(newEvents.filter((e) => e.event === 'huddle:started')).toHaveLength(0);
      expect(sockets[6].socketEmit).not.toHaveBeenCalledWith('huddle:participants', expect.anything());

      // Clean up all 6 sockets
      for (let i = 0; i < 7; i++) {
        sockets[i].handlers['disconnect']?.();
      }
    });

    it('allows 6th participant when huddle has exactly 5', async () => {
      const userIds = ['user-A', 'user-B', 'user-C', 'user-D', 'user-E', 'user-F'];
      const sockets = userIds.map((id) => {
        const s = makeSocket(id);
        registerHuddleHandlers(s.socket as any, io as any);
        return s;
      });

      for (let i = 0; i < 5; i++) {
        await sockets[i].handlers['huddle:join']({ channelId: 'ch-6th' });
      }
      io.emittedEvents.length = 0;

      // 6th user should be allowed
      await sockets[5].handlers['huddle:join']({ channelId: 'ch-6th' });

      const joined = io.emittedEvents.find((e) => e.event === 'huddle:user-joined');
      expect(joined).toBeDefined();

      // Clean up
      sockets.forEach((s) => s.handlers['disconnect']?.());
    });
  });

  // ─── huddle:leave ────────────────────────────────────────────────────────

  describe('huddle:leave', () => {
    beforeEach(async () => {
      registerHuddleHandlers(userA.socket as any, io as any);
      registerHuddleHandlers(userB.socket as any, io as any);

      await userA.handlers['huddle:join']({ channelId: 'ch-1' });
      await userB.handlers['huddle:join']({ channelId: 'ch-1' });
      io.emittedEvents.length = 0;
    });

    it('emits huddle:user-left to the channel room', () => {
      userA.handlers['huddle:leave']({ channelId: 'ch-1' });

      const left = io.emittedEvents.find(
        (e) => e.event === 'huddle:user-left' && e.room === 'channel:ch-1',
      );
      expect(left).toBeDefined();
      expect(left!.data).toMatchObject({ channelId: 'ch-1', userId: 'user-A' });
    });

    it('does NOT emit huddle:ended when participants remain', () => {
      userA.handlers['huddle:leave']({ channelId: 'ch-1' });

      expect(io.emittedEvents.filter((e) => e.event === 'huddle:ended')).toHaveLength(0);
    });

    it('emits huddle:ended when the last participant leaves', () => {
      userA.handlers['huddle:leave']({ channelId: 'ch-1' });
      io.emittedEvents.length = 0;

      userB.handlers['huddle:leave']({ channelId: 'ch-1' });

      const ended = io.emittedEvents.find(
        (e) => e.event === 'huddle:ended' && e.room === 'channel:ch-1',
      );
      expect(ended).toBeDefined();
      expect((ended!.data as Record<string, unknown>).channelId).toBe('ch-1');
    });

    it('does not emit huddle:user-left when called for a non-existent huddle', () => {
      userA.handlers['huddle:leave']({ channelId: 'ch-nonexistent' });

      expect(io.emittedEvents.filter((e) => e.event === 'huddle:user-left')).toHaveLength(0);
    });

    it('does not emit huddle:user-left when user is not in the huddle', () => {
      // userA already left
      userA.handlers['huddle:leave']({ channelId: 'ch-1' });
      io.emittedEvents.length = 0;

      // userA tries to leave again
      userA.handlers['huddle:leave']({ channelId: 'ch-1' });

      expect(io.emittedEvents.filter((e) => e.event === 'huddle:user-left')).toHaveLength(0);
    });
  });

  // ─── huddle:signal ───────────────────────────────────────────────────────

  describe('huddle:signal', () => {
    const testSignal = { type: 'offer', sdp: 'v=0\r\n...' };

    beforeEach(async () => {
      registerHuddleHandlers(userA.socket as any, io as any);
      registerHuddleHandlers(userB.socket as any, io as any);

      await userA.handlers['huddle:join']({ channelId: 'ch-1' });
      await userB.handlers['huddle:join']({ channelId: 'ch-1' });
      io.emittedEvents.length = 0;
    });

    it('relays signal to the target user room with fromUserId', () => {
      userA.handlers['huddle:signal']({ channelId: 'ch-1', toUserId: 'user-B', signal: testSignal });

      const relayed = io.emittedEvents.find(
        (e) => e.event === 'huddle:signal' && e.room === 'user:user-B',
      );
      expect(relayed).toBeDefined();
      expect(relayed!.data).toMatchObject({
        channelId: 'ch-1',
        fromUserId: 'user-A',
        signal: testSignal,
      });
    });

    it('relays signal in the reverse direction (userB → userA)', () => {
      const answerSignal = { type: 'answer', sdp: 'v=0...' };
      userB.handlers['huddle:signal']({ channelId: 'ch-1', toUserId: 'user-A', signal: answerSignal });

      const relayed = io.emittedEvents.find(
        (e) => e.event === 'huddle:signal' && e.room === 'user:user-A',
      );
      expect(relayed).toBeDefined();
      expect(relayed!.data).toMatchObject({ fromUserId: 'user-B' });
    });

    it('does not relay signal when huddle does not exist', () => {
      userA.handlers['huddle:signal']({ channelId: 'nonexistent', toUserId: 'user-B', signal: {} });

      expect(io.emittedEvents.filter((e) => e.event === 'huddle:signal')).toHaveLength(0);
    });
  });

  // ─── huddle:toggle-media ────────────────────────────────────────────────

  describe('huddle:toggle-media', () => {
    beforeEach(async () => {
      registerHuddleHandlers(userA.socket as any, io as any);
      registerHuddleHandlers(userB.socket as any, io as any);

      await userA.handlers['huddle:join']({ channelId: 'ch-1' });
      await userB.handlers['huddle:join']({ channelId: 'ch-1' });
      io.emittedEvents.length = 0;
    });

    it('emits huddle:media-toggled to the channel room', () => {
      userA.handlers['huddle:toggle-media']({ channelId: 'ch-1', isMuted: true, isCameraOn: false });

      const toggled = io.emittedEvents.find(
        (e) => e.event === 'huddle:media-toggled' && e.room === 'channel:ch-1',
      );
      expect(toggled).toBeDefined();
    });

    it('includes userId and updated media state in the payload', () => {
      userA.handlers['huddle:toggle-media']({ channelId: 'ch-1', isMuted: true, isCameraOn: false });

      const toggled = io.emittedEvents.find((e) => e.event === 'huddle:media-toggled');
      expect(toggled!.data).toMatchObject({
        channelId: 'ch-1',
        userId: 'user-A',
        isMuted: true,
        isCameraOn: false,
      });
    });

    it('reflects the exact isMuted and isCameraOn values provided', () => {
      userB.handlers['huddle:toggle-media']({ channelId: 'ch-1', isMuted: false, isCameraOn: true });

      const toggled = io.emittedEvents.find((e) => e.event === 'huddle:media-toggled');
      expect((toggled!.data as Record<string, unknown>).isMuted).toBe(false);
      expect((toggled!.data as Record<string, unknown>).isCameraOn).toBe(true);
    });

    it('does nothing when huddle does not exist', () => {
      userA.handlers['huddle:toggle-media']({ channelId: 'nonexistent', isMuted: true, isCameraOn: false });

      expect(io.emittedEvents.filter((e) => e.event === 'huddle:media-toggled')).toHaveLength(0);
    });

    it('does nothing when user is not a huddle participant', () => {
      const outsider = makeSocket('user-outsider');
      registerHuddleHandlers(outsider.socket as any, io as any);

      outsider.handlers['huddle:toggle-media']({ channelId: 'ch-1', isMuted: true, isCameraOn: false });

      expect(io.emittedEvents.filter((e) => e.event === 'huddle:media-toggled')).toHaveLength(0);
    });
  });

  // ─── Disconnect Cleanup ──────────────────────────────────────────────────

  describe('disconnect cleanup', () => {
    it('auto-leaves huddle when socket disconnects', async () => {
      registerHuddleHandlers(userA.socket as any, io as any);
      registerHuddleHandlers(userB.socket as any, io as any);

      await userA.handlers['huddle:join']({ channelId: 'ch-disc' });
      await userB.handlers['huddle:join']({ channelId: 'ch-disc' });
      io.emittedEvents.length = 0;

      userA.handlers['disconnect']();

      const left = io.emittedEvents.find(
        (e) => e.event === 'huddle:user-left' && e.room === 'channel:ch-disc',
      );
      expect(left).toBeDefined();
      expect((left!.data as Record<string, unknown>).userId).toBe('user-A');
    });

    it('emits huddle:ended when last participant disconnects', async () => {
      registerHuddleHandlers(userA.socket as any, io as any);

      await userA.handlers['huddle:join']({ channelId: 'ch-solo' });
      io.emittedEvents.length = 0;

      userA.handlers['disconnect']();

      const ended = io.emittedEvents.find(
        (e) => e.event === 'huddle:ended' && e.room === 'channel:ch-solo',
      );
      expect(ended).toBeDefined();
    });

    it('does nothing on disconnect when user is not in any huddle', () => {
      registerHuddleHandlers(userA.socket as any, io as any);

      expect(() => userA.handlers['disconnect']()).not.toThrow();
      expect(io.emittedEvents.filter((e) => e.event === 'huddle:user-left')).toHaveLength(0);
    });

    it('removes the user from the participant list after disconnect', async () => {
      registerHuddleHandlers(userA.socket as any, io as any);
      registerHuddleHandlers(userB.socket as any, io as any);

      await userA.handlers['huddle:join']({ channelId: 'ch-remove' });
      await userB.handlers['huddle:join']({ channelId: 'ch-remove' });
      io.emittedEvents.length = 0;

      userA.handlers['disconnect']();

      // A new user joining should only see userB in the participant list
      const userC = makeSocket('user-C');
      registerHuddleHandlers(userC.socket as any, io as any);
      await userC.handlers['huddle:join']({ channelId: 'ch-remove' });

      const participantsCall = userC.socketEmit.mock.calls.find(
        (c) => c[0] === 'huddle:participants',
      );
      const participants = (participantsCall![1] as Record<string, unknown>).participants as Array<Record<string, unknown>>;
      expect(participants.some((p) => p.userId === 'user-A')).toBe(false);
      expect(participants.some((p) => p.userId === 'user-B')).toBe(true);
      expect(participants.some((p) => p.userId === 'user-C')).toBe(true);

      userC.handlers['disconnect']?.();
      userB.handlers['disconnect']?.();
    });
  });

  // ─── Cross-channel isolation ─────────────────────────────────────────────

  describe('channel isolation', () => {
    it('huddles in different channels do not interfere', async () => {
      const userC = makeSocket('user-C');
      registerHuddleHandlers(userA.socket as any, io as any);
      registerHuddleHandlers(userB.socket as any, io as any);
      registerHuddleHandlers(userC.socket as any, io as any);

      await userA.handlers['huddle:join']({ channelId: 'ch-alpha' });
      await userB.handlers['huddle:join']({ channelId: 'ch-beta' });
      io.emittedEvents.length = 0;

      // Signal from user-A in ch-alpha should not affect ch-beta
      userA.handlers['huddle:signal']({ channelId: 'ch-alpha', toUserId: 'user-B', signal: {} });

      const signal = io.emittedEvents.find(
        (e) => e.event === 'huddle:signal' && e.room === 'user:user-B',
      );
      // Signal is routed by userId, so it DOES reach user-B, but via their user room
      // However, user-B can check the channelId to ignore signals for other channels
      expect(signal).toBeDefined();
      expect((signal!.data as Record<string, unknown>).channelId).toBe('ch-alpha');

      userC.handlers['disconnect']?.();
    });

    it('leaving one channel does not affect another channel huddle', async () => {
      registerHuddleHandlers(userA.socket as any, io as any);
      registerHuddleHandlers(userB.socket as any, io as any);

      await userA.handlers['huddle:join']({ channelId: 'ch-alpha' });
      await userA.handlers['huddle:join']({ channelId: 'ch-beta' }); // auto-leaves ch-alpha
      await userB.handlers['huddle:join']({ channelId: 'ch-beta' });
      io.emittedEvents.length = 0;

      userA.handlers['huddle:leave']({ channelId: 'ch-beta' });

      // ch-beta still has userB, so no huddle:ended for ch-beta
      expect(
        io.emittedEvents.find(
          (e) => e.event === 'huddle:ended' && e.room === 'channel:ch-beta',
        ),
      ).toBeUndefined();
    });
  });
});
