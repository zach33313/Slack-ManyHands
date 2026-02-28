/**
 * Tests for workspaces/queries.ts
 *
 * Covers:
 * - listUserWorkspaces: returns only joined workspaces, ordered by joinedAt desc
 * - getWorkspaceBySlug: returns correct workspace or null
 * - getWorkspaceById: returns correct workspace or null
 * - getWorkspaceWithMembers: includes members, counts
 * - getMemberRole: returns correct role or null for non-members
 * - getWorkspaceMembers: returns members with user details
 * - isSlugTaken: returns boolean for slug uniqueness
 */

jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    workspace: {
      findUnique: jest.fn(),
    },
    workspaceMember: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from '@/shared/lib/prisma';
import {
  listUserWorkspaces,
  getWorkspaceBySlug,
  getWorkspaceById,
  getWorkspaceWithMembers,
  getMemberRole,
  getWorkspaceMembers,
  isSlugTaken,
} from '@/workspaces/queries';

const mockedPrisma = prisma as any;

describe('listUserWorkspaces', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns workspaces the user belongs to', async () => {
    mockedPrisma.workspaceMember.findMany.mockResolvedValue([
      {
        workspace: {
          id: 'ws-1',
          name: 'Acme Corp',
          slug: 'acme-corp',
          iconUrl: null,
          ownerId: 'user-1',
          createdAt: new Date('2026-01-01'),
        },
        joinedAt: new Date('2026-01-15'),
      },
      {
        workspace: {
          id: 'ws-2',
          name: 'Beta Inc',
          slug: 'beta-inc',
          iconUrl: 'https://icon.url',
          ownerId: 'user-2',
          createdAt: new Date('2026-01-10'),
        },
        joinedAt: new Date('2026-01-10'),
      },
    ]);

    const result = await listUserWorkspaces('user-1');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'ws-1',
      name: 'Acme Corp',
      slug: 'acme-corp',
      iconUrl: null,
      ownerId: 'user-1',
      createdAt: new Date('2026-01-01'),
    });
    expect(result[1].id).toBe('ws-2');
  });

  it('queries with correct userId filter and order', async () => {
    mockedPrisma.workspaceMember.findMany.mockResolvedValue([]);

    await listUserWorkspaces('user-42');

    expect(mockedPrisma.workspaceMember.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-42' },
      include: { workspace: true },
      orderBy: { joinedAt: 'desc' },
    });
  });

  it('returns empty array when user has no workspaces', async () => {
    mockedPrisma.workspaceMember.findMany.mockResolvedValue([]);

    const result = await listUserWorkspaces('user-no-ws');

    expect(result).toEqual([]);
  });
});

describe('getWorkspaceBySlug', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns workspace when slug matches', async () => {
    mockedPrisma.workspace.findUnique.mockResolvedValue({
      id: 'ws-1',
      name: 'Acme',
      slug: 'acme',
      iconUrl: null,
      ownerId: 'user-1',
      createdAt: new Date('2026-01-01'),
    });

    const result = await getWorkspaceBySlug('acme');

    expect(result).toEqual({
      id: 'ws-1',
      name: 'Acme',
      slug: 'acme',
      iconUrl: null,
      ownerId: 'user-1',
      createdAt: new Date('2026-01-01'),
    });
  });

  it('returns null when slug does not match', async () => {
    mockedPrisma.workspace.findUnique.mockResolvedValue(null);

    const result = await getWorkspaceBySlug('nonexistent');

    expect(result).toBeNull();
  });

  it('queries by slug', async () => {
    mockedPrisma.workspace.findUnique.mockResolvedValue(null);

    await getWorkspaceBySlug('my-workspace');

    expect(mockedPrisma.workspace.findUnique).toHaveBeenCalledWith({
      where: { slug: 'my-workspace' },
    });
  });
});

describe('getWorkspaceById', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns workspace when id matches', async () => {
    mockedPrisma.workspace.findUnique.mockResolvedValue({
      id: 'ws-1',
      name: 'Acme',
      slug: 'acme',
      iconUrl: null,
      ownerId: 'user-1',
      createdAt: new Date('2026-01-01'),
    });

    const result = await getWorkspaceById('ws-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('ws-1');
  });

  it('returns null when id does not match', async () => {
    mockedPrisma.workspace.findUnique.mockResolvedValue(null);

    const result = await getWorkspaceById('nonexistent');

    expect(result).toBeNull();
  });
});

describe('getWorkspaceWithMembers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns workspace with members and counts', async () => {
    mockedPrisma.workspace.findUnique.mockResolvedValue({
      id: 'ws-1',
      name: 'Acme',
      slug: 'acme',
      iconUrl: null,
      ownerId: 'user-1',
      createdAt: new Date('2026-01-01'),
      members: [
        {
          id: 'mem-1',
          workspaceId: 'ws-1',
          userId: 'user-1',
          role: 'OWNER',
          joinedAt: new Date('2026-01-01'),
          user: { id: 'user-1', name: 'Alice', image: null },
        },
        {
          id: 'mem-2',
          workspaceId: 'ws-1',
          userId: 'user-2',
          role: 'MEMBER',
          joinedAt: new Date('2026-01-02'),
          user: { id: 'user-2', name: 'Bob', image: null },
        },
      ],
      _count: { channels: 3, members: 2 },
    });

    const result = await getWorkspaceWithMembers('ws-1');

    expect(result).not.toBeNull();
    expect(result!.members).toHaveLength(2);
    expect(result!.memberCount).toBe(2);
    expect(result!.channelCount).toBe(3);
    expect(result!.members[0].role).toBe('OWNER');
    expect(result!.members[0].user.name).toBe('Alice');
  });

  it('returns null when workspace not found', async () => {
    mockedPrisma.workspace.findUnique.mockResolvedValue(null);

    const result = await getWorkspaceWithMembers('nonexistent');

    expect(result).toBeNull();
  });
});

describe('getMemberRole', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns OWNER role for workspace owner', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({
      role: 'OWNER',
    });

    const result = await getMemberRole('ws-1', 'user-1');

    expect(result).toBe('OWNER');
  });

  it('returns ADMIN role for workspace admin', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({
      role: 'ADMIN',
    });

    const result = await getMemberRole('ws-1', 'user-2');

    expect(result).toBe('ADMIN');
  });

  it('returns MEMBER role for regular member', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({
      role: 'MEMBER',
    });

    const result = await getMemberRole('ws-1', 'user-3');

    expect(result).toBe('MEMBER');
  });

  it('returns null for non-members', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue(null);

    const result = await getMemberRole('ws-1', 'user-non-member');

    expect(result).toBeNull();
  });

  it('uses compound key for lookup', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue(null);

    await getMemberRole('ws-1', 'user-1');

    expect(mockedPrisma.workspaceMember.findUnique).toHaveBeenCalledWith({
      where: {
        workspaceId_userId: { workspaceId: 'ws-1', userId: 'user-1' },
      },
      select: { role: true },
    });
  });
});

describe('getWorkspaceMembers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns members with user details', async () => {
    mockedPrisma.workspaceMember.findMany.mockResolvedValue([
      {
        id: 'mem-1',
        workspaceId: 'ws-1',
        userId: 'user-1',
        role: 'OWNER',
        joinedAt: new Date('2026-01-01'),
        user: { id: 'user-1', name: 'Alice', image: null },
      },
    ]);

    const result = await getWorkspaceMembers('ws-1');

    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('user-1');
    expect(result[0].role).toBe('OWNER');
    expect(result[0].user.name).toBe('Alice');
  });

  it('returns empty array for workspace with no members', async () => {
    mockedPrisma.workspaceMember.findMany.mockResolvedValue([]);

    const result = await getWorkspaceMembers('ws-empty');

    expect(result).toEqual([]);
  });

  it('orders by role then joinedAt', async () => {
    mockedPrisma.workspaceMember.findMany.mockResolvedValue([]);

    await getWorkspaceMembers('ws-1');

    expect(mockedPrisma.workspaceMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      })
    );
  });
});

describe('isSlugTaken', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns true when slug exists', async () => {
    mockedPrisma.workspace.findUnique.mockResolvedValue({ id: 'ws-1' });

    const result = await isSlugTaken('acme');

    expect(result).toBe(true);
  });

  it('returns false when slug is available', async () => {
    mockedPrisma.workspace.findUnique.mockResolvedValue(null);

    const result = await isSlugTaken('new-workspace');

    expect(result).toBe(false);
  });
});
