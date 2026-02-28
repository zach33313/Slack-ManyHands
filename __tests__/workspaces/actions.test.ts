/**
 * Tests for workspaces/actions.ts
 *
 * Covers:
 * - createWorkspace: creates workspace + default channels + OWNER membership
 * - updateWorkspace: validates ADMIN+ permission
 * - deleteWorkspace: validates OWNER role
 * - inviteMember: creates member + adds to default channels
 * - removeMember: prevents removing last OWNER
 * - updateMemberRole: validates OWNER permission, prevents demoting last OWNER
 */

// Mock next/cache revalidatePath
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

// Mock auth middleware
jest.mock('@/auth/middleware', () => ({
  requireAuth: jest.fn(),
  AuthError: class AuthError extends Error {
    public readonly status: number;
    constructor(message = 'Unauthorized', status = 401) {
      super(message);
      this.name = 'AuthError';
      this.status = status;
    }
  },
}));

// Mock prisma
jest.mock('@/shared/lib/prisma', () => {
  const mockTx = {
    workspace: { create: jest.fn() },
    workspaceMember: { create: jest.fn(), delete: jest.fn() },
    channel: { create: jest.fn(), findMany: jest.fn() },
    channelMember: { create: jest.fn(), deleteMany: jest.fn() },
  };
  return {
    prisma: {
      workspace: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      workspaceMember: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      channel: {
        findMany: jest.fn(),
      },
      channelMember: {
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((fn: Function) => fn(mockTx)),
      __mockTx: mockTx,
    },
  };
});

// Mock shared utils
jest.mock('@/shared/lib/utils', () => ({
  slugify: jest.fn((s: string) => s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')),
}));

// Mock constants
jest.mock('@/shared/lib/constants', () => ({
  DEFAULT_CHANNELS: ['general', 'random'],
  hasPermission: jest.fn((role: string, required: string) => {
    const hierarchy = ['MEMBER', 'ADMIN', 'OWNER'];
    return hierarchy.indexOf(role) >= hierarchy.indexOf(required);
  }),
}));

import { prisma } from '@/shared/lib/prisma';
import { requireAuth } from '@/auth/middleware';
import { hasPermission } from '@/shared/lib/constants';
import { slugify } from '@/shared/lib/utils';
import {
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  inviteMember,
  removeMember,
  updateMemberRole,
} from '@/workspaces/actions';
import { MemberRole, ChannelType } from '@/shared/types';

const mockedPrisma = prisma as any;
const mockedRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
const mockTx = mockedPrisma.__mockTx;

function mockSession(userId: string) {
  mockedRequireAuth.mockResolvedValue({
    user: { id: userId, name: 'Test', email: 'test@test.com' },
    expires: '2027-01-01',
  } as any);
}

describe('createWorkspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession('user-1');
  });

  it('creates workspace with owner membership and default channels', async () => {
    mockedPrisma.workspace.findUnique.mockResolvedValue(null); // slug not taken

    const createdWs = {
      id: 'ws-new',
      name: 'Test Workspace',
      slug: 'test-workspace',
      iconUrl: null,
      ownerId: 'user-1',
      createdAt: new Date(),
    };
    mockTx.workspace.create.mockResolvedValue(createdWs);
    mockTx.workspaceMember.create.mockResolvedValue({});
    mockTx.channel.create
      .mockResolvedValueOnce({ id: 'ch-general' })
      .mockResolvedValueOnce({ id: 'ch-random' });
    mockTx.channelMember.create.mockResolvedValue({});

    const result = await createWorkspace('Test Workspace', 'test-workspace');

    expect(result.id).toBe('ws-new');
    expect(result.name).toBe('Test Workspace');

    // Owner membership created
    expect(mockTx.workspaceMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        role: MemberRole.OWNER,
      }),
    });

    // Default channels created
    expect(mockTx.channel.create).toHaveBeenCalledTimes(2);

    // Owner added to each default channel
    expect(mockTx.channelMember.create).toHaveBeenCalledTimes(2);
  });

  it('throws when slug is already taken', async () => {
    mockedPrisma.workspace.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      createWorkspace('Test', 'taken-slug')
    ).rejects.toThrow('already exists');
  });

  it('throws when slug is empty after normalization', async () => {
    (slugify as jest.Mock).mockReturnValueOnce('');

    await expect(
      createWorkspace('!!!', '!!!')
    ).rejects.toThrow('Invalid slug');
  });

  it('requires authentication', async () => {
    mockedRequireAuth.mockRejectedValue(new Error('Unauthorized'));

    await expect(
      createWorkspace('Test', 'test')
    ).rejects.toThrow('Unauthorized');
  });
});

describe('updateWorkspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession('user-1');
  });

  it('updates workspace when user is ADMIN', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ role: 'ADMIN' });
    (hasPermission as jest.Mock).mockReturnValue(true);

    mockedPrisma.workspace.update.mockResolvedValue({
      id: 'ws-1',
      name: 'Updated Name',
      slug: 'updated',
      iconUrl: null,
      ownerId: 'user-1',
      createdAt: new Date(),
    });

    const result = await updateWorkspace('ws-1', { name: 'Updated Name' });

    expect(result.name).toBe('Updated Name');
  });

  it('throws when user is not a member', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue(null);

    await expect(
      updateWorkspace('ws-1', { name: 'test' })
    ).rejects.toThrow('not a member');
  });

  it('throws when user is MEMBER (not ADMIN+)', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
    (hasPermission as jest.Mock).mockReturnValue(false);

    await expect(
      updateWorkspace('ws-1', { name: 'test' })
    ).rejects.toThrow('Only workspace owners and admins');
  });

  it('validates slug uniqueness when updating slug', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ role: 'OWNER' });
    (hasPermission as jest.Mock).mockReturnValue(true);
    mockedPrisma.workspace.findFirst.mockResolvedValue({ id: 'other-ws' });

    await expect(
      updateWorkspace('ws-1', { slug: 'taken-slug' })
    ).rejects.toThrow('already exists');
  });
});

describe('deleteWorkspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession('user-1');
  });

  it('deletes workspace when user is OWNER', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ role: MemberRole.OWNER });
    mockedPrisma.workspace.delete.mockResolvedValue({});

    await deleteWorkspace('ws-1');

    expect(mockedPrisma.workspace.delete).toHaveBeenCalledWith({ where: { id: 'ws-1' } });
  });

  it('throws when user is ADMIN (not OWNER)', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ role: 'ADMIN' });

    await expect(deleteWorkspace('ws-1')).rejects.toThrow('Only workspace owners');
  });

  it('throws when user is not a member', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue(null);

    await expect(deleteWorkspace('ws-1')).rejects.toThrow('not a member');
  });
});

describe('inviteMember', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession('user-1');
  });

  it('invites a user and adds to default channels', async () => {
    // Inviter is ADMIN
    mockedPrisma.workspaceMember.findUnique
      .mockResolvedValueOnce({ role: 'ADMIN' })   // inviter
      .mockResolvedValueOnce(null);                 // target not yet member

    (hasPermission as jest.Mock).mockReturnValue(true);

    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 'user-2',
      name: 'Bob',
      image: null,
    });

    const createdMember = {
      id: 'mem-new',
      workspaceId: 'ws-1',
      userId: 'user-2',
      role: 'MEMBER',
      joinedAt: new Date(),
    };
    mockTx.workspaceMember.create.mockResolvedValue(createdMember);
    mockTx.channel.findMany.mockResolvedValue([
      { id: 'ch-general' },
      { id: 'ch-random' },
    ]);
    mockTx.channelMember.create.mockResolvedValue({});

    const result = await inviteMember('ws-1', 'bob@test.com');

    expect(result.userId).toBe('user-2');
    expect(result.role).toBe('MEMBER');
    expect(result.user.name).toBe('Bob');

    // Added to default channels
    expect(mockTx.channelMember.create).toHaveBeenCalledTimes(2);
  });

  it('throws when user email not found', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValueOnce({ role: 'ADMIN' });
    (hasPermission as jest.Mock).mockReturnValue(true);
    mockedPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      inviteMember('ws-1', 'nobody@test.com')
    ).rejects.toThrow('No user found');
  });

  it('throws when target is already a member', async () => {
    mockedPrisma.workspaceMember.findUnique
      .mockResolvedValueOnce({ role: 'ADMIN' })   // inviter
      .mockResolvedValueOnce({ id: 'existing' });  // target already member

    (hasPermission as jest.Mock).mockReturnValue(true);
    mockedPrisma.user.findUnique.mockResolvedValue({ id: 'user-2' });

    await expect(
      inviteMember('ws-1', 'bob@test.com')
    ).rejects.toThrow('already a member');
  });

  it('throws when inviter is MEMBER (not ADMIN+)', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValueOnce({ role: 'MEMBER' });
    (hasPermission as jest.Mock).mockReturnValue(false);

    await expect(
      inviteMember('ws-1', 'bob@test.com')
    ).rejects.toThrow('Only workspace owners and admins');
  });

  it('prevents non-OWNER from inviting as OWNER', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValueOnce({ role: 'ADMIN' });
    (hasPermission as jest.Mock).mockReturnValue(true);

    await expect(
      inviteMember('ws-1', 'bob@test.com', MemberRole.OWNER)
    ).rejects.toThrow('Only workspace owners can invite new owners');
  });
});

describe('removeMember', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession('user-1');
  });

  it('removes a member from workspace and channels', async () => {
    // Remover is ADMIN
    mockedPrisma.workspaceMember.findUnique
      .mockResolvedValueOnce({ role: 'ADMIN' })    // remover
      .mockResolvedValueOnce({ role: 'MEMBER' });   // target

    (hasPermission as jest.Mock).mockReturnValue(true);

    mockTx.channel.findMany.mockResolvedValue([{ id: 'ch-1' }, { id: 'ch-2' }]);
    mockTx.channelMember.deleteMany.mockResolvedValue({});

    await removeMember('ws-1', 'user-2');

    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });

  it('prevents removing the last OWNER', async () => {
    mockedPrisma.workspaceMember.findUnique
      .mockResolvedValueOnce({ role: 'OWNER' })    // remover
      .mockResolvedValueOnce({ role: 'OWNER' });   // target is also OWNER

    (hasPermission as jest.Mock).mockReturnValue(true);
    mockedPrisma.workspaceMember.count.mockResolvedValue(1);

    await expect(
      removeMember('ws-1', 'user-2')
    ).rejects.toThrow('Cannot remove the last owner');
  });

  it('allows removing one OWNER when multiple exist', async () => {
    mockedPrisma.workspaceMember.findUnique
      .mockResolvedValueOnce({ role: 'OWNER' })    // remover
      .mockResolvedValueOnce({ role: 'OWNER' });   // target

    (hasPermission as jest.Mock).mockReturnValue(true);
    mockedPrisma.workspaceMember.count.mockResolvedValue(2);

    mockTx.channel.findMany.mockResolvedValue([]);
    mockTx.channelMember.deleteMany.mockResolvedValue({});

    await removeMember('ws-1', 'user-2');

    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });

  it('prevents ADMIN from removing OWNER', async () => {
    mockedPrisma.workspaceMember.findUnique
      .mockResolvedValueOnce({ role: 'ADMIN' })    // remover
      .mockResolvedValueOnce({ role: 'OWNER' });   // target

    (hasPermission as jest.Mock).mockReturnValue(true);

    await expect(
      removeMember('ws-1', 'user-2')
    ).rejects.toThrow('Only workspace owners can remove other owners');
  });

  it('throws when remover is not a member', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValueOnce(null);

    await expect(
      removeMember('ws-1', 'user-2')
    ).rejects.toThrow('not a member');
  });

  it('throws when target is not a member', async () => {
    mockedPrisma.workspaceMember.findUnique
      .mockResolvedValueOnce({ role: 'ADMIN' })
      .mockResolvedValueOnce(null);

    (hasPermission as jest.Mock).mockReturnValue(true);

    await expect(
      removeMember('ws-1', 'user-nonexist')
    ).rejects.toThrow('not a member');
  });
});

describe('updateMemberRole', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession('user-1');
  });

  it('updates role when changer is OWNER', async () => {
    mockedPrisma.workspaceMember.findUnique
      .mockResolvedValueOnce({ role: MemberRole.OWNER })          // changer
      .mockResolvedValueOnce({ id: 'mem-2', role: 'MEMBER' });    // target

    mockedPrisma.workspaceMember.update.mockResolvedValue({
      id: 'mem-2',
      workspaceId: 'ws-1',
      userId: 'user-2',
      role: 'ADMIN',
      joinedAt: new Date(),
      user: { id: 'user-2', name: 'Bob', image: null },
    });

    const result = await updateMemberRole('ws-1', 'user-2', MemberRole.ADMIN);

    expect(result.role).toBe('ADMIN');
  });

  it('throws when changer is not OWNER', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValueOnce({ role: 'ADMIN' });

    await expect(
      updateMemberRole('ws-1', 'user-2', MemberRole.ADMIN)
    ).rejects.toThrow('Only workspace owners can change member roles');
  });

  it('prevents demoting the last OWNER', async () => {
    mockedPrisma.workspaceMember.findUnique
      .mockResolvedValueOnce({ role: MemberRole.OWNER })          // changer (self)
      .mockResolvedValueOnce({ id: 'mem-1', role: MemberRole.OWNER }); // target (self)

    mockedPrisma.workspaceMember.count.mockResolvedValue(1);

    await expect(
      updateMemberRole('ws-1', 'user-1', MemberRole.ADMIN)
    ).rejects.toThrow('Cannot demote the last owner');
  });

  it('allows demoting OWNER when multiple exist', async () => {
    mockedPrisma.workspaceMember.findUnique
      .mockResolvedValueOnce({ role: MemberRole.OWNER })          // changer
      .mockResolvedValueOnce({ id: 'mem-1', role: MemberRole.OWNER }); // target (self)

    mockedPrisma.workspaceMember.count.mockResolvedValue(2);
    mockedPrisma.workspaceMember.update.mockResolvedValue({
      id: 'mem-1',
      workspaceId: 'ws-1',
      userId: 'user-1',
      role: 'ADMIN',
      joinedAt: new Date(),
      user: { id: 'user-1', name: 'Alice', image: null },
    });

    const result = await updateMemberRole('ws-1', 'user-1', MemberRole.ADMIN);

    expect(result.role).toBe('ADMIN');
  });

  it('throws when target is not a member', async () => {
    mockedPrisma.workspaceMember.findUnique
      .mockResolvedValueOnce({ role: MemberRole.OWNER })
      .mockResolvedValueOnce(null);

    await expect(
      updateMemberRole('ws-1', 'user-nonexist', MemberRole.ADMIN)
    ).rejects.toThrow('not a member');
  });
});
