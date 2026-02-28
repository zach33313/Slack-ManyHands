/**
 * Tests for server/cron/scheduled-messages.ts
 *
 * Verifies the scheduled-message delivery cron job:
 * - Registers a node-cron job at startup
 * - Each tick: queries ScheduledMessage where sentAt IS NULL, not cancelled, scheduledFor <= now
 * - For each due message: creates Message record, updates sentAt, emits message:new
 * - Sends notifications (mention, DM, unread:update) after delivery
 * - Skips cancelled messages (they won't appear in the query)
 * - Isolates per-message errors (one failure doesn't block others)
 * - Handles missing Socket.IO gracefully (IO not yet initialized)
 */

// ---------------------------------------------------------------------------
// node-cron mock — capture the cron callback so we can trigger it manually
// ---------------------------------------------------------------------------

let capturedCronCallback: (() => Promise<void>) | null = null;

jest.mock('node-cron', () => ({
  schedule: jest.fn((pattern: string, callback: () => Promise<void>) => {
    capturedCronCallback = callback;
    return { stop: jest.fn() }; // node-cron returns a task object
  }),
}));

// ---------------------------------------------------------------------------
// Socket-emitter mock
// ---------------------------------------------------------------------------

const mockIOEmit = jest.fn();
const mockIOTo = jest.fn().mockReturnValue({ emit: mockIOEmit });
const mockGetIO = jest.fn();

jest.mock('../../server/socket-emitter', () => ({
  getIO: mockGetIO,
}));

// ---------------------------------------------------------------------------
// Prisma mocks
// ---------------------------------------------------------------------------

const mockPrismaScheduledMessage = {
  findMany: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
};

const mockPrismaMessage = {
  create: jest.fn(),
  findUnique: jest.fn(),
  count: jest.fn(),
};

const mockPrismaChannel = {
  findUnique: jest.fn(),
};

const mockPrismaChannelMember = {
  findMany: jest.fn(),
};

const mockPrismaNotification = {
  create: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    scheduledMessage: mockPrismaScheduledMessage,
    message: mockPrismaMessage,
    channel: mockPrismaChannel,
    channelMember: mockPrismaChannelMember,
    notification: mockPrismaNotification,
  })),
}));

jest.mock('../../shared/lib/constants', () => ({
  channelRoom: (id: string) => `channel:${id}`,
  userRoom: (id: string) => `user:${id}`,
  workspaceRoom: (id: string) => `workspace:${id}`,
}));

import { startScheduledMessagesCron } from '../../server/cron/scheduled-messages';
import nodeCron from 'node-cron';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeScheduledMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sm-1',
    channelId: 'ch-1',
    userId: 'user-1',
    contentJson: JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello!' }] }],
    }),
    contentPlain: 'Hello!',
    ...overrides,
  };
}

function makeDbMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-new-1',
    channelId: 'ch-1',
    userId: 'user-1',
    contentJson: JSON.stringify({ type: 'doc', content: [] }),
    contentPlain: 'Hello!',
    parentId: null,
    replyCount: 0,
    isEdited: false,
    isDeleted: false,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T12:00:00Z'),
    author: { id: 'user-1', name: 'Test User', image: null },
    files: [],
    reactions: [],
    ...overrides,
  };
}

function makeNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notif-1',
    userId: 'user-2',
    type: 'DM',
    payload: JSON.stringify({ messageId: 'msg-new-1', channelId: 'ch-1', workspaceId: 'ws-1', actorId: 'user-1', preview: 'Hello!' }),
    readAt: null,
    createdAt: new Date('2026-01-01T12:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Scheduled Messages Cron', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedCronCallback = null;

    // Default: getIO returns a mock IO server
    mockGetIO.mockReturnValue({ to: mockIOTo });
    mockIOTo.mockReturnValue({ emit: mockIOEmit });

    // Default notification-related mocks: null channel → notification block exits early
    // This ensures existing delivery tests aren't affected by the new notification code
    mockPrismaChannel.findUnique.mockResolvedValue(null);
    mockPrismaChannelMember.findMany.mockResolvedValue([]);
    mockPrismaNotification.create.mockResolvedValue(makeNotification());
    mockPrismaMessage.count.mockResolvedValue(0);
  });

  // -------------------------------------------------------------------------
  // Cron job registration
  // -------------------------------------------------------------------------

  describe('startScheduledMessagesCron', () => {
    it('registers a cron job using node-cron', () => {
      startScheduledMessagesCron();

      expect(nodeCron.schedule).toHaveBeenCalledWith(
        '* * * * *',
        expect.any(Function)
      );
    });

    it('captures the cron callback for manual testing', () => {
      startScheduledMessagesCron();

      expect(capturedCronCallback).not.toBeNull();
      expect(typeof capturedCronCallback).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // Cron tick: happy path
  // -------------------------------------------------------------------------

  describe('cron tick', () => {
    beforeEach(() => {
      startScheduledMessagesCron();
    });

    it('does nothing when there are no due messages', async () => {
      mockPrismaScheduledMessage.findMany.mockResolvedValue([]);

      await capturedCronCallback!();

      expect(mockPrismaMessage.create).not.toHaveBeenCalled();
      expect(mockIOEmit).not.toHaveBeenCalled();
    });

    it('queries for unsent, non-cancelled messages due by now', async () => {
      mockPrismaScheduledMessage.findMany.mockResolvedValue([]);

      const before = new Date();
      await capturedCronCallback!();
      const after = new Date();

      expect(mockPrismaScheduledMessage.findMany).toHaveBeenCalledWith({
        where: {
          sentAt: null,
          isCancelled: false,
          scheduledFor: { lte: expect.any(Date) },
        },
        select: {
          id: true,
          channelId: true,
          userId: true,
          contentJson: true,
          contentPlain: true,
        },
      });

      // The lte timestamp should be approximately now
      const queryArg = mockPrismaScheduledMessage.findMany.mock.calls[0][0];
      const scheduledForLte = queryArg.where.scheduledFor.lte as Date;
      expect(scheduledForLte.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(scheduledForLte.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('creates a real Message record from the scheduled message content', async () => {
      const sm = makeScheduledMessage();
      mockPrismaScheduledMessage.findMany.mockResolvedValue([sm]);
      mockPrismaScheduledMessage.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new-1' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      await capturedCronCallback!();

      expect(mockPrismaMessage.create).toHaveBeenCalledWith({
        data: {
          channelId: 'ch-1',
          userId: 'user-1',
          contentJson: sm.contentJson,
          contentPlain: 'Hello!',
        },
      });
    });

    it('marks the ScheduledMessage as sent (updates sentAt)', async () => {
      const sm = makeScheduledMessage();
      mockPrismaScheduledMessage.findMany.mockResolvedValue([sm]);
      mockPrismaScheduledMessage.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new-1' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      const before = new Date();
      await capturedCronCallback!();
      const after = new Date();

      // Atomic per-message claim: updateMany with sentAt=null guard
      expect(mockPrismaScheduledMessage.updateMany).toHaveBeenCalledWith({
        where: { id: 'sm-1', sentAt: null },
        data: { sentAt: expect.any(Date) },
      });

      const sentAt = mockPrismaScheduledMessage.updateMany.mock.calls[0][0].data.sentAt as Date;
      expect(sentAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(sentAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('emits message:new to the channel room after creating the message', async () => {
      const sm = makeScheduledMessage();
      mockPrismaScheduledMessage.findMany.mockResolvedValue([sm]);
      mockPrismaScheduledMessage.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new-1' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage({ id: 'msg-new-1' }));

      await capturedCronCallback!();

      expect(mockIOTo).toHaveBeenCalledWith('channel:ch-1');
      expect(mockIOEmit).toHaveBeenCalledWith(
        'message:new',
        expect.objectContaining({
          id: 'msg-new-1',
          channelId: 'ch-1',
          contentPlain: 'Hello!',
        })
      );
    });

    it('emits message:new with hydrated author and files info', async () => {
      const sm = makeScheduledMessage();
      mockPrismaScheduledMessage.findMany.mockResolvedValue([sm]);
      mockPrismaScheduledMessage.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new-1' });
      mockPrismaMessage.findUnique.mockResolvedValue(
        makeDbMessage({
          author: { id: 'user-1', name: 'Alice', image: 'https://example.com/alice.jpg' },
          files: [{ id: 'f-1', name: 'doc.pdf', url: 'https://example.com/doc.pdf', size: 1024, mimeType: 'application/pdf', width: null, height: null }],
        })
      );

      await capturedCronCallback!();

      const emittedMsg = mockIOEmit.mock.calls[0][1];
      expect(emittedMsg.author).toMatchObject({ id: 'user-1', name: 'Alice' });
      expect(emittedMsg.files).toHaveLength(1);
    });

    it('processes multiple due scheduled messages in one tick', async () => {
      const sm1 = makeScheduledMessage({ id: 'sm-1', channelId: 'ch-1' });
      const sm2 = makeScheduledMessage({ id: 'sm-2', channelId: 'ch-2', contentPlain: 'World!' });
      mockPrismaScheduledMessage.findMany.mockResolvedValue([sm1, sm2]);
      mockPrismaScheduledMessage.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaMessage.create
        .mockResolvedValueOnce({ id: 'msg-1' })
        .mockResolvedValueOnce({ id: 'msg-2' });
      mockPrismaMessage.findUnique
        .mockResolvedValueOnce(makeDbMessage({ id: 'msg-1', channelId: 'ch-1' }))
        .mockResolvedValueOnce(makeDbMessage({ id: 'msg-2', channelId: 'ch-2', contentPlain: 'World!' }));

      await capturedCronCallback!();

      expect(mockPrismaMessage.create).toHaveBeenCalledTimes(2);
      expect(mockPrismaScheduledMessage.updateMany).toHaveBeenCalledTimes(2);
      // message:new emitted once per message (no notification emits since channel.findUnique → null)
      expect(mockIOEmit).toHaveBeenCalledTimes(2);
    });

    it('continues processing other messages when one fails', async () => {
      const sm1 = makeScheduledMessage({ id: 'sm-1' });
      const sm2 = makeScheduledMessage({ id: 'sm-2', channelId: 'ch-2' });
      mockPrismaScheduledMessage.findMany.mockResolvedValue([sm1, sm2]);

      // Both messages get claimed atomically before create is attempted
      mockPrismaScheduledMessage.updateMany.mockResolvedValue({ count: 1 });

      // First message fails to create
      mockPrismaMessage.create
        .mockRejectedValueOnce(new Error('DB write failed'))
        .mockResolvedValueOnce({ id: 'msg-2' });
      mockPrismaMessage.findUnique
        .mockResolvedValueOnce(makeDbMessage({ id: 'msg-2', channelId: 'ch-2' }));

      // Should not throw
      await expect(capturedCronCallback!()).resolves.toBeUndefined();

      // Both messages were claimed (updateMany called once per message)
      expect(mockPrismaScheduledMessage.updateMany).toHaveBeenCalledTimes(2);
      // Second message should still be processed despite first failing
      expect(mockPrismaMessage.create).toHaveBeenCalledTimes(2);
    });

    it('handles Socket.IO unavailability gracefully (getIO throws)', async () => {
      const sm = makeScheduledMessage();
      mockPrismaScheduledMessage.findMany.mockResolvedValue([sm]);
      mockPrismaScheduledMessage.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new-1' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());
      mockGetIO.mockImplementation(() => {
        throw new Error('Socket.IO not initialized');
      });

      // Should not throw — IO error is caught gracefully
      await expect(capturedCronCallback!()).resolves.toBeUndefined();

      // The message was created and the claim was made even if emit failed
      expect(mockPrismaMessage.create).toHaveBeenCalledTimes(1);
      expect(mockPrismaScheduledMessage.updateMany).toHaveBeenCalledTimes(1);
    });

    it('does not process messages with isCancelled=true (query filters them out)', async () => {
      // The query filters by isCancelled: false, so cancelled messages
      // would never appear in the result. This test verifies the correct
      // query parameters are used.
      mockPrismaScheduledMessage.findMany.mockResolvedValue([]); // no results

      await capturedCronCallback!();

      const query = mockPrismaScheduledMessage.findMany.mock.calls[0][0];
      expect(query.where.isCancelled).toBe(false);
      expect(query.where.sentAt).toBeNull();
    });

    it('handles a DB query failure gracefully', async () => {
      mockPrismaScheduledMessage.findMany.mockRejectedValue(new Error('DB down'));

      // Should not throw
      await expect(capturedCronCallback!()).resolves.toBeUndefined();

      // No messages should be created
      expect(mockPrismaMessage.create).not.toHaveBeenCalled();
    });

    it('includes reactions (empty array) in emitted message', async () => {
      const sm = makeScheduledMessage();
      mockPrismaScheduledMessage.findMany.mockResolvedValue([sm]);
      mockPrismaScheduledMessage.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new-1' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage({ reactions: [] }));

      await capturedCronCallback!();

      const emittedMsg = mockIOEmit.mock.calls[0][1];
      expect(emittedMsg.reactions).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Cron tick: notification logic
  // -------------------------------------------------------------------------

  describe('notifications', () => {
    beforeEach(() => {
      startScheduledMessagesCron();
    });

    it('creates DM notification and emits notification:new for DM channel members', async () => {
      const sm = makeScheduledMessage();
      mockPrismaScheduledMessage.findMany.mockResolvedValue([sm]);
      mockPrismaScheduledMessage.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new-1' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      // Set up a DM channel
      mockPrismaChannel.findUnique.mockResolvedValue({ workspaceId: 'ws-1', type: 'DM' });
      // Two members: sender (user-1) and recipient (user-2)
      mockPrismaChannelMember.findMany.mockResolvedValue([
        { userId: 'user-1', lastReadAt: null },
        { userId: 'user-2', lastReadAt: null },
      ]);
      mockPrismaNotification.create.mockResolvedValue(
        makeNotification({ userId: 'user-2', type: 'DM' })
      );

      await capturedCronCallback!();

      // Should create DM notification for user-2 (not user-1, the sender)
      expect(mockPrismaNotification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-2',
            type: 'DM',
          }),
        })
      );

      // Should emit notification:new to user-2's room
      expect(mockIOTo).toHaveBeenCalledWith('user:user-2');
      expect(mockIOEmit).toHaveBeenCalledWith(
        'notification:new',
        expect.objectContaining({ userId: 'user-2', type: 'DM' })
      );
    });

    it('creates DM notification for GROUP_DM channel members', async () => {
      const sm = makeScheduledMessage();
      mockPrismaScheduledMessage.findMany.mockResolvedValue([sm]);
      mockPrismaScheduledMessage.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new-1' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      mockPrismaChannel.findUnique.mockResolvedValue({ workspaceId: 'ws-1', type: 'GROUP_DM' });
      mockPrismaChannelMember.findMany.mockResolvedValue([
        { userId: 'user-1', lastReadAt: null },
        { userId: 'user-2', lastReadAt: null },
        { userId: 'user-3', lastReadAt: null },
      ]);
      mockPrismaNotification.create.mockResolvedValue(makeNotification());

      await capturedCronCallback!();

      // Notifications for user-2 and user-3 (not user-1, the sender)
      const notifCalls = mockPrismaNotification.create.mock.calls;
      const notifiedUsers = notifCalls.map((call: any[]) => call[0].data.userId);
      expect(notifiedUsers).toContain('user-2');
      expect(notifiedUsers).toContain('user-3');
      expect(notifiedUsers).not.toContain('user-1');
    });

    it('does not send DM notification for regular (non-DM) channels', async () => {
      const sm = makeScheduledMessage();
      mockPrismaScheduledMessage.findMany.mockResolvedValue([sm]);
      mockPrismaScheduledMessage.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new-1' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      mockPrismaChannel.findUnique.mockResolvedValue({ workspaceId: 'ws-1', type: 'PUBLIC' });
      mockPrismaChannelMember.findMany.mockResolvedValue([
        { userId: 'user-1', lastReadAt: null },
        { userId: 'user-2', lastReadAt: null },
      ]);

      await capturedCronCallback!();

      // No DM notification for PUBLIC channels
      expect(mockPrismaNotification.create).not.toHaveBeenCalled();
    });

    it('emits unread:update to all other channel members', async () => {
      const sm = makeScheduledMessage();
      mockPrismaScheduledMessage.findMany.mockResolvedValue([sm]);
      mockPrismaScheduledMessage.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new-1' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      mockPrismaChannel.findUnique.mockResolvedValue({ workspaceId: 'ws-1', type: 'PUBLIC' });
      mockPrismaChannelMember.findMany.mockResolvedValue([
        { userId: 'user-1', lastReadAt: null },
        { userId: 'user-2', lastReadAt: null },
      ]);
      mockPrismaMessage.count.mockResolvedValue(3);

      await capturedCronCallback!();

      // unread:update emitted to user-2 (not user-1, the sender)
      expect(mockIOTo).toHaveBeenCalledWith('user:user-2');
      expect(mockIOEmit).toHaveBeenCalledWith(
        'unread:update',
        expect.objectContaining({
          channelId: 'ch-1',
          unreadCount: 3,
          hasMention: false,
        })
      );
    });

    it('notification failure does not prevent message:new from being emitted', async () => {
      const sm = makeScheduledMessage();
      mockPrismaScheduledMessage.findMany.mockResolvedValue([sm]);
      mockPrismaScheduledMessage.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new-1' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage());

      // Make channel lookup fail
      mockPrismaChannel.findUnique.mockRejectedValue(new Error('DB error in notifications'));

      // Should not throw
      await expect(capturedCronCallback!()).resolves.toBeUndefined();

      // message:new should still have been emitted
      expect(mockIOEmit).toHaveBeenCalledWith(
        'message:new',
        expect.objectContaining({ id: 'msg-new-1' })
      );
    });
  });
});
