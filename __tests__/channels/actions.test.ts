/**
 * Tests for channels/actions.ts
 *
 * Covers:
 * - createChannel: validates unique name, creates channel + adds creator
 * - joinChannel: only works for PUBLIC channels
 * - leaveChannel: prevents leaving DM channels
 * - openDM: reuses existing DM channel, creates new if none exists
 * - archiveChannel: validates permission (creator or admin)
 * - updateChannel: validates membership, name uniqueness
 * - addChannelMember: validates inviter membership
 * - removeChannelMember: validates creator/admin permission
 */

// Mock auth
jest.mock('@/auth/auth', () => ({
  auth: jest.fn(),
}));

// Mock prisma
jest.mock('@/shared/lib/prisma', () => {
  const mockTx = {
    channel: { create: jest.fn() },
    channelMember: { create: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
  };
  return {
    prisma: {
      channel: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      channelMember: {
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      workspaceMember: {
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((fn: Function) => fn(mockTx)),
      __mockTx: mockTx,
    },
  };
});

// Mock channel queries
jest.mock('@/channels/queries', () => ({
  isChannelNameUnique: jest.fn(),
  isChannelMember: jest.fn(),
  getDMChannel: jest.fn(),
}));

// Mock utils
jest.mock('@/shared/lib/utils', () => ({
  channelSlug: jest.fn((name: string) =>
    name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  ),
}));

// Mock socket emitter
jest.mock('@/server/socket-emitter', () => ({
  emitToWorkspace: jest.fn(),
  emitToChannel: jest.fn(),
}));

import { auth } from '@/auth/auth';
import { prisma } from '@/shared/lib/prisma';
import { isChannelNameUnique, isChannelMember, getDMChannel } from '@/channels/queries';
import { emitToWorkspace, emitToChannel } from '@/server/socket-emitter';
import {
  createChannel,
  joinChannel,
  leaveChannel,
  openDM,
  archiveChannel,
  updateChannel,
  addChannelMember,
  removeChannelMember,
} from '@/channels/actions';
import { ChannelType } from '@/shared/types';

const mockedAuth = auth as jest.MockedFunction<typeof auth>;
const mockedPrisma = prisma as any;
const mockTx = mockedPrisma.__mockTx;
const mockedIsNameUnique = isChannelNameUnique as jest.MockedFunction<typeof isChannelNameUnique>;
const mockedIsChannelMember = isChannelMember as jest.MockedFunction<typeof isChannelMember>;
const mockedGetDMChannel = getDMChannel as jest.MockedFunction<typeof getDMChannel>;

function mockSession(userId: string) {
  (mockedAuth as jest.Mock).mockResolvedValue({
    user: { id: userId, name: 'Test', email: 'test@test.com' },
  });
}

describe('createChannel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession('user-1');
  });

  it('creates a channel and adds creator as member', async () => {
    // workspace member check
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ id: 'mem-1' });
    mockedIsNameUnique.mockResolvedValue(true);

    const newChannel = {
      id: 'ch-new',
      workspaceId: 'ws-1',
      name: 'engineering',
      description: null,
      type: 'PUBLIC',
      isArchived: false,
      createdById: 'user-1',
      createdAt: new Date(),
    };
    mockTx.channel.create.mockResolvedValue(newChannel);
    mockTx.channelMember.create.mockResolvedValue({});

    const result = await createChannel('ws-1', {
      name: 'Engineering',
      type: ChannelType.PUBLIC,
    });

    expect(result.id).toBe('ch-new');
    expect(result.name).toBe('engineering');
    expect(mockTx.channelMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channelId: 'ch-new',
          userId: 'user-1',
        }),
      })
    );
  });

  it('throws when name already exists', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ id: 'mem-1' });
    mockedIsNameUnique.mockResolvedValue(false);

    await expect(
      createChannel('ws-1', { name: 'general', type: ChannelType.PUBLIC })
    ).rejects.toThrow('already exists');
  });

  it('throws for invalid channel type (DM)', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ id: 'mem-1' });

    await expect(
      createChannel('ws-1', { name: 'test', type: 'DM' as any })
    ).rejects.toThrow('must be PUBLIC or PRIVATE');
  });

  it('throws when user is not workspace member', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue(null);

    await expect(
      createChannel('ws-1', { name: 'test', type: ChannelType.PUBLIC })
    ).rejects.toThrow('Not a member');
  });

  it('throws when name is empty', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ id: 'mem-1' });

    await expect(
      createChannel('ws-1', { name: '', type: ChannelType.PUBLIC })
    ).rejects.toThrow('Channel name is required');
  });

  it('normalizes channel name with channelSlug', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ id: 'mem-1' });
    mockedIsNameUnique.mockResolvedValue(true);
    mockTx.channel.create.mockResolvedValue({
      id: 'ch-new',
      workspaceId: 'ws-1',
      name: 'my-channel',
      description: null,
      type: 'PUBLIC',
      isArchived: false,
      createdById: 'user-1',
      createdAt: new Date(),
    });
    mockTx.channelMember.create.mockResolvedValue({});

    const result = await createChannel('ws-1', { name: 'My Channel', type: ChannelType.PUBLIC });

    expect(result.name).toBe('my-channel');
  });
});

describe('joinChannel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession('user-1');
  });

  it('joins a PUBLIC channel', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      type: 'PUBLIC',
      isArchived: false,
    });
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ id: 'mem-1' });
    mockedPrisma.channelMember.findUnique.mockResolvedValue(null);
    mockedPrisma.channelMember.create.mockResolvedValue({});
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Alice',
      image: null,
    });

    await joinChannel('ch-1');

    expect(mockedPrisma.channelMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channelId: 'ch-1',
        userId: 'user-1',
      }),
    });
  });

  it('is a no-op when already a member', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      type: 'PUBLIC',
      isArchived: false,
    });
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ id: 'mem-1' });
    mockedPrisma.channelMember.findUnique.mockResolvedValue({ id: 'cm-1' });

    await joinChannel('ch-1');

    expect(mockedPrisma.channelMember.create).not.toHaveBeenCalled();
  });

  it('throws for PRIVATE channels', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      type: 'PRIVATE',
      isArchived: false,
    });

    await expect(joinChannel('ch-1')).rejects.toThrow('Can only join public channels');
  });

  it('throws for archived channels', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      type: 'PUBLIC',
      isArchived: true,
    });

    await expect(joinChannel('ch-1')).rejects.toThrow('Cannot join an archived channel');
  });

  it('throws when channel not found', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue(null);

    await expect(joinChannel('ch-nonexist')).rejects.toThrow('Channel not found');
  });
});

describe('leaveChannel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession('user-1');
  });

  it('leaves a channel', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      type: 'PUBLIC',
    });
    mockedPrisma.channelMember.findUnique.mockResolvedValue({ id: 'cm-1' });
    mockedPrisma.channelMember.delete.mockResolvedValue({});

    await leaveChannel('ch-1');

    expect(mockedPrisma.channelMember.delete).toHaveBeenCalledWith({
      where: { id: 'cm-1' },
    });
  });

  it('throws when trying to leave a DM channel', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-dm',
      workspaceId: 'ws-1',
      type: 'DM',
    });

    await expect(leaveChannel('ch-dm')).rejects.toThrow('Cannot leave a DM channel');
  });

  it('throws when trying to leave a GROUP_DM channel', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-gdm',
      workspaceId: 'ws-1',
      type: 'GROUP_DM',
    });

    await expect(leaveChannel('ch-gdm')).rejects.toThrow('Cannot leave a DM channel');
  });

  it('throws when not a member', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      type: 'PUBLIC',
    });
    mockedPrisma.channelMember.findUnique.mockResolvedValue(null);

    await expect(leaveChannel('ch-1')).rejects.toThrow('not a member');
  });
});

describe('openDM', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession('user-1');
  });

  it('reuses existing DM channel', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ id: 'mem' });
    mockedGetDMChannel.mockResolvedValue('ch-existing');

    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-existing',
      workspaceId: 'ws-1',
      name: 'dm-user1-user2',
      description: null,
      type: 'DM',
      isArchived: false,
      createdById: 'user-1',
      createdAt: new Date(),
    });

    const result = await openDM('ws-1', 'user-2');

    expect(result.id).toBe('ch-existing');
    expect(result.type).toBe('DM');
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates new DM when none exists', async () => {
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ id: 'mem' });
    mockedGetDMChannel.mockResolvedValue(null);

    mockedPrisma.user.findUnique
      .mockResolvedValueOnce({ name: 'Bob' })
      .mockResolvedValueOnce({ name: 'Alice' });

    const newChannel = {
      id: 'ch-new-dm',
      workspaceId: 'ws-1',
      name: 'dm-user-1-user-2',
      description: null,
      type: 'DM',
      isArchived: false,
      createdById: 'user-1',
      createdAt: new Date(),
    };
    mockTx.channel.create.mockResolvedValue(newChannel);
    mockTx.channelMember.create.mockResolvedValue({});

    const result = await openDM('ws-1', 'user-2');

    expect(result.id).toBe('ch-new-dm');
    expect(result.type).toBe('DM');
    expect(mockedPrisma.$transaction).toHaveBeenCalled();
    // Both users added as members
    expect(mockTx.channelMember.create).toHaveBeenCalledTimes(2);
  });

  it('throws when trying to DM yourself', async () => {
    await expect(openDM('ws-1', 'user-1')).rejects.toThrow('Cannot create a DM with yourself');
  });

  it('throws when target is not a workspace member', async () => {
    mockedPrisma.workspaceMember.findUnique
      .mockResolvedValueOnce({ id: 'mem-1' })  // current user
      .mockResolvedValueOnce(null);              // target user not a member

    await expect(openDM('ws-1', 'user-nonmember')).rejects.toThrow('Not a member');
  });
});

describe('archiveChannel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession('user-1');
  });

  it('archives channel when user is creator', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      createdById: 'user-1',
    });
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ role: 'MEMBER' });

    mockedPrisma.channel.update.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      name: 'general',
      description: null,
      type: 'PUBLIC',
      isArchived: true,
      createdById: 'user-1',
      createdAt: new Date(),
    });

    const result = await archiveChannel('ch-1');

    expect(result.isArchived).toBe(true);
  });

  it('archives channel when user is workspace admin', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      createdById: 'user-other',
    });
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ role: 'ADMIN' });

    mockedPrisma.channel.update.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      name: 'test',
      description: null,
      type: 'PUBLIC',
      isArchived: true,
      createdById: 'user-other',
      createdAt: new Date(),
    });

    const result = await archiveChannel('ch-1');

    expect(result.isArchived).toBe(true);
  });

  it('throws when user is not creator and not admin', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      createdById: 'user-other',
    });
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ role: 'MEMBER' });

    await expect(archiveChannel('ch-1')).rejects.toThrow('Only the channel creator or workspace admin');
  });
});

describe('updateChannel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession('user-1');
  });

  it('updates channel name and validates uniqueness', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
    });
    mockedIsChannelMember.mockResolvedValue(true);
    mockedIsNameUnique.mockResolvedValue(true);

    mockedPrisma.channel.update.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      name: 'new-name',
      description: null,
      type: 'PUBLIC',
      isArchived: false,
      createdById: 'user-1',
      createdAt: new Date(),
    });

    const result = await updateChannel('ch-1', { name: 'New Name' });

    expect(result.name).toBe('new-name');
  });

  it('throws when name already taken', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
    });
    mockedIsChannelMember.mockResolvedValue(true);
    mockedIsNameUnique.mockResolvedValue(false);

    await expect(
      updateChannel('ch-1', { name: 'taken-name' })
    ).rejects.toThrow('already exists');
  });

  it('throws when user is not a channel member', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
    });
    mockedIsChannelMember.mockResolvedValue(false);

    await expect(
      updateChannel('ch-1', { name: 'test' })
    ).rejects.toThrow('not a member');
  });
});

describe('addChannelMember', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession('user-1');
  });

  it('adds member when inviter is a channel member', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      isArchived: false,
    });
    mockedIsChannelMember.mockResolvedValue(true);
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ id: 'mem' });
    mockedPrisma.channelMember.findUnique.mockResolvedValue(null);
    mockedPrisma.channelMember.create.mockResolvedValue({});
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 'user-2',
      name: 'Bob',
      image: null,
    });

    await addChannelMember('ch-1', 'user-2');

    expect(mockedPrisma.channelMember.create).toHaveBeenCalledWith({
      data: { channelId: 'ch-1', userId: 'user-2' },
    });
  });

  it('is a no-op when already a member', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      isArchived: false,
    });
    mockedIsChannelMember.mockResolvedValue(true);
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ id: 'mem' });
    mockedPrisma.channelMember.findUnique.mockResolvedValue({ id: 'existing' });

    await addChannelMember('ch-1', 'user-2');

    expect(mockedPrisma.channelMember.create).not.toHaveBeenCalled();
  });

  it('throws for archived channel', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      isArchived: true,
    });

    await expect(addChannelMember('ch-1', 'user-2')).rejects.toThrow('archived');
  });

  it('throws when inviter is not a member', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      isArchived: false,
    });
    mockedIsChannelMember.mockResolvedValue(false);

    await expect(addChannelMember('ch-1', 'user-2')).rejects.toThrow('must be a member');
  });
});

describe('removeChannelMember', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession('user-1');
  });

  it('removes member when user is channel creator', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      createdById: 'user-1',
    });
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
    mockedPrisma.channelMember.findUnique.mockResolvedValue({ id: 'cm-2' });
    mockedPrisma.channelMember.delete.mockResolvedValue({});

    await removeChannelMember('ch-1', 'user-2');

    expect(mockedPrisma.channelMember.delete).toHaveBeenCalledWith({
      where: { id: 'cm-2' },
    });
  });

  it('throws when user is neither creator nor admin', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      createdById: 'user-other',
    });
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ role: 'MEMBER' });

    await expect(
      removeChannelMember('ch-1', 'user-2')
    ).rejects.toThrow('Only the channel creator or workspace admin');
  });

  it('throws when target is not a channel member', async () => {
    mockedPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      createdById: 'user-1',
    });
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ role: 'OWNER' });
    mockedPrisma.channelMember.findUnique.mockResolvedValue(null);

    await expect(
      removeChannelMember('ch-1', 'user-nonmember')
    ).rejects.toThrow('not a member');
  });
});
