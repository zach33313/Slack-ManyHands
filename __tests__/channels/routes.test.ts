/**
 * Tests for channel API routes
 *
 * Covers:
 * - GET /api/channels/[channelId] — returns channel, checks access
 * - PATCH /api/channels/[channelId] — updates channel
 * - DELETE /api/channels/[channelId] — archives channel
 * - GET /api/channels/[channelId]/members — lists members
 * - POST /api/channels/[channelId]/members — join/add member
 * - DELETE /api/channels/[channelId]/members — leave/remove member
 */

// Mock auth
jest.mock('@/auth/auth', () => ({
  auth: jest.fn(),
}));

// Mock prisma
jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    channel: {
      findUnique: jest.fn(),
    },
  },
}));

// Mock channel queries
jest.mock('@/channels/queries', () => ({
  getChannelById: jest.fn(),
  isChannelMember: jest.fn(),
  getChannelMembers: jest.fn(),
}));

// Mock channel actions
jest.mock('@/channels/actions', () => ({
  updateChannel: jest.fn(),
  archiveChannel: jest.fn(),
  joinChannel: jest.fn(),
  leaveChannel: jest.fn(),
  addChannelMember: jest.fn(),
  removeChannelMember: jest.fn(),
}));

import { auth } from '@/auth/auth';
import { prisma } from '@/shared/lib/prisma';
import { getChannelById, isChannelMember, getChannelMembers } from '@/channels/queries';
import { updateChannel, archiveChannel, joinChannel, leaveChannel, addChannelMember, removeChannelMember } from '@/channels/actions';

const mockedAuth = auth as jest.MockedFunction<typeof auth>;
const mockedPrisma = prisma as any;

function mockSession(userId: string) {
  (mockedAuth as jest.Mock).mockResolvedValue({
    user: { id: userId, name: 'Test', email: 'test@test.com' },
  });
}

function noSession() {
  (mockedAuth as jest.Mock).mockResolvedValue(null);
}

function createRequest(url: string, options?: RequestInit): Request {
  return new Request(`http://localhost:3000${url}`, options);
}

const params = (channelId: string) => ({
  params: Promise.resolve({ channelId }),
});

describe('GET /api/channels/[channelId]', () => {
  let GET: Function;

  beforeAll(async () => {
    const mod = await import('@/app/api/channels/[channelId]/route');
    GET = mod.GET;
  });

  beforeEach(() => jest.clearAllMocks());

  it('returns channel for authenticated member', async () => {
    mockSession('user-1');
    (getChannelById as jest.Mock).mockResolvedValue({
      id: 'ch-1',
      name: 'general',
      type: 'PUBLIC',
      memberCount: 5,
    });

    const req = createRequest('/api/channels/ch-1');
    const res = await GET(req, params('ch-1'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.data.name).toBe('general');
  });

  it('returns 401 for unauthenticated', async () => {
    noSession();

    const req = createRequest('/api/channels/ch-1');
    const res = await GET(req, params('ch-1'));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.code).toBe('UNAUTHORIZED');
  });

  it('returns 404 for non-existent channel', async () => {
    mockSession('user-1');
    (getChannelById as jest.Mock).mockResolvedValue(null);

    const req = createRequest('/api/channels/ch-none');
    const res = await GET(req, params('ch-none'));
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.code).toBe('NOT_FOUND');
  });

  it('returns 403 for non-member on private channel', async () => {
    mockSession('user-1');
    (getChannelById as jest.Mock).mockResolvedValue({
      id: 'ch-1',
      name: 'secret',
      type: 'PRIVATE',
    });
    (isChannelMember as jest.Mock).mockResolvedValue(false);

    const req = createRequest('/api/channels/ch-1');
    const res = await GET(req, params('ch-1'));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.code).toBe('FORBIDDEN');
  });

  it('allows access to public channel for non-member', async () => {
    mockSession('user-1');
    (getChannelById as jest.Mock).mockResolvedValue({
      id: 'ch-1',
      name: 'general',
      type: 'PUBLIC',
    });

    const req = createRequest('/api/channels/ch-1');
    const res = await GET(req, params('ch-1'));
    const data = await res.json();

    expect(res.status).toBe(200);
    // isChannelMember should NOT be called for PUBLIC channels
    expect(isChannelMember).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/channels/[channelId]', () => {
  let PATCH: Function;

  beforeAll(async () => {
    const mod = await import('@/app/api/channels/[channelId]/route');
    PATCH = mod.PATCH;
  });

  beforeEach(() => jest.clearAllMocks());

  it('updates channel with valid input', async () => {
    mockSession('user-1');
    (updateChannel as jest.Mock).mockResolvedValue({
      id: 'ch-1',
      name: 'updated',
      description: 'new desc',
      type: 'PUBLIC',
    });

    const req = createRequest('/api/channels/ch-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'updated', description: 'new desc' }),
    });

    const res = await PATCH(req, params('ch-1'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.data.name).toBe('updated');
  });

  it('returns 401 for unauthenticated', async () => {
    noSession();

    const req = createRequest('/api/channels/ch-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test' }),
    });

    const res = await PATCH(req, params('ch-1'));
    const data = await res.json();

    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid body', async () => {
    mockSession('user-1');

    const req = createRequest('/api/channels/ch-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not json',
    });

    const res = await PATCH(req, params('ch-1'));
    const data = await res.json();

    expect(res.status).toBe(400);
  });

  it('returns 409 when name already exists', async () => {
    mockSession('user-1');
    (updateChannel as jest.Mock).mockRejectedValue(new Error('A channel named "taken" already exists'));

    const req = createRequest('/api/channels/ch-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'taken' }),
    });

    const res = await PATCH(req, params('ch-1'));
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.code).toBe('CONFLICT');
  });

  it('returns 403 when not a channel member', async () => {
    mockSession('user-1');
    (updateChannel as jest.Mock).mockRejectedValue(new Error('You are not a member of this channel'));

    const req = createRequest('/api/channels/ch-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test' }),
    });

    const res = await PATCH(req, params('ch-1'));
    const data = await res.json();

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/channels/[channelId]', () => {
  let DELETE: Function;

  beforeAll(async () => {
    const mod = await import('@/app/api/channels/[channelId]/route');
    DELETE = mod.DELETE;
  });

  beforeEach(() => jest.clearAllMocks());

  it('archives channel successfully', async () => {
    mockSession('user-1');
    (archiveChannel as jest.Mock).mockResolvedValue({
      id: 'ch-1',
      name: 'general',
      isArchived: true,
    });

    const req = createRequest('/api/channels/ch-1');
    const res = await DELETE(req, params('ch-1'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.data.isArchived).toBe(true);
  });

  it('returns 403 when not creator or admin', async () => {
    mockSession('user-1');
    (archiveChannel as jest.Mock).mockRejectedValue(
      new Error('Only the channel creator or workspace admin can archive this channel')
    );

    const req = createRequest('/api/channels/ch-1');
    const res = await DELETE(req, params('ch-1'));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.code).toBe('FORBIDDEN');
  });
});

describe('GET /api/channels/[channelId]/members', () => {
  let membersGET: Function;

  beforeAll(async () => {
    const mod = await import('@/app/api/channels/[channelId]/members/route');
    membersGET = mod.GET;
  });

  beforeEach(() => jest.clearAllMocks());

  it('returns members for public channel', async () => {
    mockSession('user-1');
    mockedPrisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', type: 'PUBLIC' });
    (getChannelMembers as jest.Mock).mockResolvedValue([
      { id: 'cm-1', userId: 'user-1', user: { id: 'user-1', name: 'Alice', image: null } },
    ]);

    const req = createRequest('/api/channels/ch-1/members');
    const res = await membersGET(req, params('ch-1'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.data).toHaveLength(1);
  });

  it('returns 403 for non-member on private channel', async () => {
    mockSession('user-1');
    mockedPrisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', type: 'PRIVATE' });
    (isChannelMember as jest.Mock).mockResolvedValue(false);

    const req = createRequest('/api/channels/ch-1/members');
    const res = await membersGET(req, params('ch-1'));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.code).toBe('FORBIDDEN');
  });

  it('returns 404 for non-existent channel', async () => {
    mockSession('user-1');
    mockedPrisma.channel.findUnique.mockResolvedValue(null);

    const req = createRequest('/api/channels/ch-none/members');
    const res = await membersGET(req, params('ch-none'));
    const data = await res.json();

    expect(res.status).toBe(404);
  });
});

describe('POST /api/channels/[channelId]/members', () => {
  let membersPOST: Function;

  beforeAll(async () => {
    const mod = await import('@/app/api/channels/[channelId]/members/route');
    membersPOST = mod.POST;
  });

  beforeEach(() => jest.clearAllMocks());

  it('self-join for public channel', async () => {
    mockSession('user-1');
    mockedPrisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', type: 'PUBLIC' });
    (joinChannel as jest.Mock).mockResolvedValue(undefined);

    const req = createRequest('/api/channels/ch-1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user-1' }),
    });

    const res = await membersPOST(req, params('ch-1'));
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.ok).toBe(true);
    expect(joinChannel).toHaveBeenCalledWith('ch-1');
  });

  it('adds another user', async () => {
    mockSession('user-1');
    mockedPrisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', type: 'PRIVATE' });
    (addChannelMember as jest.Mock).mockResolvedValue(undefined);

    const req = createRequest('/api/channels/ch-1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user-2' }),
    });

    const res = await membersPOST(req, params('ch-1'));
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(addChannelMember).toHaveBeenCalledWith('ch-1', 'user-2');
  });

  it('returns 400 for missing userId', async () => {
    mockSession('user-1');

    const req = createRequest('/api/channels/ch-1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await membersPOST(req, params('ch-1'));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.code).toBe('VALIDATION_ERROR');
  });

  it('returns 403 for non-public channel self-join', async () => {
    mockSession('user-1');
    mockedPrisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', type: 'PRIVATE' });
    (addChannelMember as jest.Mock).mockRejectedValue(
      new Error('You must be a member of this channel to invite others')
    );

    const req = createRequest('/api/channels/ch-1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user-1' }),
    });

    const res = await membersPOST(req, params('ch-1'));
    const data = await res.json();

    // For private channels, self-join goes through addChannelMember path
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/channels/[channelId]/members', () => {
  let membersDELETE: Function;

  beforeAll(async () => {
    const mod = await import('@/app/api/channels/[channelId]/members/route');
    membersDELETE = mod.DELETE;
  });

  beforeEach(() => jest.clearAllMocks());

  it('leaves channel when no userId specified', async () => {
    mockSession('user-1');
    (leaveChannel as jest.Mock).mockResolvedValue(undefined);

    const req = createRequest('/api/channels/ch-1/members');
    const res = await membersDELETE(req, params('ch-1'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(leaveChannel).toHaveBeenCalledWith('ch-1');
  });

  it('removes another user with body userId', async () => {
    mockSession('user-1');
    (removeChannelMember as jest.Mock).mockResolvedValue(undefined);

    const req = createRequest('/api/channels/ch-1/members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user-2' }),
    });

    const res = await membersDELETE(req, params('ch-1'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(removeChannelMember).toHaveBeenCalledWith('ch-1', 'user-2');
  });

  it('returns 403 for DM channel leave attempt', async () => {
    mockSession('user-1');
    (leaveChannel as jest.Mock).mockRejectedValue(new Error('Cannot leave a DM channel'));

    const req = createRequest('/api/channels/ch-dm/members');
    const res = await membersDELETE(req, params('ch-dm'));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.code).toBe('FORBIDDEN');
  });

  it('returns 403 when non-admin tries to remove someone', async () => {
    mockSession('user-1');
    (removeChannelMember as jest.Mock).mockRejectedValue(
      new Error('Only the channel creator or workspace admin can remove members')
    );

    const req = createRequest('/api/channels/ch-1/members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user-2' }),
    });

    const res = await membersDELETE(req, params('ch-1'));
    const data = await res.json();

    expect(res.status).toBe(403);
  });
});
