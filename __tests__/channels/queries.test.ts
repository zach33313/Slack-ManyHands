/**
 * Tests for channels/queries.ts
 *
 * Covers:
 * - getChannelById: returns channel with member count or null
 * - listWorkspaceChannels: returns member channels + public channels, excludes DMs
 * - getChannelMembers: returns members with user details
 * - getDMChannel: finds existing DM between two users
 * - isChannelMember: checks membership boolean
 * - isChannelNameUnique: validates name uniqueness within workspace
 * - getUnreadCount: counts unread messages
 */

jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    channel: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    channelMember: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    message: {
      count: jest.fn(),
    },
  },
}));

import { prisma } from '@/shared/lib/prisma';
import {
  getChannelById,
  listWorkspaceChannels,
  getChannelMembers,
  getDMChannel,
  isChannelMember,
  isChannelNameUnique,
  getUnreadCount,
  markChannelRead,
} from '@/channels/queries';

const mockedPrisma = prisma as any;

describe('getChannelById', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns channel with member count', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      name: 'general',
      description: 'General chat',
      type: 'PUBLIC',
      isArchived: false,
      createdById: 'user-1',
      createdAt: new Date('2026-01-01'),
      _count: { members: 5 },
    });

    const result = await getChannelById('ch-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('ch-1');
    expect(result!.name).toBe('general');
    expect(result!.type).toBe('PUBLIC');
    expect(result!.memberCount).toBe(5);
  });

  it('returns null when channel not found', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue(null);

    const result = await getChannelById('nonexistent');

    expect(result).toBeNull();
  });

  it('queries with include for member count', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue(null);

    await getChannelById('ch-1');

    expect(mockedPrisma.channel.findUnique).toHaveBeenCalledWith({
      where: { id: 'ch-1' },
      include: {
        _count: { select: { members: true } },
      },
    });
  });
});

describe('listWorkspaceChannels', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns channels user is member of and public channels', async () => {
    mockedPrisma.channel.findMany.mockResolvedValue([
      {
        id: 'ch-1',
        workspaceId: 'ws-1',
        name: 'general',
        description: null,
        type: 'PUBLIC',
        isArchived: false,
        createdById: 'user-1',
        createdAt: new Date(),
        _count: { members: 3 },
        members: [{ lastReadAt: new Date(), notifyPref: 'ALL' }],
        messages: [
          { contentPlain: 'Hello world', createdAt: new Date() },
        ],
      },
      {
        id: 'ch-2',
        workspaceId: 'ws-1',
        name: 'engineering',
        description: 'Engineering team',
        type: 'PRIVATE',
        isArchived: false,
        createdById: 'user-2',
        createdAt: new Date(),
        _count: { members: 2 },
        members: [{ lastReadAt: null, notifyPref: 'NOTHING' }],
        messages: [],
      },
    ]);

    const result = await listWorkspaceChannels('ws-1', 'user-1');

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('general');
    expect(result[0].memberCount).toBe(3);
    expect(result[0].lastMessagePreview).toBe('Hello world');
    expect(result[1].isMuted).toBe(true);
    expect(result[1].lastMessagePreview).toBeNull();
  });

  it('excludes DM and GROUP_DM channels', async () => {
    mockedPrisma.channel.findMany.mockResolvedValue([
      {
        id: 'ch-1',
        workspaceId: 'ws-1',
        name: 'general',
        description: null,
        type: 'PUBLIC',
        isArchived: false,
        createdById: 'user-1',
        createdAt: new Date(),
        _count: { members: 1 },
        members: [],
        messages: [],
      },
      {
        id: 'ch-dm',
        workspaceId: 'ws-1',
        name: 'dm-user1-user2',
        description: null,
        type: 'DM',
        isArchived: false,
        createdById: 'user-1',
        createdAt: new Date(),
        _count: { members: 2 },
        members: [],
        messages: [],
      },
    ]);

    const result = await listWorkspaceChannels('ws-1', 'user-1');

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('PUBLIC');
  });

  it('truncates message preview to 100 chars', async () => {
    const longMessage = 'a'.repeat(200);
    mockedPrisma.channel.findMany.mockResolvedValue([
      {
        id: 'ch-1',
        workspaceId: 'ws-1',
        name: 'general',
        description: null,
        type: 'PUBLIC',
        isArchived: false,
        createdById: 'user-1',
        createdAt: new Date(),
        _count: { members: 1 },
        members: [],
        messages: [{ contentPlain: longMessage, createdAt: new Date() }],
      },
    ]);

    const result = await listWorkspaceChannels('ws-1', 'user-1');

    expect(result[0].lastMessagePreview).toHaveLength(100);
  });
});

describe('getChannelMembers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns members with user details', async () => {
    mockedPrisma.channelMember.findMany.mockResolvedValue([
      {
        id: 'cm-1',
        channelId: 'ch-1',
        userId: 'user-1',
        lastReadAt: new Date(),
        notifyPref: 'ALL',
        joinedAt: new Date('2026-01-01'),
        user: { id: 'user-1', name: 'Alice', image: null },
      },
      {
        id: 'cm-2',
        channelId: 'ch-1',
        userId: 'user-2',
        lastReadAt: null,
        notifyPref: 'ALL',
        joinedAt: new Date('2026-01-02'),
        user: { id: 'user-2', name: null, image: 'https://img.url' },
      },
    ]);

    const result = await getChannelMembers('ch-1');

    expect(result).toHaveLength(2);
    expect(result[0].userId).toBe('user-1');
    expect(result[0].user.name).toBe('Alice');
    expect(result[1].user.name).toBe('Unknown User'); // null name fallback
  });

  it('returns empty array for channel with no members', async () => {
    mockedPrisma.channelMember.findMany.mockResolvedValue([]);

    const result = await getChannelMembers('ch-empty');

    expect(result).toEqual([]);
  });

  it('orders by joinedAt ascending', async () => {
    mockedPrisma.channelMember.findMany.mockResolvedValue([]);

    await getChannelMembers('ch-1');

    expect(mockedPrisma.channelMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { joinedAt: 'asc' },
      })
    );
  });
});

describe('getDMChannel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns channel ID when DM exists', async () => {
    mockedPrisma.channel.findMany.mockResolvedValue([
      {
        id: 'ch-dm',
        type: 'DM',
        _count: { members: 2 },
      },
    ]);

    const result = await getDMChannel('ws-1', 'user-1', 'user-2');

    expect(result).toBe('ch-dm');
  });

  it('returns null when no DM exists', async () => {
    mockedPrisma.channel.findMany.mockResolvedValue([]);

    const result = await getDMChannel('ws-1', 'user-1', 'user-2');

    expect(result).toBeNull();
  });

  it('only returns channels with exactly 2 members', async () => {
    mockedPrisma.channel.findMany.mockResolvedValue([
      {
        id: 'ch-group',
        type: 'DM',
        _count: { members: 3 },
      },
    ]);

    const result = await getDMChannel('ws-1', 'user-1', 'user-2');

    expect(result).toBeNull();
  });

  it('queries with correct filters', async () => {
    mockedPrisma.channel.findMany.mockResolvedValue([]);

    await getDMChannel('ws-1', 'user-1', 'user-2');

    expect(mockedPrisma.channel.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'ws-1',
        type: 'DM',
        AND: [
          { members: { some: { userId: 'user-1' } } },
          { members: { some: { userId: 'user-2' } } },
        ],
      },
      include: {
        _count: { select: { members: true } },
      },
    });
  });
});

describe('isChannelMember', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns true when user is a member', async () => {
    mockedPrisma.channelMember.findUnique.mockResolvedValue({ id: 'cm-1' });

    const result = await isChannelMember('ch-1', 'user-1');

    expect(result).toBe(true);
  });

  it('returns false when user is not a member', async () => {
    mockedPrisma.channelMember.findUnique.mockResolvedValue(null);

    const result = await isChannelMember('ch-1', 'user-none');

    expect(result).toBe(false);
  });
});

describe('isChannelNameUnique', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns true when name is unique', async () => {
    mockedPrisma.channel.findFirst.mockResolvedValue(null);

    const result = await isChannelNameUnique('ws-1', 'new-channel');

    expect(result).toBe(true);
  });

  it('returns false when name already exists', async () => {
    mockedPrisma.channel.findFirst.mockResolvedValue({ id: 'ch-existing' });

    const result = await isChannelNameUnique('ws-1', 'general');

    expect(result).toBe(false);
  });

  it('excludes a specific channel when checking (for updates)', async () => {
    mockedPrisma.channel.findFirst.mockResolvedValue(null);

    await isChannelNameUnique('ws-1', 'general', 'ch-self');

    expect(mockedPrisma.channel.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: 'ws-1',
        name: 'general',
        id: { not: 'ch-self' },
      },
    });
  });
});

describe('getUnreadCount', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns unread count after lastReadAt', async () => {
    mockedPrisma.message.count.mockResolvedValue(5);

    const lastRead = new Date('2026-01-10');
    const result = await getUnreadCount('ch-1', 'user-1', lastRead);

    expect(result).toBe(5);
    expect(mockedPrisma.message.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        channelId: 'ch-1',
        isDeleted: false,
        userId: { not: 'user-1' },
        createdAt: { gt: lastRead },
      }),
    });
  });

  it('counts all messages when lastReadAt is null', async () => {
    mockedPrisma.message.count.mockResolvedValue(10);

    const result = await getUnreadCount('ch-1', 'user-1', null);

    expect(result).toBe(10);
  });

  it('looks up membership when lastReadAt not provided', async () => {
    mockedPrisma.channelMember.findUnique.mockResolvedValue({
      lastReadAt: new Date('2026-01-15'),
    });
    mockedPrisma.message.count.mockResolvedValue(3);

    const result = await getUnreadCount('ch-1', 'user-1');

    expect(result).toBe(3);
    expect(mockedPrisma.channelMember.findUnique).toHaveBeenCalledWith({
      where: { channelId_userId: { channelId: 'ch-1', userId: 'user-1' } },
      select: { lastReadAt: true },
    });
  });

  it('returns 0 when user is not a member', async () => {
    mockedPrisma.channelMember.findUnique.mockResolvedValue(null);

    const result = await getUnreadCount('ch-1', 'user-nonmember');

    expect(result).toBe(0);
  });
});

describe('markChannelRead', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates lastReadAt for channel member', async () => {
    mockedPrisma.channelMember.update.mockResolvedValue({});

    await markChannelRead('ch-1', 'user-1');

    expect(mockedPrisma.channelMember.update).toHaveBeenCalledWith({
      where: { channelId_userId: { channelId: 'ch-1', userId: 'user-1' } },
      data: { lastReadAt: expect.any(Date) },
    });
  });
});
