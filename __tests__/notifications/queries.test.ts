/**
 * Tests for notifications/queries.ts
 *
 * Tests the database query functions:
 * - getNotifications: paginated list with sender/channel hydration
 * - getUnreadCount: count of unread notifications
 * - markNotificationRead: ownership-verified single mark
 * - markAllRead: bulk mark all as read
 */

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the module under test
// ---------------------------------------------------------------------------

const mockNotificationFindMany = jest.fn();
const mockNotificationFindUnique = jest.fn();
const mockNotificationCount = jest.fn();
const mockNotificationUpdate = jest.fn();
const mockNotificationUpdateMany = jest.fn();
const mockChannelFindMany = jest.fn();

jest.mock('../../shared/lib/prisma', () => ({
  prisma: {
    notification: {
      findMany: (...args: unknown[]) => mockNotificationFindMany(...args),
      findUnique: (...args: unknown[]) => mockNotificationFindUnique(...args),
      count: (...args: unknown[]) => mockNotificationCount(...args),
      update: (...args: unknown[]) => mockNotificationUpdate(...args),
      updateMany: (...args: unknown[]) => mockNotificationUpdateMany(...args),
    },
    channel: {
      findMany: (...args: unknown[]) => mockChannelFindMany(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllRead,
} from '../../notifications/queries';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockNotificationRow(overrides?: Record<string, unknown>) {
  return {
    id: 'notif-1',
    userId: 'user-1',
    actorId: 'actor-1',
    type: 'MENTION',
    payload: JSON.stringify({
      messageId: 'msg-1',
      channelId: 'ch-1',
      actorId: 'actor-1',
      preview: 'Hello world',
    }),
    readAt: null,
    createdAt: new Date('2025-01-15T10:00:00Z'),
    actor: { id: 'actor-1', name: 'Alice', image: '/avatar.jpg' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChannelFindMany.mockResolvedValue([]);
  });

  it('returns paginated notifications with sender and channel info', async () => {
    const row = createMockNotificationRow();
    mockNotificationFindMany.mockResolvedValue([row]);
    mockChannelFindMany.mockResolvedValue([{ id: 'ch-1', name: 'general' }]);

    const result = await getNotifications('user-1');

    expect(result.notifications).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(result.notifications[0]).toEqual(
      expect.objectContaining({
        id: 'notif-1',
        type: 'MENTION',
        senderName: 'Alice',
        senderImage: '/avatar.jpg',
        channelName: 'general',
        preview: 'Hello world',
        isRead: false,
      })
    );
  });

  it('sets hasMore to true when more items exist than limit', async () => {
    // Return limit+1 items to indicate more pages exist
    const rows = Array.from({ length: 21 }, (_, i) =>
      createMockNotificationRow({ id: `notif-${i}` })
    );
    mockNotificationFindMany.mockResolvedValue(rows);

    const result = await getNotifications('user-1', { limit: 20 });

    expect(result.notifications).toHaveLength(20);
    expect(result.hasMore).toBe(true);
  });

  it('filters unread only when unreadOnly is true', async () => {
    mockNotificationFindMany.mockResolvedValue([]);

    await getNotifications('user-1', { unreadOnly: true });

    expect(mockNotificationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ readAt: null }),
      })
    );
  });

  it('uses cursor for pagination', async () => {
    const cursorDate = new Date('2025-01-10T00:00:00Z');
    mockNotificationFindUnique.mockResolvedValue({ createdAt: cursorDate });
    mockNotificationFindMany.mockResolvedValue([]);

    await getNotifications('user-1', { cursor: 'cursor-id' });

    expect(mockNotificationFindUnique).toHaveBeenCalledWith({
      where: { id: 'cursor-id' },
    });
    expect(mockNotificationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { lt: cursorDate },
        }),
      })
    );
  });

  it('caps limit at MAX_LIMIT (100)', async () => {
    mockNotificationFindMany.mockResolvedValue([]);

    await getNotifications('user-1', { limit: 500 });

    expect(mockNotificationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 101, // 100 + 1 for hasMore check
      })
    );
  });

  it('uses default limit of 20 when not specified', async () => {
    mockNotificationFindMany.mockResolvedValue([]);

    await getNotifications('user-1');

    expect(mockNotificationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 21, // 20 + 1 for hasMore check
      })
    );
  });

  it('returns empty array when no notifications', async () => {
    mockNotificationFindMany.mockResolvedValue([]);

    const result = await getNotifications('user-1');

    expect(result.notifications).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });

  it('handles notification with no actor gracefully', async () => {
    const row = createMockNotificationRow({ actor: null });
    mockNotificationFindMany.mockResolvedValue([row]);

    const result = await getNotifications('user-1');

    expect(result.notifications[0].senderName).toBe('Unknown');
    expect(result.notifications[0].senderImage).toBeNull();
  });

  it('sets isRead based on readAt field', async () => {
    const readRow = createMockNotificationRow({
      id: 'notif-read',
      readAt: new Date(),
    });
    const unreadRow = createMockNotificationRow({
      id: 'notif-unread',
      readAt: null,
    });
    mockNotificationFindMany.mockResolvedValue([readRow, unreadRow]);

    const result = await getNotifications('user-1');

    expect(result.notifications[0].isRead).toBe(true);
    expect(result.notifications[1].isRead).toBe(false);
  });

  it('handles malformed payload JSON gracefully', async () => {
    const row = createMockNotificationRow({ payload: 'invalid-json' });
    mockNotificationFindMany.mockResolvedValue([row]);

    const result = await getNotifications('user-1');

    expect(result.notifications[0].preview).toBe('');
    expect(result.notifications[0].channelId).toBeNull();
    expect(result.notifications[0].messageId).toBeNull();
  });

  it('extracts emoji as preview for REACTION notifications', async () => {
    const row = createMockNotificationRow({
      type: 'REACTION',
      payload: JSON.stringify({
        messageId: 'msg-1',
        channelId: 'ch-1',
        actorId: 'actor-1',
        emoji: '👍',
      }),
    });
    mockNotificationFindMany.mockResolvedValue([row]);

    const result = await getNotifications('user-1');

    expect(result.notifications[0].preview).toBe('👍');
  });

  it('batch-fetches channel names for multiple notifications', async () => {
    const rows = [
      createMockNotificationRow({
        id: 'notif-1',
        payload: JSON.stringify({
          messageId: 'msg-1',
          channelId: 'ch-1',
          preview: 'A',
        }),
      }),
      createMockNotificationRow({
        id: 'notif-2',
        payload: JSON.stringify({
          messageId: 'msg-2',
          channelId: 'ch-2',
          preview: 'B',
        }),
      }),
    ];
    mockNotificationFindMany.mockResolvedValue(rows);
    mockChannelFindMany.mockResolvedValue([
      { id: 'ch-1', name: 'general' },
      { id: 'ch-2', name: 'random' },
    ]);

    const result = await getNotifications('user-1');

    // Should batch-fetch both channel IDs in one query
    expect(mockChannelFindMany).toHaveBeenCalledWith({
      where: { id: { in: expect.arrayContaining(['ch-1', 'ch-2']) } },
      select: { id: true, name: true },
    });
    expect(result.notifications[0].channelName).toBe('general');
    expect(result.notifications[1].channelName).toBe('random');
  });

  it('orders notifications by createdAt descending', async () => {
    mockNotificationFindMany.mockResolvedValue([]);

    await getNotifications('user-1');

    expect(mockNotificationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
      })
    );
  });
});

describe('getUnreadCount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns count of unread notifications', async () => {
    mockNotificationCount.mockResolvedValue(5);

    const count = await getUnreadCount('user-1');

    expect(count).toBe(5);
    expect(mockNotificationCount).toHaveBeenCalledWith({
      where: { userId: 'user-1', readAt: null },
    });
  });

  it('returns 0 when no unread notifications', async () => {
    mockNotificationCount.mockResolvedValue(0);

    const count = await getUnreadCount('user-1');

    expect(count).toBe(0);
  });
});

describe('markNotificationRead', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks a notification as read', async () => {
    mockNotificationFindUnique.mockResolvedValue({
      id: 'notif-1',
      userId: 'user-1',
      readAt: null,
    });
    mockNotificationUpdate.mockResolvedValue({});

    const result = await markNotificationRead('notif-1', 'user-1');

    expect(result).toBe(true);
    expect(mockNotificationUpdate).toHaveBeenCalledWith({
      where: { id: 'notif-1' },
      data: { readAt: expect.any(Date) },
    });
  });

  it('returns false for non-existent notification', async () => {
    mockNotificationFindUnique.mockResolvedValue(null);

    const result = await markNotificationRead('nonexistent', 'user-1');

    expect(result).toBe(false);
    expect(mockNotificationUpdate).not.toHaveBeenCalled();
  });

  it('returns false when notification belongs to different user', async () => {
    mockNotificationFindUnique.mockResolvedValue({
      id: 'notif-1',
      userId: 'other-user',
      readAt: null,
    });

    const result = await markNotificationRead('notif-1', 'user-1');

    expect(result).toBe(false);
    expect(mockNotificationUpdate).not.toHaveBeenCalled();
  });

  it('returns true without updating when already read', async () => {
    mockNotificationFindUnique.mockResolvedValue({
      id: 'notif-1',
      userId: 'user-1',
      readAt: new Date('2025-01-01'),
    });

    const result = await markNotificationRead('notif-1', 'user-1');

    expect(result).toBe(true);
    expect(mockNotificationUpdate).not.toHaveBeenCalled();
  });
});

describe('markAllRead', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks all unread notifications as read and returns count', async () => {
    mockNotificationUpdateMany.mockResolvedValue({ count: 3 });

    const count = await markAllRead('user-1');

    expect(count).toBe(3);
    expect(mockNotificationUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it('returns 0 when no unread notifications', async () => {
    mockNotificationUpdateMany.mockResolvedValue({ count: 0 });

    const count = await markAllRead('user-1');

    expect(count).toBe(0);
  });
});
