/**
 * Tests for members/queries.ts
 *
 * Covers:
 * - getMember returns member with user details or null
 * - listWorkspaceMembers returns all members ordered by name
 * - searchMembers filters by name/email, limited to 10, empty query returns []
 * - getUserProfile returns full profile or null
 * - listChannelMembers maps workspace roles correctly
 */

jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    workspaceMember: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    channel: {
      findUnique: jest.fn(),
    },
    channelMember: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/shared/lib/prisma';
import {
  getMember,
  listWorkspaceMembers,
  searchMembers,
  getUserProfile,
  listChannelMembers,
} from '@/members/queries';

const mockedPrisma = prisma as unknown as {
  workspaceMember: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
  };
  user: {
    findUnique: jest.Mock;
  };
  channel: {
    findUnique: jest.Mock;
  };
  channelMember: {
    findMany: jest.Mock;
  };
};

const mockUser = {
  id: 'user-1',
  name: 'Alice Smith',
  email: 'alice@example.com',
  image: 'https://example.com/alice.jpg',
  title: 'Engineer',
  statusText: 'Working on tests',
  statusEmoji: '🧪',
  timezone: 'America/New_York',
};

const mockMember = {
  id: 'member-1',
  workspaceId: 'ws-1',
  userId: 'user-1',
  role: 'OWNER',
  joinedAt: new Date('2024-01-01'),
  user: mockUser,
};

describe('getMember', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns member with user details when found', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue(mockMember);

    const result = await getMember('ws-1', 'user-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('member-1');
    expect(result!.userId).toBe('user-1');
    expect(result!.role).toBe('OWNER');
    expect(result!.user.name).toBe('Alice Smith');
    expect(result!.user.email).toBe('alice@example.com');
  });

  it('returns null when member not found', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue(null);

    const result = await getMember('ws-1', 'nonexistent');

    expect(result).toBeNull();
  });

  it('passes correct where clause to Prisma', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue(null);

    await getMember('ws-42', 'user-99');

    expect(mockedPrisma.workspaceMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_userId: {
            workspaceId: 'ws-42',
            userId: 'user-99',
          },
        },
      })
    );
  });
});

describe('listWorkspaceMembers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns all members with user details', async () => {
    const mockMembers = [
      mockMember,
      {
        ...mockMember,
        id: 'member-2',
        userId: 'user-2',
        role: 'MEMBER',
        user: { ...mockUser, id: 'user-2', name: 'Bob Jones' },
      },
    ];
    mockedPrisma.workspaceMember.findMany.mockResolvedValue(mockMembers);

    const result = await listWorkspaceMembers('ws-1');

    expect(result).toHaveLength(2);
    expect(result[0].user.name).toBe('Alice Smith');
    expect(result[1].user.name).toBe('Bob Jones');
  });

  it('returns empty array when no members', async () => {
    mockedPrisma.workspaceMember.findMany.mockResolvedValue([]);

    const result = await listWorkspaceMembers('ws-empty');

    expect(result).toEqual([]);
  });

  it('maps role correctly as string', async () => {
    mockedPrisma.workspaceMember.findMany.mockResolvedValue([
      { ...mockMember, role: 'ADMIN' },
    ]);

    const result = await listWorkspaceMembers('ws-1');

    expect(result[0].role).toBe('ADMIN');
  });
});

describe('searchMembers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns matching members by name', async () => {
    mockedPrisma.workspaceMember.findMany.mockResolvedValue([mockMember]);

    const result = await searchMembers('ws-1', 'alice');

    expect(result).toHaveLength(1);
    expect(result[0].user.name).toBe('Alice Smith');
  });

  it('returns empty array for empty query', async () => {
    const result = await searchMembers('ws-1', '');

    expect(result).toEqual([]);
    expect(mockedPrisma.workspaceMember.findMany).not.toHaveBeenCalled();
  });

  it('returns empty array for whitespace-only query', async () => {
    const result = await searchMembers('ws-1', '   ');

    expect(result).toEqual([]);
    expect(mockedPrisma.workspaceMember.findMany).not.toHaveBeenCalled();
  });

  it('limits results to 10', async () => {
    mockedPrisma.workspaceMember.findMany.mockResolvedValue([]);

    await searchMembers('ws-1', 'test');

    expect(mockedPrisma.workspaceMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    );
  });

  it('lowercases the query for case-insensitive search', async () => {
    mockedPrisma.workspaceMember.findMany.mockResolvedValue([]);

    await searchMembers('ws-1', 'ALICE');

    const callArgs = mockedPrisma.workspaceMember.findMany.mock.calls[0][0];
    expect(callArgs.where.user.OR[0].name.contains).toBe('alice');
  });
});

describe('getUserProfile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns full user profile when found', async () => {
    const fullUser = {
      ...mockUser,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-06-01'),
    };
    mockedPrisma.user.findUnique.mockResolvedValue(fullUser);

    const result = await getUserProfile('user-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('user-1');
    expect(result!.name).toBe('Alice Smith');
    expect(result!.email).toBe('alice@example.com');
    expect(result!.title).toBe('Engineer');
    expect(result!.statusText).toBe('Working on tests');
    expect(result!.statusEmoji).toBe('🧪');
    expect(result!.timezone).toBe('America/New_York');
  });

  it('returns null when user not found', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);

    const result = await getUserProfile('nonexistent');

    expect(result).toBeNull();
  });
});

describe('listChannelMembers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns empty array when channel not found', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue(null);

    const result = await listChannelMembers('ch-nonexistent');

    expect(result).toEqual([]);
  });

  it('returns channel members with workspace roles mapped', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      workspaceId: 'ws-1',
    });
    mockedPrisma.channelMember.findMany.mockResolvedValue([
      {
        id: 'cm-1',
        channelId: 'ch-1',
        userId: 'user-1',
        joinedAt: new Date(),
        user: mockUser,
      },
    ]);
    mockedPrisma.workspaceMember.findMany.mockResolvedValue([
      {
        userId: 'user-1',
        role: 'ADMIN',
        joinedAt: new Date('2024-01-01'),
        id: 'wm-1',
      },
    ]);

    const result = await listChannelMembers('ch-1');

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('ADMIN');
    expect(result[0].workspaceId).toBe('ws-1');
  });

  it('defaults role to MEMBER when no workspace membership found', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      workspaceId: 'ws-1',
    });
    mockedPrisma.channelMember.findMany.mockResolvedValue([
      {
        id: 'cm-1',
        channelId: 'ch-1',
        userId: 'user-orphan',
        joinedAt: new Date(),
        user: { ...mockUser, id: 'user-orphan' },
      },
    ]);
    mockedPrisma.workspaceMember.findMany.mockResolvedValue([]);

    const result = await listChannelMembers('ch-1');

    expect(result[0].role).toBe('MEMBER');
  });
});
