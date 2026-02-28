/**
 * Tests for app/api/users/ routes
 *
 * Covers:
 * - GET /api/users: search members by q + workspaceId
 * - GET /api/users/[userId]/profile: returns profile
 * - PATCH /api/users/[userId]/profile: updates own profile only
 */

jest.mock('@/auth/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/members/queries', () => ({
  searchMembers: jest.fn(),
  getUserProfile: jest.fn(),
}));

jest.mock('@/members/actions', () => ({
  updateProfile: jest.fn(),
}));

import { auth } from '@/auth/auth';
import { searchMembers, getUserProfile } from '@/members/queries';
import { updateProfile } from '@/members/actions';
import { GET as usersGET } from '@/app/api/users/route';
import { GET as profileGET, PATCH as profilePATCH } from '@/app/api/users/[userId]/profile/route';

const mockedAuth = auth as unknown as jest.Mock;
const mockedSearchMembers = searchMembers as jest.MockedFunction<typeof searchMembers>;
const mockedGetUserProfile = getUserProfile as jest.MockedFunction<typeof getUserProfile>;
const mockedUpdateProfile = updateProfile as jest.MockedFunction<typeof updateProfile>;

function createRequest(url: string, options?: RequestInit): Request {
  return new Request(url, options);
}

const mockProfile = {
  id: 'user-1',
  name: 'Alice',
  email: 'alice@example.com',
  image: null,
  title: 'Engineer',
  statusText: null,
  statusEmoji: null,
  timezone: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-06-01'),
};

describe('GET /api/users', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null as any);

    const req = createRequest('http://localhost:3000/api/users?q=alice&workspaceId=ws-1');
    const res = await usersGET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 400 when workspaceId is missing', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any);

    const req = createRequest('http://localhost:3000/api/users?q=alice');
    const res = await usersGET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns empty array for empty query', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any);

    const req = createRequest('http://localhost:3000/api/users?q=&workspaceId=ws-1');
    const res = await usersGET(req);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.data).toEqual([]);
    expect(mockedSearchMembers).not.toHaveBeenCalled();
  });

  it('returns search results for valid query', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any);
    mockedSearchMembers.mockResolvedValue([
      {
        id: 'm-1',
        workspaceId: 'ws-1',
        userId: 'user-1',
        role: 'MEMBER' as any,
        joinedAt: new Date(),
        user: {
          id: 'user-1',
          name: 'Alice',
          email: 'alice@example.com',
          image: null,
          title: null,
          statusText: null,
          statusEmoji: null,
          timezone: null,
        },
      },
    ]);

    const req = createRequest('http://localhost:3000/api/users?q=alice&workspaceId=ws-1');
    const res = await usersGET(req);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(mockedSearchMembers).toHaveBeenCalledWith('ws-1', 'alice');
  });
});

describe('GET /api/users/[userId]/profile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null as any);

    const req = createRequest('http://localhost:3000/api/users/user-1/profile');
    const res = await profileGET(req, { params: { userId: 'user-1' } });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('returns 404 when user not found', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any);
    mockedGetUserProfile.mockResolvedValue(null);

    const req = createRequest('http://localhost:3000/api/users/nonexistent/profile');
    const res = await profileGET(req, { params: { userId: 'nonexistent' } });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('returns profile when found', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any);
    mockedGetUserProfile.mockResolvedValue(mockProfile);

    const req = createRequest('http://localhost:3000/api/users/user-1/profile');
    const res = await profileGET(req, { params: { userId: 'user-1' } });
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.data.id).toBe('user-1');
    expect(body.data.name).toBe('Alice');
    expect(body.data.email).toBe('alice@example.com');
  });

  it('allows viewing another user\'s profile', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-2' } } as any);
    mockedGetUserProfile.mockResolvedValue(mockProfile);

    const req = createRequest('http://localhost:3000/api/users/user-1/profile');
    const res = await profileGET(req, { params: { userId: 'user-1' } });
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.data.id).toBe('user-1');
  });
});

describe('PATCH /api/users/[userId]/profile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null as any);

    const req = createRequest('http://localhost:3000/api/users/user-1/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'New Name' }),
    });
    const res = await profilePATCH(req, { params: { userId: 'user-1' } });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it('returns 403 when updating another user\'s profile', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-2' } } as any);

    const req = createRequest('http://localhost:3000/api/users/user-1/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Hacked' }),
    });
    const res = await profilePATCH(req, { params: { userId: 'user-1' } });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('returns 400 for empty displayName', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any);

    const req = createRequest('http://localhost:3000/api/users/user-1/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: '  ' }),
    });
    const res = await profilePATCH(req, { params: { userId: 'user-1' } });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for non-string field', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any);

    const req = createRequest('http://localhost:3000/api/users/user-1/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 42 }),
    });
    const res = await profilePATCH(req, { params: { userId: 'user-1' } });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('updates profile successfully with valid data', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any);
    const updatedProfile = { ...mockProfile, statusText: 'On vacation' };
    mockedUpdateProfile.mockResolvedValue(updatedProfile);

    const req = createRequest('http://localhost:3000/api/users/user-1/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusText: 'On vacation' }),
    });
    const res = await profilePATCH(req, { params: { userId: 'user-1' } });
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(mockedUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ statusText: 'On vacation' })
    );
  });

  it('rejects statusEmoji longer than 4 chars', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any);

    const req = createRequest('http://localhost:3000/api/users/user-1/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusEmoji: 'toolong' }),
    });
    const res = await profilePATCH(req, { params: { userId: 'user-1' } });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});
