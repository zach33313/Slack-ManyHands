/**
 * Tests for server/socket-handlers/polls.ts
 *
 * Verifies poll event handlers:
 * - poll:vote   — creates/replaces vote, emits poll:updated with correct counts
 * - poll:unvote — removes specific vote, emits poll:updated
 * - poll:end    — deactivates poll (creator only), emits poll:ended
 *
 * Uses mocked Prisma client — no real DB required.
 */

// ---------------------------------------------------------------------------
// Prisma mocks — must be declared BEFORE jest.mock() call
// ---------------------------------------------------------------------------

const mockPrismaPoll = {
  findUnique: jest.fn(),
  update: jest.fn(),
};

const mockPrismaPollVote = {
  findMany: jest.fn(),
  deleteMany: jest.fn(),
  create: jest.fn(),
  upsert: jest.fn(),
};

// Simulate $transaction by executing all operations in sequence
const mockTransaction = jest.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    poll: mockPrismaPoll,
    pollVote: mockPrismaPollVote,
    $transaction: mockTransaction,
  })),
}));

jest.mock('../../shared/lib/constants', () => ({
  channelRoom: (id: string) => `channel:${id}`,
  userRoom: (id: string) => `user:${id}`,
  workspaceRoom: (id: string) => `workspace:${id}`,
}));

import { registerPollHandlers } from '../../server/socket-handlers/polls';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** A poll DB record with sensible defaults */
function makePoll(overrides: Record<string, unknown> = {}) {
  return {
    id: 'poll-1',
    messageId: 'msg-1',
    question: 'Favourite colour?',
    options: JSON.stringify(['Red', 'Blue', 'Green']),
    isActive: true,
    endsAt: new Date(Date.now() + 3_600_000), // 1 hour from now
    createdAt: new Date('2026-01-01'),
    message: { channelId: 'ch-1', userId: 'creator-1' },
    ...overrides,
  };
}

/** Raw vote rows returned by pollVote.findMany */
function makeVoteRows(rows: Array<{ option: string; userId: string }> = []) {
  return rows;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Poll Handlers', () => {
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

    registerPollHandlers(socket);
  });

  // -------------------------------------------------------------------------
  // Event registration
  // -------------------------------------------------------------------------

  describe('event registration', () => {
    it('registers poll:vote, poll:unvote, and poll:end handlers', () => {
      expect(socket.on).toHaveBeenCalledWith('poll:vote', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('poll:unvote', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('poll:end', expect.any(Function));
    });
  });

  // -------------------------------------------------------------------------
  // poll:vote
  // -------------------------------------------------------------------------

  describe('poll:vote', () => {
    it('creates a vote and emits poll:updated with correct vote counts', async () => {
      mockPrismaPoll.findUnique.mockResolvedValue(makePoll());
      mockPrismaPollVote.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaPollVote.create.mockResolvedValue({ id: 'vote-new' });
      // After voting: user-1 voted Red, user-2 voted Blue
      mockPrismaPollVote.findMany.mockResolvedValue(
        makeVoteRows([
          { option: 'Red', userId: 'user-1' },
          { option: 'Blue', userId: 'user-2' },
        ])
      );

      await handlers['poll:vote']({ pollId: 'poll-1', option: 'Red' });

      // Should remove prior votes before inserting new one
      expect(mockPrismaPollVote.deleteMany).toHaveBeenCalledWith({
        where: { pollId: 'poll-1', userId: 'user-1' },
      });

      // Should create the new vote
      expect(mockPrismaPollVote.create).toHaveBeenCalledWith({
        data: { pollId: 'poll-1', userId: 'user-1', option: 'Red' },
      });

      // Should emit poll:updated to the channel room
      expect(mockNspTo).toHaveBeenCalledWith('channel:ch-1');
      expect(mockNspEmit).toHaveBeenCalledWith(
        'poll:updated',
        expect.objectContaining({
          pollId: 'poll-1',
          totalVotes: 2,
        })
      );
    });

    it('calculates vote percentages correctly', async () => {
      mockPrismaPoll.findUnique.mockResolvedValue(makePoll());
      mockPrismaPollVote.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaPollVote.create.mockResolvedValue({});
      // 1 Red vote out of 2 total = 50%
      mockPrismaPollVote.findMany.mockResolvedValue(
        makeVoteRows([
          { option: 'Red', userId: 'user-1' },
          { option: 'Blue', userId: 'user-2' },
        ])
      );

      await handlers['poll:vote']({ pollId: 'poll-1', option: 'Red' });

      const emittedPayload = mockNspEmit.mock.calls[0][1];
      const redOption = emittedPayload.votes.find((v: any) => v.option === 'Red');
      const blueOption = emittedPayload.votes.find((v: any) => v.option === 'Blue');
      const greenOption = emittedPayload.votes.find((v: any) => v.option === 'Green');

      expect(redOption).toMatchObject({ count: 1, percentage: 50 });
      expect(blueOption).toMatchObject({ count: 1, percentage: 50 });
      expect(greenOption).toMatchObject({ count: 0, percentage: 0 });
    });

    it('enforces single-choice by deleting previous vote before inserting new', async () => {
      mockPrismaPoll.findUnique.mockResolvedValue(makePoll());
      // Simulates user previously voted 'Red', now voting 'Blue'
      mockPrismaPollVote.deleteMany.mockResolvedValue({ count: 1 });
      mockPrismaPollVote.create.mockResolvedValue({});
      mockPrismaPollVote.findMany.mockResolvedValue(
        makeVoteRows([{ option: 'Blue', userId: 'user-1' }])
      );

      await handlers['poll:vote']({ pollId: 'poll-1', option: 'Blue' });

      // Must delete ALL user's prior votes for this poll
      expect(mockPrismaPollVote.deleteMany).toHaveBeenCalledWith({
        where: { pollId: 'poll-1', userId: 'user-1' },
      });
      // Then create the new vote
      expect(mockPrismaPollVote.create).toHaveBeenCalledWith({
        data: { pollId: 'poll-1', userId: 'user-1', option: 'Blue' },
      });

      const emittedPayload = mockNspEmit.mock.calls[0][1];
      const blueOption = emittedPayload.votes.find((v: any) => v.option === 'Blue');
      expect(blueOption?.userIds).toContain('user-1');
    });

    it('does nothing when pollId is missing', async () => {
      await handlers['poll:vote']({ pollId: '', option: 'Red' });

      expect(mockPrismaPoll.findUnique).not.toHaveBeenCalled();
      expect(mockPrismaPollVote.create).not.toHaveBeenCalled();
    });

    it('does nothing when option is missing', async () => {
      await handlers['poll:vote']({ pollId: 'poll-1', option: '' });

      expect(mockPrismaPoll.findUnique).not.toHaveBeenCalled();
      expect(mockPrismaPollVote.create).not.toHaveBeenCalled();
    });

    it('does nothing when poll is not found', async () => {
      mockPrismaPoll.findUnique.mockResolvedValue(null);

      await handlers['poll:vote']({ pollId: 'nonexistent', option: 'Red' });

      expect(mockPrismaPollVote.create).not.toHaveBeenCalled();
      expect(mockNspEmit).not.toHaveBeenCalled();
    });

    it('does nothing when poll is inactive (isActive=false)', async () => {
      mockPrismaPoll.findUnique.mockResolvedValue(makePoll({ isActive: false }));

      await handlers['poll:vote']({ pollId: 'poll-1', option: 'Red' });

      expect(mockPrismaPollVote.create).not.toHaveBeenCalled();
      expect(mockNspEmit).not.toHaveBeenCalled();
    });

    it('auto-deactivates and does not vote when poll has expired (endsAt in past)', async () => {
      mockPrismaPoll.findUnique.mockResolvedValue(
        makePoll({ endsAt: new Date(Date.now() - 1000) }) // expired
      );
      mockPrismaPoll.update.mockResolvedValue({});

      await handlers['poll:vote']({ pollId: 'poll-1', option: 'Red' });

      // Should mark poll as inactive
      expect(mockPrismaPoll.update).toHaveBeenCalledWith({
        where: { id: 'poll-1' },
        data: { isActive: false },
      });
      // Should NOT create vote
      expect(mockPrismaPollVote.create).not.toHaveBeenCalled();
      expect(mockNspEmit).not.toHaveBeenCalled();
    });

    it('does nothing when option is not in poll options list', async () => {
      mockPrismaPoll.findUnique.mockResolvedValue(makePoll());

      await handlers['poll:vote']({ pollId: 'poll-1', option: 'Purple' });

      expect(mockPrismaPollVote.create).not.toHaveBeenCalled();
      expect(mockNspEmit).not.toHaveBeenCalled();
    });

    it('handles database errors gracefully without throwing', async () => {
      mockPrismaPoll.findUnique.mockRejectedValue(new Error('DB connection failed'));

      await expect(
        handlers['poll:vote']({ pollId: 'poll-1', option: 'Red' })
      ).resolves.toBeUndefined();
    });

    it('includes userIds array in each vote group', async () => {
      mockPrismaPoll.findUnique.mockResolvedValue(makePoll());
      mockPrismaPollVote.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaPollVote.create.mockResolvedValue({});
      mockPrismaPollVote.findMany.mockResolvedValue(
        makeVoteRows([
          { option: 'Red', userId: 'user-1' },
          { option: 'Red', userId: 'user-3' },
        ])
      );

      await handlers['poll:vote']({ pollId: 'poll-1', option: 'Red' });

      const payload = mockNspEmit.mock.calls[0][1];
      const redGroup = payload.votes.find((v: any) => v.option === 'Red');
      expect(redGroup.userIds).toEqual(expect.arrayContaining(['user-1', 'user-3']));
      expect(redGroup.count).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // poll:unvote
  // -------------------------------------------------------------------------

  describe('poll:unvote', () => {
    it('deletes the specific vote and emits poll:updated with updated counts', async () => {
      mockPrismaPoll.findUnique.mockResolvedValue(makePoll());
      mockPrismaPollVote.deleteMany.mockResolvedValue({ count: 1 });
      // After unvote: no votes remain
      mockPrismaPollVote.findMany.mockResolvedValue([]);

      await handlers['poll:unvote']({ pollId: 'poll-1', option: 'Red' });

      expect(mockPrismaPollVote.deleteMany).toHaveBeenCalledWith({
        where: { pollId: 'poll-1', userId: 'user-1', option: 'Red' },
      });

      expect(mockNspTo).toHaveBeenCalledWith('channel:ch-1');
      expect(mockNspEmit).toHaveBeenCalledWith(
        'poll:updated',
        expect.objectContaining({ pollId: 'poll-1', totalVotes: 0 })
      );
    });

    it('does nothing when pollId is missing', async () => {
      await handlers['poll:unvote']({ pollId: '', option: 'Red' });

      expect(mockPrismaPoll.findUnique).not.toHaveBeenCalled();
    });

    it('does nothing when option is missing', async () => {
      await handlers['poll:unvote']({ pollId: 'poll-1', option: '' });

      expect(mockPrismaPoll.findUnique).not.toHaveBeenCalled();
    });

    it('does nothing when poll is not found', async () => {
      mockPrismaPoll.findUnique.mockResolvedValue(null);

      await handlers['poll:unvote']({ pollId: 'nonexistent', option: 'Red' });

      expect(mockPrismaPollVote.deleteMany).not.toHaveBeenCalled();
      expect(mockNspEmit).not.toHaveBeenCalled();
    });

    it('handles database errors gracefully', async () => {
      mockPrismaPoll.findUnique.mockRejectedValue(new Error('DB error'));

      await expect(
        handlers['poll:unvote']({ pollId: 'poll-1', option: 'Red' })
      ).resolves.toBeUndefined();
    });

    it('emits correct counts when other votes still exist after unvoting', async () => {
      mockPrismaPoll.findUnique.mockResolvedValue(makePoll());
      mockPrismaPollVote.deleteMany.mockResolvedValue({ count: 1 });
      // user-2's vote on Blue remains
      mockPrismaPollVote.findMany.mockResolvedValue(
        makeVoteRows([{ option: 'Blue', userId: 'user-2' }])
      );

      await handlers['poll:unvote']({ pollId: 'poll-1', option: 'Red' });

      const payload = mockNspEmit.mock.calls[0][1];
      expect(payload.totalVotes).toBe(1);
      const blueGroup = payload.votes.find((v: any) => v.option === 'Blue');
      expect(blueGroup?.count).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // poll:end
  // -------------------------------------------------------------------------

  describe('poll:end', () => {
    it('deactivates the poll and emits poll:ended when called by creator', async () => {
      // Poll creator is 'creator-1'; socket.data.userId is 'creator-1' for this test
      const creatorSocket = {
        ...socket,
        data: { userId: 'creator-1', email: 'creator@test.com' },
      };
      const creatorHandlers: Record<string, any> = {};
      creatorSocket.on = jest.fn((event: string, handler: any) => {
        creatorHandlers[event] = handler;
      });
      registerPollHandlers(creatorSocket);

      mockPrismaPoll.findUnique.mockResolvedValue(makePoll()); // message.userId = 'creator-1'
      mockPrismaPoll.update.mockResolvedValue({});

      await creatorHandlers['poll:end']({ pollId: 'poll-1' });

      expect(mockPrismaPoll.update).toHaveBeenCalledWith({
        where: { id: 'poll-1' },
        data: { isActive: false },
      });

      expect(mockNspTo).toHaveBeenCalledWith('channel:ch-1');
      expect(mockNspEmit).toHaveBeenCalledWith('poll:ended', { pollId: 'poll-1' });
    });

    it('rejects poll:end when user is not the poll creator', async () => {
      // socket.data.userId is 'user-1', but poll creator is 'creator-1'
      mockPrismaPoll.findUnique.mockResolvedValue(makePoll()); // message.userId = 'creator-1'

      await handlers['poll:end']({ pollId: 'poll-1' });

      expect(mockPrismaPoll.update).not.toHaveBeenCalled();
      expect(mockNspEmit).not.toHaveBeenCalled();
    });

    it('does nothing when pollId is missing', async () => {
      await handlers['poll:end']({ pollId: '' });

      expect(mockPrismaPoll.findUnique).not.toHaveBeenCalled();
    });

    it('does nothing when poll is not found', async () => {
      mockPrismaPoll.findUnique.mockResolvedValue(null);

      await handlers['poll:end']({ pollId: 'nonexistent' });

      expect(mockPrismaPoll.update).not.toHaveBeenCalled();
      expect(mockNspEmit).not.toHaveBeenCalled();
    });

    it('handles database errors gracefully', async () => {
      mockPrismaPoll.findUnique.mockRejectedValue(new Error('DB error'));

      await expect(
        handlers['poll:end']({ pollId: 'poll-1' })
      ).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Vote aggregation edge cases
  // -------------------------------------------------------------------------

  describe('vote aggregation', () => {
    it('returns 0% for all options when poll has zero total votes', async () => {
      mockPrismaPoll.findUnique.mockResolvedValue(makePoll());
      mockPrismaPollVote.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaPollVote.create.mockResolvedValue({});
      // No votes yet
      mockPrismaPollVote.findMany.mockResolvedValue([]);

      await handlers['poll:vote']({ pollId: 'poll-1', option: 'Red' });

      // After findMany returns [] (before vote is counted), all percentages = 0
      const payload = mockNspEmit.mock.calls[0][1];
      payload.votes.forEach((v: any) => {
        expect(v.percentage).toBe(0);
      });
    });
  });
});
