/**
 * Tests for admin/queries.ts
 *
 * Covers:
 * - getMessagesPerDay: groups messages by date, fills gaps with 0
 * - getActiveUsersPerDay: deduplicates users per day
 * - getTopChannels: ordered by message count
 * - getTopUsers: in-memory aggregation, sorted by count, limited to N
 * - getTotalStats: parallel count queries
 * - getAuditLog: cursor-based pagination, changes JSON parsing
 */

// Mock prisma
jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    message: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    channel: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    workspaceMember: {
      count: jest.fn(),
    },
    fileAttachment: {
      count: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/shared/lib/prisma';
import {
  getMessagesPerDay,
  getActiveUsersPerDay,
  getTopChannels,
  getTopUsers,
  getTotalStats,
  getAnalyticsData,
  getAuditLog,
} from '@/admin/queries';

const mockedPrisma = prisma as any;

// ---------------------------------------------------------------------------
// getMessagesPerDay
// ---------------------------------------------------------------------------

describe('getMessagesPerDay', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns one entry per day for the requested range', async () => {
    mockedPrisma.message.findMany.mockResolvedValue([]);

    const result = await getMessagesPerDay('ws-1', 7);

    expect(result).toHaveLength(7);
    // Each entry has date (YYYY-MM-DD) and count
    for (const entry of result) {
      expect(entry).toHaveProperty('date');
      expect(entry).toHaveProperty('count');
      expect(typeof entry.count).toBe('number');
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('fills days with no messages as count 0', async () => {
    mockedPrisma.message.findMany.mockResolvedValue([]);

    const result = await getMessagesPerDay('ws-1', 5);

    expect(result.every((r) => r.count === 0)).toBe(true);
  });

  it('groups messages by day and counts correctly', async () => {
    // Simulate 3 messages all on the same day (today)
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    mockedPrisma.message.findMany.mockResolvedValue([
      { createdAt: new Date(today) },
      { createdAt: new Date(today) },
      { createdAt: new Date(today) },
    ]);

    const result = await getMessagesPerDay('ws-1', 7);

    const todayStr = today.toISOString().split('T')[0];
    const todayEntry = result.find((r) => r.date === todayStr);
    expect(todayEntry).toBeDefined();
    expect(todayEntry!.count).toBe(3);
  });

  it('queries prisma with correct workspace and date filters', async () => {
    mockedPrisma.message.findMany.mockResolvedValue([]);

    await getMessagesPerDay('ws-42', 30);

    expect(mockedPrisma.message.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        channel: { workspaceId: 'ws-42' },
        isDeleted: false,
        parentId: null,
        createdAt: expect.objectContaining({ gte: expect.any(Date) }),
      }),
      select: { createdAt: true },
    });
  });

  it('returns 30 entries by default', async () => {
    mockedPrisma.message.findMany.mockResolvedValue([]);

    const result = await getMessagesPerDay('ws-1');

    expect(result).toHaveLength(30);
  });
});

// ---------------------------------------------------------------------------
// getActiveUsersPerDay
// ---------------------------------------------------------------------------

describe('getActiveUsersPerDay', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deduplicates users who sent multiple messages on the same day', async () => {
    const today = new Date();
    today.setHours(10, 0, 0, 0);
    mockedPrisma.message.findMany.mockResolvedValue([
      { createdAt: new Date(today), userId: 'user-1' },
      { createdAt: new Date(today), userId: 'user-1' }, // duplicate
      { createdAt: new Date(today), userId: 'user-2' },
    ]);

    const result = await getActiveUsersPerDay('ws-1', 7);

    const todayStr = today.toISOString().split('T')[0];
    const todayEntry = result.find((r) => r.date === todayStr);
    expect(todayEntry!.count).toBe(2); // only 2 unique users
  });

  it('returns 0 for days with no messages', async () => {
    mockedPrisma.message.findMany.mockResolvedValue([]);

    const result = await getActiveUsersPerDay('ws-1', 3);

    expect(result.every((r) => r.count === 0)).toBe(true);
  });

  it('counts users independently per day', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(10, 0, 0, 0);

    const today = new Date();
    today.setHours(10, 0, 0, 0);

    mockedPrisma.message.findMany.mockResolvedValue([
      { createdAt: new Date(yesterday), userId: 'user-1' },
      { createdAt: new Date(today), userId: 'user-1' },
      { createdAt: new Date(today), userId: 'user-2' },
    ]);

    const result = await getActiveUsersPerDay('ws-1', 7);

    const yestStr = yesterday.toISOString().split('T')[0];
    const todStr = today.toISOString().split('T')[0];

    const yEnt = result.find((r) => r.date === yestStr);
    const tEnt = result.find((r) => r.date === todStr);

    expect(yEnt!.count).toBe(1);
    expect(tEnt!.count).toBe(2);
  });

  it('returns correct length for specified days', async () => {
    mockedPrisma.message.findMany.mockResolvedValue([]);

    const result = await getActiveUsersPerDay('ws-1', 14);

    expect(result).toHaveLength(14);
  });
});

// ---------------------------------------------------------------------------
// getTopChannels
// ---------------------------------------------------------------------------

describe('getTopChannels', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns channels ordered by message count', async () => {
    mockedPrisma.channel.findMany.mockResolvedValue([
      { id: 'ch-1', name: 'general', _count: { messages: 150 } },
      { id: 'ch-2', name: 'random', _count: { messages: 42 } },
      { id: 'ch-3', name: 'dev', _count: { messages: 8 } },
    ]);

    const result = await getTopChannels('ws-1');

    expect(result).toEqual([
      { channelId: 'ch-1', name: 'general', messageCount: 150 },
      { channelId: 'ch-2', name: 'random', messageCount: 42 },
      { channelId: 'ch-3', name: 'dev', messageCount: 8 },
    ]);
  });

  it('queries prisma with workspace filter and message count order', async () => {
    mockedPrisma.channel.findMany.mockResolvedValue([]);

    await getTopChannels('ws-99', 5);

    expect(mockedPrisma.channel.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-99', isArchived: false },
      select: {
        id: true,
        name: true,
        _count: { select: { messages: true } },
      },
      orderBy: { messages: { _count: 'desc' } },
      take: 5,
    });
  });

  it('returns empty array when workspace has no channels', async () => {
    mockedPrisma.channel.findMany.mockResolvedValue([]);

    const result = await getTopChannels('ws-1');

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getTopUsers
// ---------------------------------------------------------------------------

describe('getTopUsers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('aggregates message counts per user and returns sorted results', async () => {
    mockedPrisma.message.findMany.mockResolvedValue([
      { userId: 'user-1', author: { id: 'user-1', name: 'Alice', image: null } },
      { userId: 'user-1', author: { id: 'user-1', name: 'Alice', image: null } },
      { userId: 'user-1', author: { id: 'user-1', name: 'Alice', image: null } },
      { userId: 'user-2', author: { id: 'user-2', name: 'Bob', image: '/bob.png' } },
      { userId: 'user-2', author: { id: 'user-2', name: 'Bob', image: '/bob.png' } },
    ]);

    const result = await getTopUsers('ws-1', 10);

    expect(result[0]).toEqual({ userId: 'user-1', name: 'Alice', image: null, messageCount: 3 });
    expect(result[1]).toEqual({ userId: 'user-2', name: 'Bob', image: '/bob.png', messageCount: 2 });
  });

  it('limits results to the specified count', async () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({
      userId: `user-${i}`,
      author: { id: `user-${i}`, name: `User ${i}`, image: null },
    }));
    mockedPrisma.message.findMany.mockResolvedValue(messages);

    const result = await getTopUsers('ws-1', 5);

    expect(result).toHaveLength(5);
  });

  it('returns empty array when no messages exist', async () => {
    mockedPrisma.message.findMany.mockResolvedValue([]);

    const result = await getTopUsers('ws-1');

    expect(result).toEqual([]);
  });

  it('uses "Unknown" when author name is null', async () => {
    mockedPrisma.message.findMany.mockResolvedValue([
      { userId: 'user-1', author: { id: 'user-1', name: null, image: null } },
    ]);

    const result = await getTopUsers('ws-1');

    expect(result[0].name).toBe('Unknown');
  });
});

// ---------------------------------------------------------------------------
// getTotalStats
// ---------------------------------------------------------------------------

describe('getTotalStats', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns all four total counts via parallel queries', async () => {
    mockedPrisma.message.count.mockResolvedValue(500);
    mockedPrisma.workspaceMember.count.mockResolvedValue(25);
    mockedPrisma.channel.count.mockResolvedValue(12);
    mockedPrisma.fileAttachment.count.mockResolvedValue(88);

    const result = await getTotalStats('ws-1');

    expect(result).toEqual({
      totalMessages: 500,
      totalMembers: 25,
      totalChannels: 12,
      totalFiles: 88,
    });
  });

  it('queries message count with workspace and isDeleted filters', async () => {
    mockedPrisma.message.count.mockResolvedValue(0);
    mockedPrisma.workspaceMember.count.mockResolvedValue(0);
    mockedPrisma.channel.count.mockResolvedValue(0);
    mockedPrisma.fileAttachment.count.mockResolvedValue(0);

    await getTotalStats('ws-42');

    expect(mockedPrisma.message.count).toHaveBeenCalledWith({
      where: { channel: { workspaceId: 'ws-42' }, isDeleted: false },
    });
    expect(mockedPrisma.workspaceMember.count).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-42' },
    });
    expect(mockedPrisma.channel.count).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-42', isArchived: false },
    });
  });

  it('returns zeros for an empty workspace', async () => {
    mockedPrisma.message.count.mockResolvedValue(0);
    mockedPrisma.workspaceMember.count.mockResolvedValue(0);
    mockedPrisma.channel.count.mockResolvedValue(0);
    mockedPrisma.fileAttachment.count.mockResolvedValue(0);

    const result = await getTotalStats('ws-empty');

    expect(result).toEqual({
      totalMessages: 0,
      totalMembers: 0,
      totalChannels: 0,
      totalFiles: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// getAuditLog
// ---------------------------------------------------------------------------

describe('getAuditLog', () => {
  beforeEach(() => jest.clearAllMocks());

  function makeLogEntry(overrides: Record<string, unknown> = {}) {
    return {
      id: 'log-1',
      workspaceId: 'ws-1',
      actorId: 'user-1',
      actor: { id: 'user-1', name: 'Alice', image: null },
      action: 'MEMBER_ROLE_CHANGED',
      targetId: 'user-2',
      changes: JSON.stringify({ role: { from: 'MEMBER', to: 'ADMIN' } }),
      createdAt: new Date('2026-01-20'),
      ...overrides,
    };
  }

  it('returns mapped audit log entries', async () => {
    const entry = makeLogEntry();
    mockedPrisma.auditLog.findMany.mockResolvedValue([entry]);

    const result = await getAuditLog('ws-1');

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toEqual({
      id: 'log-1',
      workspaceId: 'ws-1',
      actorId: 'user-1',
      actor: { id: 'user-1', name: 'Alice', image: null },
      action: 'MEMBER_ROLE_CHANGED',
      targetId: 'user-2',
      changes: { role: { from: 'MEMBER', to: 'ADMIN' } },
      createdAt: entry.createdAt,
    });
  });

  it('parses changes JSON string into object', async () => {
    const entry = makeLogEntry({
      changes: JSON.stringify({ key: 'value', nested: { x: 1 } }),
    });
    mockedPrisma.auditLog.findMany.mockResolvedValue([entry]);

    const result = await getAuditLog('ws-1');

    expect(result.entries[0].changes).toEqual({ key: 'value', nested: { x: 1 } });
  });

  it('returns null for changes when changes field is null', async () => {
    const entry = makeLogEntry({ changes: null });
    mockedPrisma.auditLog.findMany.mockResolvedValue([entry]);

    const result = await getAuditLog('ws-1');

    expect(result.entries[0].changes).toBeNull();
  });

  it('uses "Unknown" when actor name is null', async () => {
    const entry = makeLogEntry({ actor: { id: 'user-1', name: null, image: null } });
    mockedPrisma.auditLog.findMany.mockResolvedValue([entry]);

    const result = await getAuditLog('ws-1');

    expect(result.entries[0].actor.name).toBe('Unknown');
  });

  it('returns nextCursor when more entries exist', async () => {
    // limit=2, returns 3 entries (limit+1)
    const entries = [
      makeLogEntry({ id: 'log-1' }),
      makeLogEntry({ id: 'log-2' }),
      makeLogEntry({ id: 'log-3' }), // extra entry indicating hasMore
    ];
    mockedPrisma.auditLog.findMany.mockResolvedValue(entries);

    const result = await getAuditLog('ws-1', undefined, 2);

    expect(result.entries).toHaveLength(2);
    expect(result.nextCursor).toBe('log-2'); // last entry in the page
  });

  it('returns nextCursor=null when on the last page', async () => {
    const entries = [makeLogEntry({ id: 'log-1' }), makeLogEntry({ id: 'log-2' })];
    mockedPrisma.auditLog.findMany.mockResolvedValue(entries);

    const result = await getAuditLog('ws-1', undefined, 5); // limit 5, only 2 returned

    expect(result.nextCursor).toBeNull();
    expect(result.entries).toHaveLength(2);
  });

  it('passes cursor to prisma when provided', async () => {
    mockedPrisma.auditLog.findMany.mockResolvedValue([]);

    await getAuditLog('ws-1', 'cursor-id', 50);

    expect(mockedPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: 'cursor-id' },
        skip: 1,
      })
    );
  });

  it('does not pass cursor params when no cursor given', async () => {
    mockedPrisma.auditLog.findMany.mockResolvedValue([]);

    await getAuditLog('ws-1');

    const call = mockedPrisma.auditLog.findMany.mock.calls[0][0];
    expect(call.cursor).toBeUndefined();
    expect(call.skip).toBeUndefined();
  });

  it('fetches limit+1 entries to determine hasMore', async () => {
    mockedPrisma.auditLog.findMany.mockResolvedValue([]);

    await getAuditLog('ws-1', undefined, 20);

    expect(mockedPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 21 })
    );
  });
});
