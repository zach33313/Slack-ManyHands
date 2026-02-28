/**
 * Tests for workspace API routes
 *
 * Covers:
 * - GET /api/workspaces — returns user's workspaces
 * - POST /api/workspaces — creates new workspace, validates input
 * - GET /api/workspaces/[id] — returns workspace details, checks membership
 * - PATCH /api/workspaces/[id] — validates admin role
 * - DELETE /api/workspaces/[id] — validates owner role
 * - GET /api/workspaces/[id]/members — returns members
 * - POST /api/workspaces/[id]/members — invites member
 * - DELETE /api/workspaces/[id]/members — removes member
 */

// Mock auth
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

// Mock workspace queries
jest.mock('@/workspaces/queries', () => ({
  listUserWorkspaces: jest.fn(),
  getWorkspaceWithMembers: jest.fn(),
  getMemberRole: jest.fn(),
  getWorkspaceMembers: jest.fn(),
}));

// Mock workspace actions
jest.mock('@/workspaces/actions', () => ({
  createWorkspace: jest.fn(),
  updateWorkspace: jest.fn(),
  deleteWorkspace: jest.fn(),
  inviteMember: jest.fn(),
  removeMember: jest.fn(),
}));

// Mock constants
jest.mock('@/shared/lib/constants', () => ({
  MAX_WORKSPACE_NAME_LENGTH: 80,
  hasPermission: jest.fn((role: string, required: string) => {
    const hierarchy = ['MEMBER', 'ADMIN', 'OWNER'];
    return hierarchy.indexOf(role) >= hierarchy.indexOf(required);
  }),
}));

import { requireAuth, AuthError } from '@/auth/middleware';
import { listUserWorkspaces, getWorkspaceWithMembers, getMemberRole, getWorkspaceMembers } from '@/workspaces/queries';
import { createWorkspace, updateWorkspace, deleteWorkspace, inviteMember, removeMember } from '@/workspaces/actions';
import { hasPermission } from '@/shared/lib/constants';

const mockedRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
const mockedListWorkspaces = listUserWorkspaces as jest.MockedFunction<typeof listUserWorkspaces>;
const mockedGetWithMembers = getWorkspaceWithMembers as jest.MockedFunction<typeof getWorkspaceWithMembers>;
const mockedGetMemberRole = getMemberRole as jest.MockedFunction<typeof getMemberRole>;
const mockedGetMembers = getWorkspaceMembers as jest.MockedFunction<typeof getWorkspaceMembers>;
const mockedCreateWorkspace = createWorkspace as jest.MockedFunction<typeof createWorkspace>;
const mockedUpdateWorkspace = updateWorkspace as jest.MockedFunction<typeof updateWorkspace>;
const mockedDeleteWorkspace = deleteWorkspace as jest.MockedFunction<typeof deleteWorkspace>;
const mockedInviteMember = inviteMember as jest.MockedFunction<typeof inviteMember>;
const mockedRemoveMember = removeMember as jest.MockedFunction<typeof removeMember>;

function mockSession(userId: string) {
  mockedRequireAuth.mockResolvedValue({
    user: { id: userId, name: 'Test', email: 'test@test.com' },
    expires: '2027-01-01',
  } as any);
}

function createRequest(url: string, options?: RequestInit): Request {
  return new Request(`http://localhost:3000${url}`, options);
}

describe('GET /api/workspaces', () => {
  let GET: Function;

  beforeAll(async () => {
    const mod = await import('@/app/api/workspaces/route');
    GET = mod.GET;
  });

  beforeEach(() => jest.clearAllMocks());

  it('returns workspaces for authenticated user', async () => {
    mockSession('user-1');
    mockedListWorkspaces.mockResolvedValue([
      { id: 'ws-1', name: 'Acme', slug: 'acme', iconUrl: null, ownerId: 'user-1', createdAt: new Date() },
    ]);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.data[0].name).toBe('Acme');
  });

  it('returns 401 when not authenticated', async () => {
    mockedRequireAuth.mockRejectedValue(new (AuthError as any)('Unauthorized', 401));

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.ok).toBe(false);
    expect(data.code).toBe('UNAUTHORIZED');
  });
});

describe('POST /api/workspaces', () => {
  let POST: Function;

  beforeAll(async () => {
    const mod = await import('@/app/api/workspaces/route');
    POST = mod.POST;
  });

  beforeEach(() => jest.clearAllMocks());

  it('creates workspace with valid input', async () => {
    mockSession('user-1');
    mockedCreateWorkspace.mockResolvedValue({
      id: 'ws-new',
      name: 'New Workspace',
      slug: 'new-workspace',
      iconUrl: null,
      ownerId: 'user-1',
      createdAt: new Date(),
    });

    const req = createRequest('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Workspace', slug: 'new-workspace' }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.ok).toBe(true);
    expect(data.data.slug).toBe('new-workspace');
  });

  it('returns 400 for missing name', async () => {
    mockSession('user-1');

    const req = createRequest('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'test' }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid slug format', async () => {
    mockSession('user-1');

    const req = createRequest('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', slug: '-invalid-' }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.code).toBe('VALIDATION_ERROR');
  });

  it('returns 409 when slug already exists', async () => {
    mockSession('user-1');
    mockedCreateWorkspace.mockRejectedValue(new Error('A workspace with this slug already exists'));

    const req = createRequest('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', slug: 'taken' }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.code).toBe('CONFLICT');
  });
});

describe('GET /api/workspaces/[workspaceId]', () => {
  let GET: Function;

  beforeAll(async () => {
    const mod = await import('@/app/api/workspaces/[workspaceId]/route');
    GET = mod.GET;
  });

  beforeEach(() => jest.clearAllMocks());

  it('returns workspace details for a member', async () => {
    mockSession('user-1');
    mockedGetMemberRole.mockResolvedValue('MEMBER' as any);
    mockedGetWithMembers.mockResolvedValue({
      id: 'ws-1',
      name: 'Acme',
      slug: 'acme',
      iconUrl: null,
      ownerId: 'user-1',
      createdAt: new Date(),
      members: [],
      memberCount: 1,
      channelCount: 2,
    });

    const req = createRequest('/api/workspaces/ws-1');
    const res = await GET(req, { params: Promise.resolve({ workspaceId: 'ws-1' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.data.name).toBe('Acme');
  });

  it('returns 403 for non-members', async () => {
    mockSession('user-1');
    mockedGetMemberRole.mockResolvedValue(null);

    const req = createRequest('/api/workspaces/ws-1');
    const res = await GET(req, { params: Promise.resolve({ workspaceId: 'ws-1' }) });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.code).toBe('FORBIDDEN');
  });
});

describe('PATCH /api/workspaces/[workspaceId]', () => {
  let PATCH: Function;

  beforeAll(async () => {
    const mod = await import('@/app/api/workspaces/[workspaceId]/route');
    PATCH = mod.PATCH;
  });

  beforeEach(() => jest.clearAllMocks());

  it('updates workspace for ADMIN', async () => {
    mockSession('user-1');
    mockedGetMemberRole.mockResolvedValue('ADMIN' as any);
    (hasPermission as jest.Mock).mockReturnValue(true);

    mockedUpdateWorkspace.mockResolvedValue({
      id: 'ws-1',
      name: 'Updated',
      slug: 'updated',
      iconUrl: null,
      ownerId: 'user-1',
      createdAt: new Date(),
    });

    const req = createRequest('/api/workspaces/ws-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ workspaceId: 'ws-1' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.name).toBe('Updated');
  });

  it('returns 403 for MEMBER role', async () => {
    mockSession('user-1');
    mockedGetMemberRole.mockResolvedValue('MEMBER' as any);
    (hasPermission as jest.Mock).mockReturnValue(false);

    const req = createRequest('/api/workspaces/ws-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ workspaceId: 'ws-1' }) });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.code).toBe('FORBIDDEN');
  });
});

describe('DELETE /api/workspaces/[workspaceId]', () => {
  let DELETE: Function;

  beforeAll(async () => {
    const mod = await import('@/app/api/workspaces/[workspaceId]/route');
    DELETE = mod.DELETE;
  });

  beforeEach(() => jest.clearAllMocks());

  it('deletes workspace for OWNER', async () => {
    mockSession('user-1');
    mockedGetMemberRole.mockResolvedValue('OWNER' as any);
    mockedDeleteWorkspace.mockResolvedValue(undefined);

    const req = createRequest('/api/workspaces/ws-1');
    const res = await DELETE(req, { params: Promise.resolve({ workspaceId: 'ws-1' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.data.deleted).toBe(true);
  });

  it('returns 403 for ADMIN role', async () => {
    mockSession('user-1');
    mockedGetMemberRole.mockResolvedValue('ADMIN' as any);

    const req = createRequest('/api/workspaces/ws-1');
    const res = await DELETE(req, { params: Promise.resolve({ workspaceId: 'ws-1' }) });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.code).toBe('FORBIDDEN');
  });

  it('returns 403 for non-member', async () => {
    mockSession('user-1');
    mockedGetMemberRole.mockResolvedValue(null);

    const req = createRequest('/api/workspaces/ws-1');
    const res = await DELETE(req, { params: Promise.resolve({ workspaceId: 'ws-1' }) });
    const data = await res.json();

    expect(res.status).toBe(403);
  });
});

describe('Workspace members routes', () => {
  let membersGET: Function;
  let membersPOST: Function;
  let membersDELETE: Function;

  beforeAll(async () => {
    const mod = await import('@/app/api/workspaces/[workspaceId]/members/route');
    membersGET = mod.GET;
    membersPOST = mod.POST;
    membersDELETE = mod.DELETE;
  });

  beforeEach(() => jest.clearAllMocks());

  describe('GET /api/workspaces/[id]/members', () => {
    it('returns members for workspace member', async () => {
      mockSession('user-1');
      mockedGetMemberRole.mockResolvedValue('MEMBER' as any);
      mockedGetMembers.mockResolvedValue([]);

      const req = createRequest('/api/workspaces/ws-1/members');
      const res = await membersGET(req, { params: Promise.resolve({ workspaceId: 'ws-1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
    });

    it('returns 403 for non-member', async () => {
      mockSession('user-1');
      mockedGetMemberRole.mockResolvedValue(null);

      const req = createRequest('/api/workspaces/ws-1/members');
      const res = await membersGET(req, { params: Promise.resolve({ workspaceId: 'ws-1' }) });
      const data = await res.json();

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/workspaces/[id]/members', () => {
    it('invites a member as ADMIN', async () => {
      mockSession('user-1');
      mockedGetMemberRole.mockResolvedValue('ADMIN' as any);
      (hasPermission as jest.Mock).mockReturnValue(true);

      mockedInviteMember.mockResolvedValue({
        id: 'mem-new',
        workspaceId: 'ws-1',
        userId: 'user-2',
        role: 'MEMBER' as any,
        joinedAt: new Date(),
        user: { id: 'user-2', name: 'Bob', image: null },
      });

      const req = createRequest('/api/workspaces/ws-1/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bob@test.com', role: 'MEMBER' }),
      });

      const res = await membersPOST(req, { params: Promise.resolve({ workspaceId: 'ws-1' }) });
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.ok).toBe(true);
    });

    it('returns 403 for MEMBER role', async () => {
      mockSession('user-1');
      mockedGetMemberRole.mockResolvedValue('MEMBER' as any);
      (hasPermission as jest.Mock).mockReturnValue(false);

      const req = createRequest('/api/workspaces/ws-1/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bob@test.com' }),
      });

      const res = await membersPOST(req, { params: Promise.resolve({ workspaceId: 'ws-1' }) });
      const data = await res.json();

      expect(res.status).toBe(403);
    });

    it('returns 400 for invalid email', async () => {
      mockSession('user-1');
      mockedGetMemberRole.mockResolvedValue('ADMIN' as any);
      (hasPermission as jest.Mock).mockReturnValue(true);

      const req = createRequest('/api/workspaces/ws-1/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      });

      const res = await membersPOST(req, { params: Promise.resolve({ workspaceId: 'ws-1' }) });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/workspaces/[id]/members', () => {
    it('removes a member', async () => {
      mockSession('user-1');
      mockedGetMemberRole.mockResolvedValue('ADMIN' as any);
      (hasPermission as jest.Mock).mockReturnValue(true);
      mockedRemoveMember.mockResolvedValue(undefined);

      const req = createRequest('/api/workspaces/ws-1/members?userId=user-2');
      const res = await membersDELETE(req, { params: Promise.resolve({ workspaceId: 'ws-1' }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
    });

    it('returns 400 when userId missing', async () => {
      mockSession('user-1');

      const req = createRequest('/api/workspaces/ws-1/members');
      const res = await membersDELETE(req, { params: Promise.resolve({ workspaceId: 'ws-1' }) });
      const data = await res.json();

      expect(res.status).toBe(400);
    });
  });
});
