/**
 * Tests for polls/actions.ts
 *
 * Covers server actions:
 * - createPoll: validates input, deduplicates options, creates DB record
 * - getPoll: returns poll with aggregated vote counts and percentages
 * - endPoll: creator-only, sets isActive: false
 */

// ---------------------------------------------------------------------------
// Prisma mock — must be declared before jest.mock() call
// ---------------------------------------------------------------------------

const mockPrismaPoll = {
  create: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
};

jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    poll: mockPrismaPoll,
  },
}));

// ---------------------------------------------------------------------------
// Auth mock
// ---------------------------------------------------------------------------

jest.mock('@/auth/auth', () => ({
  auth: jest.fn(),
}));

import { auth } from '../../auth/auth';
import { createPoll, getPoll, endPoll } from '../../polls/actions';

const mockAuth = auth as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDbPoll(overrides: Record<string, unknown> = {}) {
  return {
    id: 'poll-1',
    messageId: 'msg-1',
    question: 'Favourite colour?',
    options: JSON.stringify(['Red', 'Blue', 'Green']),
    isActive: true,
    endsAt: new Date(Date.now() + 7 * 24 * 3_600_000),
    createdAt: new Date('2026-01-01'),
    votes: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Polls Actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: authenticated as user-1
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
  });

  // -------------------------------------------------------------------------
  // createPoll
  // -------------------------------------------------------------------------

  describe('createPoll', () => {
    it('creates a poll and returns it with empty vote groups', async () => {
      const dbPoll = makeDbPoll();
      mockPrismaPoll.create.mockResolvedValue(dbPoll);

      const result = await createPoll('msg-1', 'Favourite colour?', ['Red', 'Blue', 'Green']);

      expect(mockPrismaPoll.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          messageId: 'msg-1',
          question: 'Favourite colour?',
          options: JSON.stringify(['Red', 'Blue', 'Green']),
          isActive: true,
        }),
      });

      expect(result.id).toBe('poll-1');
      expect(result.options).toEqual(['Red', 'Blue', 'Green']);
      expect(result.totalVotes).toBe(0);
      expect(result.votes).toHaveLength(3);
      // All vote groups start at zero
      result.votes.forEach((vg) => {
        expect(vg.count).toBe(0);
        expect(vg.userIds).toHaveLength(0);
        expect(vg.percentage).toBe(0);
      });
    });

    it('trims and deduplicates options before saving', async () => {
      const dbPoll = makeDbPoll({ options: JSON.stringify(['Red', 'Blue', 'red']) });
      mockPrismaPoll.create.mockResolvedValue(dbPoll);

      await createPoll('msg-1', 'Test?', ['Red', 'Blue', 'Red', '  red  ']);

      // Red is deduplicated (case-sensitive), " red " trimmed to "red"
      expect(mockPrismaPoll.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          options: JSON.stringify(['Red', 'Blue', 'red']),
        }),
      });
    });

    it('uses provided endsAt when given', async () => {
      const customEnd = new Date(Date.now() + 2 * 24 * 3_600_000);
      const dbPoll = makeDbPoll({ endsAt: customEnd });
      mockPrismaPoll.create.mockResolvedValue(dbPoll);

      await createPoll('msg-1', 'Test?', ['A', 'B'], false, customEnd);

      expect(mockPrismaPoll.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ endsAt: customEnd }),
      });
    });

    it('defaults endsAt to 7 days from now when not provided', async () => {
      const dbPoll = makeDbPoll();
      mockPrismaPoll.create.mockResolvedValue(dbPoll);

      const before = Date.now();
      await createPoll('msg-1', 'Test?', ['A', 'B']);
      const after = Date.now();

      const [callArgs] = mockPrismaPoll.create.mock.calls;
      const endsAt = callArgs[0].data.endsAt as Date;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      expect(endsAt.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 100);
      expect(endsAt.getTime()).toBeLessThanOrEqual(after + sevenDaysMs + 100);
    });

    it('throws when messageId is missing', async () => {
      await expect(createPoll('', 'Test?', ['A', 'B'])).rejects.toThrow(
        'messageId is required'
      );
      expect(mockPrismaPoll.create).not.toHaveBeenCalled();
    });

    it('throws when question is blank', async () => {
      await expect(createPoll('msg-1', '   ', ['A', 'B'])).rejects.toThrow(
        'Question is required'
      );
      expect(mockPrismaPoll.create).not.toHaveBeenCalled();
    });

    it('throws when fewer than 2 options provided', async () => {
      await expect(createPoll('msg-1', 'Test?', ['Only one'])).rejects.toThrow(
        'At least 2 options required'
      );
    });

    it('throws when more than 10 options provided', async () => {
      const tooMany = Array.from({ length: 11 }, (_, i) => `Option ${i + 1}`);
      await expect(createPoll('msg-1', 'Test?', tooMany)).rejects.toThrow(
        'Maximum 10 options allowed'
      );
    });

    it('throws when options become fewer than 2 after deduplication', async () => {
      // ["A", "A", "a"] trims to ["A", "a"] (2 unique), actually this should pass...
      // Let's use ["A", "A"] which dedupes to ["A"] — fewer than 2
      await expect(createPoll('msg-1', 'Test?', ['A', 'A'])).rejects.toThrow(
        'Options must be unique and non-empty'
      );
    });

    it('throws Unauthorized when not logged in', async () => {
      mockAuth.mockResolvedValue(null);

      await expect(createPoll('msg-1', 'Test?', ['A', 'B'])).rejects.toThrow('Unauthorized');
      expect(mockPrismaPoll.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getPoll
  // -------------------------------------------------------------------------

  describe('getPoll', () => {
    it('returns null when poll not found', async () => {
      mockPrismaPoll.findUnique.mockResolvedValue(null);

      const result = await getPoll('poll-99');

      expect(result).toBeNull();
    });

    it('returns poll with correctly aggregated vote counts', async () => {
      const dbPoll = makeDbPoll({
        votes: [
          { option: 'Red', userId: 'user-1' },
          { option: 'Red', userId: 'user-2' },
          { option: 'Blue', userId: 'user-3' },
        ],
      });
      mockPrismaPoll.findUnique.mockResolvedValue(dbPoll);

      const result = await getPoll('poll-1');

      expect(result).not.toBeNull();
      expect(result!.totalVotes).toBe(3);

      const redGroup = result!.votes.find((v) => v.option === 'Red');
      expect(redGroup!.count).toBe(2);
      expect(redGroup!.userIds).toContain('user-1');
      expect(redGroup!.userIds).toContain('user-2');
      // Math.round(2/3 * 100) = 67
      expect(redGroup!.percentage).toBe(67);

      const blueGroup = result!.votes.find((v) => v.option === 'Blue');
      expect(blueGroup!.count).toBe(1);
      expect(blueGroup!.percentage).toBe(33);

      const greenGroup = result!.votes.find((v) => v.option === 'Green');
      expect(greenGroup!.count).toBe(0);
      expect(greenGroup!.percentage).toBe(0);
    });

    it('returns 0 percentage for all options when no votes cast', async () => {
      mockPrismaPoll.findUnique.mockResolvedValue(makeDbPoll({ votes: [] }));

      const result = await getPoll('poll-1');

      expect(result!.totalVotes).toBe(0);
      expect(result!.votes.every((v) => v.percentage === 0)).toBe(true);
      expect(result!.votes.every((v) => v.count === 0)).toBe(true);
    });

    it('returns 100% for sole winning option', async () => {
      const dbPoll = makeDbPoll({
        votes: [
          { option: 'Red', userId: 'user-1' },
          { option: 'Red', userId: 'user-2' },
        ],
      });
      mockPrismaPoll.findUnique.mockResolvedValue(dbPoll);

      const result = await getPoll('poll-1');

      const redGroup = result!.votes.find((v) => v.option === 'Red');
      expect(redGroup!.percentage).toBe(100);

      const otherGroups = result!.votes.filter((v) => v.option !== 'Red');
      otherGroups.forEach((g) => expect(g.percentage).toBe(0));
    });

    it('preserves the option order from the DB options array', async () => {
      mockPrismaPoll.findUnique.mockResolvedValue(makeDbPoll({ votes: [] }));

      const result = await getPoll('poll-1');

      expect(result!.votes.map((v) => v.option)).toEqual(['Red', 'Blue', 'Green']);
    });

    it('throws Unauthorized when not logged in', async () => {
      mockAuth.mockResolvedValue(null);

      await expect(getPoll('poll-1')).rejects.toThrow('Unauthorized');
    });
  });

  // -------------------------------------------------------------------------
  // endPoll
  // -------------------------------------------------------------------------

  describe('endPoll', () => {
    it('sets isActive to false when called by the creator', async () => {
      mockPrismaPoll.findUnique.mockResolvedValue(
        makeDbPoll({ message: { userId: 'user-1' } })
      );
      mockPrismaPoll.update.mockResolvedValue({});

      await endPoll('poll-1');

      expect(mockPrismaPoll.update).toHaveBeenCalledWith({
        where: { id: 'poll-1' },
        data: { isActive: false },
      });
    });

    it('throws when poll not found', async () => {
      mockPrismaPoll.findUnique.mockResolvedValue(null);

      await expect(endPoll('poll-99')).rejects.toThrow('Poll not found');
      expect(mockPrismaPoll.update).not.toHaveBeenCalled();
    });

    it('throws when caller is not the poll creator', async () => {
      mockPrismaPoll.findUnique.mockResolvedValue(
        makeDbPoll({ message: { userId: 'creator-2' } })
      );

      await expect(endPoll('poll-1')).rejects.toThrow(
        'Only the poll creator can end the poll'
      );
      expect(mockPrismaPoll.update).not.toHaveBeenCalled();
    });

    it('throws Unauthorized when not logged in', async () => {
      mockAuth.mockResolvedValue(null);

      await expect(endPoll('poll-1')).rejects.toThrow('Unauthorized');
      expect(mockPrismaPoll.findUnique).not.toHaveBeenCalled();
    });
  });
});
