/**
 * Tests for members/actions.ts
 *
 * Covers:
 * - updateProfile: updates correct fields, maps displayName→name, handles empty input
 * - updateMemberRole: validates OWNER permission, prevents self-role-change,
 *   prevents assigning OWNER, rejects non-members
 */

jest.mock('@/auth/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    user: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    workspaceMember: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { auth } from '@/auth/auth';
import { prisma } from '@/shared/lib/prisma';
import { updateProfile, updateMemberRole } from '@/members/actions';
import { MemberRole } from '@/shared/types';

const mockedAuth = auth as unknown as jest.Mock;
const mockedPrisma = prisma as unknown as {
  user: {
    findUniqueOrThrow: jest.Mock;
    update: jest.Mock;
  };
  workspaceMember: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
};

const mockProfile = {
  id: 'user-1',
  name: 'Alice',
  email: 'alice@example.com',
  image: null,
  title: 'Engineer',
  statusText: null,
  statusEmoji: null,
  timezone: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('updateProfile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null as any);

    await expect(updateProfile({ displayName: 'New Name' })).rejects.toThrow(
      'Unauthorized'
    );
  });

  it('maps displayName to name field', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any);
    mockedPrisma.user.update.mockResolvedValue(mockProfile);

    await updateProfile({ displayName: 'New Name' });

    expect(mockedPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'New Name' },
      })
    );
  });

  it('updates statusText field', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any);
    mockedPrisma.user.update.mockResolvedValue(mockProfile);

    await updateProfile({ statusText: 'In a meeting' });

    expect(mockedPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { statusText: 'In a meeting' },
      })
    );
  });

  it('updates multiple fields at once', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any);
    mockedPrisma.user.update.mockResolvedValue(mockProfile);

    await updateProfile({
      displayName: 'Bob',
      title: 'CTO',
      statusEmoji: '🎉',
      timezone: 'America/Chicago',
    });

    expect(mockedPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: 'Bob',
          title: 'CTO',
          statusEmoji: '🎉',
          timezone: 'America/Chicago',
        },
      })
    );
  });

  it('returns current profile when no fields to update', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any);
    mockedPrisma.user.findUniqueOrThrow.mockResolvedValue(mockProfile);

    const result = await updateProfile({});

    expect(result).toEqual(mockProfile);
    expect(mockedPrisma.user.update).not.toHaveBeenCalled();
    expect(mockedPrisma.user.findUniqueOrThrow).toHaveBeenCalled();
  });

  it('returns updated profile on success', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any);
    const updatedProfile = { ...mockProfile, name: 'Updated Name' };
    mockedPrisma.user.update.mockResolvedValue(updatedProfile);

    const result = await updateProfile({ displayName: 'Updated Name' });

    expect(result.name).toBe('Updated Name');
  });
});

describe('updateMemberRole', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null as any);

    await expect(
      updateMemberRole('ws-1', 'user-2', MemberRole.ADMIN)
    ).rejects.toThrow('Unauthorized');
  });

  it('throws when current user is not OWNER', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any);
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({
      role: 'MEMBER',
    });

    await expect(
      updateMemberRole('ws-1', 'user-2', MemberRole.ADMIN)
    ).rejects.toThrow('Only workspace owners');
  });

  it('throws when current user is ADMIN (not OWNER)', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any);
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({
      role: 'ADMIN',
    });

    await expect(
      updateMemberRole('ws-1', 'user-2', MemberRole.ADMIN)
    ).rejects.toThrow('Only workspace owners');
  });

  it('throws when current user is not a member', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any);
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue(null);

    await expect(
      updateMemberRole('ws-1', 'user-2', MemberRole.ADMIN)
    ).rejects.toThrow('Only workspace owners');
  });

  it('prevents changing own role', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any);
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({
      role: 'OWNER',
    });

    await expect(
      updateMemberRole('ws-1', 'user-1', MemberRole.ADMIN)
    ).rejects.toThrow('Cannot change your own role');
  });

  it('prevents assigning OWNER role', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any);
    // First call: current user check (OWNER)
    // Second call: target member check
    mockedPrisma.workspaceMember.findUnique
      .mockResolvedValueOnce({ role: 'OWNER' })
      .mockResolvedValueOnce({ role: 'MEMBER' });

    await expect(
      updateMemberRole('ws-1', 'user-2', MemberRole.OWNER)
    ).rejects.toThrow('Cannot assign OWNER role');
  });

  it('throws when target user is not a member', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any);
    mockedPrisma.workspaceMember.findUnique
      .mockResolvedValueOnce({ role: 'OWNER' })
      .mockResolvedValueOnce(null);

    await expect(
      updateMemberRole('ws-1', 'user-2', MemberRole.ADMIN)
    ).rejects.toThrow('Member not found');
  });

  it('successfully updates member role when all checks pass', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any);
    mockedPrisma.workspaceMember.findUnique
      .mockResolvedValueOnce({ role: 'OWNER' })
      .mockResolvedValueOnce({ role: 'MEMBER' });
    mockedPrisma.workspaceMember.update.mockResolvedValue({
      id: 'wm-2',
      workspaceId: 'ws-1',
      userId: 'user-2',
      role: 'ADMIN',
    });

    const result = await updateMemberRole('ws-1', 'user-2', MemberRole.ADMIN);

    expect(result.role).toBe('ADMIN');
    expect(mockedPrisma.workspaceMember.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { role: MemberRole.ADMIN },
      })
    );
  });
});
