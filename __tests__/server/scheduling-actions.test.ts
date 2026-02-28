/**
 * Tests for scheduling/actions.ts
 *
 * Covers server actions:
 * - createScheduledMessage: validates input, checks channel membership, creates DB record
 * - cancelScheduledMessage: ownership check, state validation (sent/cancelled)
 * - getScheduledMessages: filters by userId, channel, sent/cancelled state
 * - rescheduleMessage: validates future date, ownership, and state
 */

// ---------------------------------------------------------------------------
// Prisma mock — must be declared before jest.mock() call
// ---------------------------------------------------------------------------

const mockPrismaScheduledMessage = {
  create: jest.fn(),
  findUnique: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
};

const mockPrismaChannelMember = {
  findUnique: jest.fn(),
};

jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    scheduledMessage: mockPrismaScheduledMessage,
    channelMember: mockPrismaChannelMember,
  },
}));

// ---------------------------------------------------------------------------
// Auth mock
// ---------------------------------------------------------------------------

jest.mock('@/auth/auth', () => ({
  auth: jest.fn(),
}));

import { auth } from '../../auth/auth';
import {
  createScheduledMessage,
  cancelScheduledMessage,
  getScheduledMessages,
  rescheduleMessage,
} from '../../scheduling/actions';

const mockAuth = auth as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A valid future scheduled message DB record */
function makeDbRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sched-1',
    channelId: 'ch-1',
    userId: 'user-1',
    contentJson: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }] }),
    contentPlain: 'Hello world',
    scheduledFor: new Date(Date.now() + 3_600_000), // 1 hour from now
    sentAt: null,
    isCancelled: false,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeContent() {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
  } as any;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Scheduling Actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: authenticated as user-1
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
  });

  // -------------------------------------------------------------------------
  // createScheduledMessage
  // -------------------------------------------------------------------------

  describe('createScheduledMessage', () => {
    it('creates a scheduled message and returns it', async () => {
      const futureDate = new Date(Date.now() + 3_600_000);
      const content = makeContent();
      const record = makeDbRecord({ scheduledFor: futureDate });

      mockPrismaChannelMember.findUnique.mockResolvedValue({ channelId: 'ch-1', userId: 'user-1' });
      mockPrismaScheduledMessage.create.mockResolvedValue(record);

      const result = await createScheduledMessage('ch-1', content, 'Hello world', futureDate);

      expect(mockPrismaScheduledMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channelId: 'ch-1',
          userId: 'user-1',
          contentJson: JSON.stringify(content),
          contentPlain: 'Hello world',
          scheduledFor: futureDate,
        }),
      });

      expect(result.id).toBe('sched-1');
      expect(result.channelId).toBe('ch-1');
      expect(result.userId).toBe('user-1');
      expect(result.isCancelled).toBe(false);
      expect(result.sentAt).toBeNull();
    });

    it('throws Unauthorized when not logged in', async () => {
      mockAuth.mockResolvedValue(null);
      const futureDate = new Date(Date.now() + 3_600_000);

      await expect(
        createScheduledMessage('ch-1', makeContent(), '', futureDate)
      ).rejects.toThrow('Unauthorized');

      expect(mockPrismaScheduledMessage.create).not.toHaveBeenCalled();
    });

    it('throws when channelId is missing', async () => {
      await expect(
        createScheduledMessage('', makeContent(), '', new Date(Date.now() + 3_600_000))
      ).rejects.toThrow('channelId is required');
    });

    it('throws when scheduledFor is in the past', async () => {
      const pastDate = new Date(Date.now() - 1000);

      await expect(
        createScheduledMessage('ch-1', makeContent(), '', pastDate)
      ).rejects.toThrow('scheduledFor must be in the future');

      expect(mockPrismaChannelMember.findUnique).not.toHaveBeenCalled();
    });

    it('throws when user is not a channel member', async () => {
      mockPrismaChannelMember.findUnique.mockResolvedValue(null);
      const futureDate = new Date(Date.now() + 3_600_000);

      await expect(
        createScheduledMessage('ch-1', makeContent(), '', futureDate)
      ).rejects.toThrow('Not a member of this channel');

      expect(mockPrismaScheduledMessage.create).not.toHaveBeenCalled();
    });

    it('extracts plain text from contentJson when contentPlain is empty', async () => {
      const futureDate = new Date(Date.now() + 3_600_000);
      const content = makeContent();
      const record = makeDbRecord({ scheduledFor: futureDate });

      mockPrismaChannelMember.findUnique.mockResolvedValue({ channelId: 'ch-1', userId: 'user-1' });
      mockPrismaScheduledMessage.create.mockResolvedValue(record);

      await createScheduledMessage('ch-1', content, '', futureDate);

      expect(mockPrismaScheduledMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          contentPlain: 'Hello world',
        }),
      });
    });

    it('parses the returned record content from JSON', async () => {
      const futureDate = new Date(Date.now() + 3_600_000);
      const content = makeContent();
      const record = makeDbRecord({ scheduledFor: futureDate });

      mockPrismaChannelMember.findUnique.mockResolvedValue({ channelId: 'ch-1', userId: 'user-1' });
      mockPrismaScheduledMessage.create.mockResolvedValue(record);

      const result = await createScheduledMessage('ch-1', content, 'Hello world', futureDate);

      expect(result.content).toEqual(content);
    });
  });

  // -------------------------------------------------------------------------
  // cancelScheduledMessage
  // -------------------------------------------------------------------------

  describe('cancelScheduledMessage', () => {
    it('cancels a pending scheduled message', async () => {
      mockPrismaScheduledMessage.findUnique.mockResolvedValue(makeDbRecord());
      mockPrismaScheduledMessage.update.mockResolvedValue({});

      await cancelScheduledMessage('sched-1');

      expect(mockPrismaScheduledMessage.update).toHaveBeenCalledWith({
        where: { id: 'sched-1' },
        data: { isCancelled: true },
      });
    });

    it('throws Unauthorized when not logged in', async () => {
      mockAuth.mockResolvedValue(null);

      await expect(cancelScheduledMessage('sched-1')).rejects.toThrow('Unauthorized');
      expect(mockPrismaScheduledMessage.findUnique).not.toHaveBeenCalled();
    });

    it('throws when message not found', async () => {
      mockPrismaScheduledMessage.findUnique.mockResolvedValue(null);

      await expect(cancelScheduledMessage('sched-1')).rejects.toThrow(
        'Scheduled message not found'
      );
      expect(mockPrismaScheduledMessage.update).not.toHaveBeenCalled();
    });

    it('throws when user is not the owner', async () => {
      mockPrismaScheduledMessage.findUnique.mockResolvedValue(
        makeDbRecord({ userId: 'other-user' })
      );

      await expect(cancelScheduledMessage('sched-1')).rejects.toThrow(
        'Not authorized to cancel this message'
      );
      expect(mockPrismaScheduledMessage.update).not.toHaveBeenCalled();
    });

    it('throws when message has already been sent', async () => {
      mockPrismaScheduledMessage.findUnique.mockResolvedValue(
        makeDbRecord({ sentAt: new Date('2026-01-15') })
      );

      await expect(cancelScheduledMessage('sched-1')).rejects.toThrow(
        'Message has already been sent'
      );
      expect(mockPrismaScheduledMessage.update).not.toHaveBeenCalled();
    });

    it('throws when message is already cancelled', async () => {
      mockPrismaScheduledMessage.findUnique.mockResolvedValue(
        makeDbRecord({ isCancelled: true })
      );

      await expect(cancelScheduledMessage('sched-1')).rejects.toThrow(
        'Message is already cancelled'
      );
      expect(mockPrismaScheduledMessage.update).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getScheduledMessages
  // -------------------------------------------------------------------------

  describe('getScheduledMessages', () => {
    it('returns pending scheduled messages for the current user', async () => {
      const records = [
        {
          ...makeDbRecord(),
          channel: { id: 'ch-1', name: 'general' },
        },
      ];
      mockPrismaScheduledMessage.findMany.mockResolvedValue(records);

      const result = await getScheduledMessages();

      expect(mockPrismaScheduledMessage.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: 'user-1',
          isCancelled: false,
          sentAt: null,
        }),
        include: { channel: { select: { id: true, name: true } } },
        orderBy: { scheduledFor: 'asc' },
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.channel.name).toBe('general');
    });

    it('filters by channelId when provided', async () => {
      mockPrismaScheduledMessage.findMany.mockResolvedValue([]);

      await getScheduledMessages('ch-2');

      expect(mockPrismaScheduledMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ channelId: 'ch-2' }),
        })
      );
    });

    it('does not add channelId filter when not provided', async () => {
      mockPrismaScheduledMessage.findMany.mockResolvedValue([]);

      await getScheduledMessages();

      const [call] = mockPrismaScheduledMessage.findMany.mock.calls;
      expect(call[0].where).not.toHaveProperty('channelId');
    });

    it('returns empty array when no messages', async () => {
      mockPrismaScheduledMessage.findMany.mockResolvedValue([]);

      const result = await getScheduledMessages();

      expect(result).toHaveLength(0);
      expect(result).toEqual([]);
    });

    it('parses contentJson of each record', async () => {
      const content = makeContent();
      const records = [
        {
          ...makeDbRecord({ contentJson: JSON.stringify(content) }),
          channel: { id: 'ch-1', name: 'general' },
        },
      ];
      mockPrismaScheduledMessage.findMany.mockResolvedValue(records);

      const result = await getScheduledMessages();

      expect(result[0]!.content).toEqual(content);
    });

    it('throws Unauthorized when not logged in', async () => {
      mockAuth.mockResolvedValue(null);

      await expect(getScheduledMessages()).rejects.toThrow('Unauthorized');
    });
  });

  // -------------------------------------------------------------------------
  // rescheduleMessage
  // -------------------------------------------------------------------------

  describe('rescheduleMessage', () => {
    it('updates the scheduledFor date and returns the updated record', async () => {
      const newDate = new Date(Date.now() + 7_200_000); // 2 hours from now
      const updatedRecord = makeDbRecord({ scheduledFor: newDate });

      mockPrismaScheduledMessage.findUnique.mockResolvedValue(makeDbRecord());
      mockPrismaScheduledMessage.update.mockResolvedValue(updatedRecord);

      const result = await rescheduleMessage('sched-1', newDate);

      expect(mockPrismaScheduledMessage.update).toHaveBeenCalledWith({
        where: { id: 'sched-1' },
        data: { scheduledFor: newDate },
      });

      expect(result.scheduledFor).toEqual(newDate);
    });

    it('throws when new date is in the past', async () => {
      const pastDate = new Date(Date.now() - 1000);

      await expect(rescheduleMessage('sched-1', pastDate)).rejects.toThrow(
        'newScheduledFor must be in the future'
      );

      expect(mockPrismaScheduledMessage.findUnique).not.toHaveBeenCalled();
    });

    it('throws when message not found', async () => {
      mockPrismaScheduledMessage.findUnique.mockResolvedValue(null);
      const futureDate = new Date(Date.now() + 3_600_000);

      await expect(rescheduleMessage('sched-1', futureDate)).rejects.toThrow(
        'Scheduled message not found'
      );
      expect(mockPrismaScheduledMessage.update).not.toHaveBeenCalled();
    });

    it('throws when user is not the owner', async () => {
      mockPrismaScheduledMessage.findUnique.mockResolvedValue(
        makeDbRecord({ userId: 'other-user' })
      );
      const futureDate = new Date(Date.now() + 3_600_000);

      await expect(rescheduleMessage('sched-1', futureDate)).rejects.toThrow(
        'Not authorized to reschedule this message'
      );
      expect(mockPrismaScheduledMessage.update).not.toHaveBeenCalled();
    });

    it('throws when message has already been sent', async () => {
      mockPrismaScheduledMessage.findUnique.mockResolvedValue(
        makeDbRecord({ sentAt: new Date('2026-01-15') })
      );
      const futureDate = new Date(Date.now() + 3_600_000);

      await expect(rescheduleMessage('sched-1', futureDate)).rejects.toThrow(
        'Message has already been sent'
      );
      expect(mockPrismaScheduledMessage.update).not.toHaveBeenCalled();
    });

    it('throws when message is cancelled', async () => {
      mockPrismaScheduledMessage.findUnique.mockResolvedValue(
        makeDbRecord({ isCancelled: true })
      );
      const futureDate = new Date(Date.now() + 3_600_000);

      await expect(rescheduleMessage('sched-1', futureDate)).rejects.toThrow(
        'Message is cancelled'
      );
      expect(mockPrismaScheduledMessage.update).not.toHaveBeenCalled();
    });

    it('throws Unauthorized when not logged in', async () => {
      mockAuth.mockResolvedValue(null);
      const futureDate = new Date(Date.now() + 3_600_000);

      await expect(rescheduleMessage('sched-1', futureDate)).rejects.toThrow('Unauthorized');
    });
  });
});
