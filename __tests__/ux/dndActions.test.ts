/**
 * Tests for members/actions.ts — setDND and getDNDStatus
 *
 * Covers:
 * - setDND: requires auth, updates dndUntil in DB, returns updated UserProfile
 * - setDND with null: clears DND (turns it off)
 * - getDNDStatus: returns null when not authenticated
 * - getDNDStatus: returns null when no DND set
 * - getDNDStatus: returns active dndUntil date
 * - getDNDStatus: auto-expires past dndUntil (clears DB record, returns null)
 */

jest.mock('@/auth/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    user: {
      findUniqueOrThrow: jest.fn(),
      findUnique: jest.fn(),
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
import { setDND, getDNDStatus } from '@/members/actions';

const mockedAuth = auth as unknown as jest.Mock;
const mockedPrisma = prisma as unknown as {
  user: {
    findUniqueOrThrow: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  workspaceMember: { findUnique: jest.Mock; update: jest.Mock };
};

const mockUpdatedProfile = {
  id: 'user-1',
  name: 'Alice',
  email: 'alice@example.com',
  image: null,
  title: null,
  statusText: null,
  statusEmoji: null,
  timezone: null,
  dndUntil: null as Date | null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('setDND', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws Unauthorized when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    const future = new Date(Date.now() + 60_000);
    await expect(setDND(future)).rejects.toThrow('Unauthorized');
  });

  it('throws Unauthorized when session has no user id', async () => {
    mockedAuth.mockResolvedValue({ user: {} });

    const future = new Date(Date.now() + 60_000);
    await expect(setDND(future)).rejects.toThrow('Unauthorized');
  });

  it('updates dndUntil in DB with future date', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    const future = new Date(Date.now() + 3_600_000); // 1 hour
    const updatedProfile = { ...mockUpdatedProfile, dndUntil: future };
    mockedPrisma.user.update.mockResolvedValue(updatedProfile);

    const result = await setDND(future);

    expect(mockedPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ dndUntil: future }),
      })
    );
    expect(result.dndUntil).toEqual(future);
  });

  it('clears dndUntil when called with null', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    const clearedProfile = { ...mockUpdatedProfile, dndUntil: null };
    mockedPrisma.user.update.mockResolvedValue(clearedProfile);

    const result = await setDND(null);

    expect(mockedPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ dndUntil: null }),
      })
    );
    expect(result.dndUntil).toBeNull();
  });

  it('returns full UserProfile on success', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    const future = new Date(Date.now() + 7_200_000); // 2 hours
    const updatedProfile = { ...mockUpdatedProfile, dndUntil: future };
    mockedPrisma.user.update.mockResolvedValue(updatedProfile);

    const result = await setDND(future);

    expect(result).toMatchObject({
      id: 'user-1',
      name: 'Alice',
      email: 'alice@example.com',
    });
  });
});

describe('getDNDStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    const result = await getDNDStatus();
    expect(result).toBeNull();
  });

  it('returns null when user has no dndUntil set', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedPrisma.user.findUnique.mockResolvedValue({ dndUntil: null });

    const result = await getDNDStatus();
    expect(result).toBeNull();
  });

  it('returns null when user record not found', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedPrisma.user.findUnique.mockResolvedValue(null);

    const result = await getDNDStatus();
    expect(result).toBeNull();
  });

  it('returns the active dndUntil date when DND is set in the future', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    const future = new Date(Date.now() + 3_600_000);
    mockedPrisma.user.findUnique.mockResolvedValue({ dndUntil: future });

    const result = await getDNDStatus();
    expect(result).toEqual(future);
  });

  it('auto-expires past dndUntil: clears DB record and returns null', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    const past = new Date(Date.now() - 1_000); // 1 second ago
    mockedPrisma.user.findUnique.mockResolvedValue({ dndUntil: past });
    mockedPrisma.user.update.mockResolvedValue({});

    const result = await getDNDStatus();

    // Should clear the record
    expect(mockedPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { dndUntil: null },
      })
    );
    // Should return null (expired)
    expect(result).toBeNull();
  });
});
