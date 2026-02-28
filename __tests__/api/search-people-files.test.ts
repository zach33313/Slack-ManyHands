/**
 * __tests__/api/search-people-files.test.ts
 *
 * Unit tests for the people and files search API endpoints:
 *   GET /api/search/people  — search workspace members by name or email
 *   GET /api/search/files   — search uploaded files by filename within a workspace
 *
 * All auth and database access are mocked — no real HTTP server or DB connection.
 *
 * People search test cases:
 *  1. Partial name match returns correct members
 *  2. Email match returns correct members
 *  3. Empty query returns 200 with empty array
 *  4. Results include role, image, statusText, statusEmoji fields
 *  5. Query is limited to 20 results (take: 20 passed to Prisma)
 *  6. Missing workspaceId returns 400
 *  7. Non-member user returns 403
 *  8. Unauthenticated request returns 401
 *
 * Files search test cases:
 *  1. Filename match returns correct files
 *  2. Results include uploadedBy (id, name, image) and channelName
 *  3. type=image filter restricts results to image/* MIME types
 *  4. Results ordered by most recent (orderBy: { createdAt: 'desc' })
 *  5. Only files from the specified workspace are returned
 *  6. Empty query returns 200 with empty array
 *  7. Invalid type value returns 400
 *  8. Missing workspaceId returns 400
 *  9. Unauthenticated request returns 401
 */

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE imports so jest.mock() hoisting works correctly
// ---------------------------------------------------------------------------

// requireAuth() calls auth() from this module
jest.mock('@/auth/auth', () => ({ auth: jest.fn() }));

// getMemberRole used by both route handlers
jest.mock('@/workspaces/queries', () => ({ getMemberRole: jest.fn() }));

// Prisma singleton — expose per-model mock objects (prefixed "mock" for jest hoisting)
const mockWorkspaceMember = { findMany: jest.fn() };
const mockFileAttachment = { findMany: jest.fn() };

jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    workspaceMember: mockWorkspaceMember,
    fileAttachment: mockFileAttachment,
  },
}));

// ---------------------------------------------------------------------------
// Imports — after all mocks are registered
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server';
import { auth } from '@/auth/auth';
import { getMemberRole } from '@/workspaces/queries';
import { GET as searchPeople } from '../../app/api/search/people/route';
import { GET as searchFiles } from '../../app/api/search/files/route';

const mockAuth = auth as jest.Mock;
const mockGetMemberRole = getMemberRole as jest.Mock;

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const WORKSPACE_ID = 'ws-001';
const SESSION_USER_ID = 'user-session';

function makeSession(userId = SESSION_USER_ID) {
  return { user: { id: userId, name: 'Current User', email: 'current@example.com' } };
}

function makePeopleRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/search/people');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString(), { method: 'GET' });
}

function makeFilesRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/search/files');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString(), { method: 'GET' });
}

// ---------------------------------------------------------------------------
// Mock data factories
// ---------------------------------------------------------------------------

function makeMockMember(overrides: {
  userId?: string;
  name?: string;
  email?: string;
  role?: string;
  image?: string | null;
  title?: string | null;
  statusText?: string | null;
  statusEmoji?: string | null;
} = {}) {
  return {
    role: overrides.role ?? 'MEMBER',
    user: {
      id: overrides.userId ?? 'user-1',
      name: overrides.name ?? 'Alice Smith',
      email: overrides.email ?? 'alice@example.com',
      image: overrides.image !== undefined ? overrides.image : 'https://cdn.example.com/alice.jpg',
      title: overrides.title !== undefined ? overrides.title : 'Software Engineer',
      statusText: overrides.statusText !== undefined ? overrides.statusText : 'In a meeting',
      statusEmoji: overrides.statusEmoji !== undefined ? overrides.statusEmoji : '🗓️',
    },
  };
}

function makeMockFile(overrides: {
  id?: string;
  name?: string;
  url?: string;
  size?: number;
  mimeType?: string;
  createdAt?: Date;
  uploaderId?: string;
  uploaderName?: string;
  uploaderImage?: string | null;
  channelName?: string;
} = {}) {
  return {
    id: overrides.id ?? 'file-1',
    name: overrides.name ?? 'photo.jpg',
    url: overrides.url ?? 'https://storage.example.com/photo.jpg',
    size: overrides.size ?? 1_024_000,
    mimeType: overrides.mimeType ?? 'image/jpeg',
    createdAt: overrides.createdAt ?? new Date('2026-01-15T10:00:00Z'),
    user: {
      id: overrides.uploaderId ?? 'user-1',
      name: overrides.uploaderName ?? 'Alice Smith',
      image: overrides.uploaderImage !== undefined ? overrides.uploaderImage : null,
    },
    message: {
      channel: {
        name: overrides.channelName ?? 'general',
      },
    },
  };
}

// ---------------------------------------------------------------------------
// People search tests
// ---------------------------------------------------------------------------

describe('GET /api/search/people', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: authenticated, and a member of the target workspace
    mockAuth.mockResolvedValue(makeSession());
    mockGetMemberRole.mockResolvedValue('MEMBER');
  });

  // -------------------------------------------------------------------------
  // 1. Partial name match
  // -------------------------------------------------------------------------

  it('returns members whose name contains the query (partial match)', async () => {
    const alice = makeMockMember({ name: 'Alice Smith' });
    const alicia = makeMockMember({ userId: 'user-2', name: 'Alicia Keys', email: 'alicia@example.com' });
    mockWorkspaceMember.findMany.mockResolvedValue([alice, alicia]);

    const req = makePeopleRequest({ workspaceId: WORKSPACE_ID, q: 'ali' });
    const res = await searchPeople(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe('Alice Smith');
    expect(body.data[1].name).toBe('Alicia Keys');
  });

  it('passes the lowercased query to the database filter', async () => {
    mockWorkspaceMember.findMany.mockResolvedValue([]);

    const req = makePeopleRequest({ workspaceId: WORKSPACE_ID, q: 'ALICE' });
    await searchPeople(req);

    // The route lowercases the query before passing to Prisma
    expect(mockWorkspaceMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user: expect.objectContaining({
            OR: expect.arrayContaining([
              { name: { contains: 'alice' } },
              { email: { contains: 'alice' } },
            ]),
          }),
        }),
      })
    );
  });

  // -------------------------------------------------------------------------
  // 2. Email match
  // -------------------------------------------------------------------------

  it('returns members whose email contains the query', async () => {
    const member = makeMockMember({ email: 'bob@company.com', name: 'Bob' });
    mockWorkspaceMember.findMany.mockResolvedValue([member]);

    const req = makePeopleRequest({ workspaceId: WORKSPACE_ID, q: 'company.com' });
    const res = await searchPeople(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].email).toBe('bob@company.com');
  });

  it('constructs an OR filter covering both name and email fields', async () => {
    mockWorkspaceMember.findMany.mockResolvedValue([]);

    const req = makePeopleRequest({ workspaceId: WORKSPACE_ID, q: 'bob' });
    await searchPeople(req);

    const callArg = mockWorkspaceMember.findMany.mock.calls[0][0];
    const orClause = callArg.where.user.OR;

    expect(orClause).toEqual(
      expect.arrayContaining([
        { name: { contains: 'bob' } },
        { email: { contains: 'bob' } },
      ])
    );
  });

  // -------------------------------------------------------------------------
  // 3. Empty query returns empty array
  // -------------------------------------------------------------------------

  it('returns 200 with empty array when q is empty string', async () => {
    const req = makePeopleRequest({ workspaceId: WORKSPACE_ID, q: '' });
    const res = await searchPeople(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual([]);
    // Must not hit the database for empty queries
    expect(mockWorkspaceMember.findMany).not.toHaveBeenCalled();
  });

  it('returns 200 with empty array when q is whitespace only', async () => {
    const req = makePeopleRequest({ workspaceId: WORKSPACE_ID, q: '   ' });
    const res = await searchPeople(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(mockWorkspaceMember.findMany).not.toHaveBeenCalled();
  });

  it('returns 200 with empty array when q param is absent', async () => {
    const req = makePeopleRequest({ workspaceId: WORKSPACE_ID });
    const res = await searchPeople(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 4. Results include role, image, status fields
  // -------------------------------------------------------------------------

  it('response includes id, name, email, role, image, title, statusText, statusEmoji', async () => {
    const member = makeMockMember({
      role: 'ADMIN',
      image: 'https://cdn.example.com/alice.png',
      title: 'Lead Engineer',
      statusText: 'Working from home',
      statusEmoji: '🏠',
    });
    mockWorkspaceMember.findMany.mockResolvedValue([member]);

    const req = makePeopleRequest({ workspaceId: WORKSPACE_ID, q: 'alice' });
    const res = await searchPeople(req);
    const body = await res.json();
    const person = body.data[0];

    expect(person).toHaveProperty('id');
    expect(person).toHaveProperty('name');
    expect(person).toHaveProperty('email');
    expect(person.role).toBe('ADMIN');
    expect(person.image).toBe('https://cdn.example.com/alice.png');
    expect(person.title).toBe('Lead Engineer');
    expect(person.statusText).toBe('Working from home');
    expect(person.statusEmoji).toBe('🏠');
  });

  it('returns null for optional fields when user has no profile data', async () => {
    const member = makeMockMember({ image: null, title: null, statusText: null, statusEmoji: null });
    mockWorkspaceMember.findMany.mockResolvedValue([member]);

    const req = makePeopleRequest({ workspaceId: WORKSPACE_ID, q: 'alice' });
    const res = await searchPeople(req);
    const body = await res.json();
    const person = body.data[0];

    expect(person.image).toBeNull();
    expect(person.title).toBeNull();
    expect(person.statusText).toBeNull();
    expect(person.statusEmoji).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 5. Results limited to 20
  // -------------------------------------------------------------------------

  it('passes take: 20 to Prisma to cap results at 20', async () => {
    mockWorkspaceMember.findMany.mockResolvedValue([]);

    const req = makePeopleRequest({ workspaceId: WORKSPACE_ID, q: 'test' });
    await searchPeople(req);

    expect(mockWorkspaceMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 })
    );
  });

  it('response contains at most 20 results when prisma returns 20 records', async () => {
    const twentyMembers = Array.from({ length: 20 }, (_, i) =>
      makeMockMember({ userId: `user-${i}`, email: `user${i}@example.com` })
    );
    mockWorkspaceMember.findMany.mockResolvedValue(twentyMembers);

    const req = makePeopleRequest({ workspaceId: WORKSPACE_ID, q: 'user' });
    const res = await searchPeople(req);
    const body = await res.json();

    expect(body.data).toHaveLength(20);
  });

  // -------------------------------------------------------------------------
  // 6. Missing workspaceId returns 400
  // -------------------------------------------------------------------------

  it('returns 400 when workspaceId is missing', async () => {
    const req = makePeopleRequest({ q: 'alice' });
    const res = await searchPeople(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  // -------------------------------------------------------------------------
  // 7. Non-member returns 403
  // -------------------------------------------------------------------------

  it('returns 403 when the authenticated user is not a member of the workspace', async () => {
    mockGetMemberRole.mockResolvedValue(null);

    const req = makePeopleRequest({ workspaceId: WORKSPACE_ID, q: 'alice' });
    const res = await searchPeople(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('FORBIDDEN');
    expect(mockWorkspaceMember.findMany).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 8. Unauthenticated returns 401
  // -------------------------------------------------------------------------

  it('returns 401 when the request has no valid session', async () => {
    mockAuth.mockResolvedValue(null);

    const req = makePeopleRequest({ workspaceId: WORKSPACE_ID, q: 'alice' });
    const res = await searchPeople(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('UNAUTHORIZED');
    expect(mockWorkspaceMember.findMany).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Ordering
  // -------------------------------------------------------------------------

  it('orders results alphabetically by user name (orderBy: user.name asc)', async () => {
    mockWorkspaceMember.findMany.mockResolvedValue([]);

    const req = makePeopleRequest({ workspaceId: WORKSPACE_ID, q: 'a' });
    await searchPeople(req);

    expect(mockWorkspaceMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { user: { name: 'asc' } },
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Files search tests
// ---------------------------------------------------------------------------

describe('GET /api/search/files', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(makeSession());
    mockGetMemberRole.mockResolvedValue('MEMBER');
  });

  // -------------------------------------------------------------------------
  // 1. Filename match returns correct files
  // -------------------------------------------------------------------------

  it('returns files whose name contains the query term', async () => {
    const file = makeMockFile({ name: 'report-2026.pdf' });
    mockFileAttachment.findMany.mockResolvedValue([file]);

    const req = makeFilesRequest({ workspaceId: WORKSPACE_ID, q: 'report' });
    const res = await searchFiles(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('report-2026.pdf');
  });

  it('passes the search term as { contains: query } to the name filter', async () => {
    mockFileAttachment.findMany.mockResolvedValue([]);

    const req = makeFilesRequest({ workspaceId: WORKSPACE_ID, q: 'slide' });
    await searchFiles(req);

    expect(mockFileAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: { contains: 'slide' },
        }),
      })
    );
  });

  // -------------------------------------------------------------------------
  // 2. Results include uploadedBy and channelName
  // -------------------------------------------------------------------------

  it('response includes uploadedBy with id, name, image and channelName', async () => {
    const file = makeMockFile({
      uploaderId: 'user-42',
      uploaderName: 'Bob Jones',
      uploaderImage: 'https://cdn.example.com/bob.jpg',
      channelName: 'design',
    });
    mockFileAttachment.findMany.mockResolvedValue([file]);

    const req = makeFilesRequest({ workspaceId: WORKSPACE_ID, q: 'file' });
    const res = await searchFiles(req);
    const body = await res.json();
    const result = body.data[0];

    expect(result.uploadedBy).toEqual({
      id: 'user-42',
      name: 'Bob Jones',
      image: 'https://cdn.example.com/bob.jpg',
    });
    expect(result.channelName).toBe('design');
  });

  it('response includes all required file fields: id, name, url, size, mimeType, createdAt', async () => {
    const createdAt = new Date('2026-01-20T09:00:00Z');
    const file = makeMockFile({
      id: 'file-xyz',
      name: 'diagram.png',
      url: 'https://cdn.example.com/diagram.png',
      size: 512_000,
      mimeType: 'image/png',
      createdAt,
    });
    mockFileAttachment.findMany.mockResolvedValue([file]);

    const req = makeFilesRequest({ workspaceId: WORKSPACE_ID, q: 'diagram' });
    const res = await searchFiles(req);
    const body = await res.json();
    const result = body.data[0];

    expect(result.id).toBe('file-xyz');
    expect(result.name).toBe('diagram.png');
    expect(result.url).toBe('https://cdn.example.com/diagram.png');
    expect(result.size).toBe(512_000);
    expect(result.mimeType).toBe('image/png');
    // createdAt is serialized to ISO string in JSON
    expect(result.createdAt).toBe(createdAt.toISOString());
  });

  // -------------------------------------------------------------------------
  // 3. type=image filters by mimeType
  // -------------------------------------------------------------------------

  it('type=image adds { mimeType: { startsWith: "image/" } } to the where clause', async () => {
    mockFileAttachment.findMany.mockResolvedValue([]);

    const req = makeFilesRequest({ workspaceId: WORKSPACE_ID, q: 'photo', type: 'image' });
    await searchFiles(req);

    expect(mockFileAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          mimeType: { startsWith: 'image/' },
        }),
      })
    );
  });

  it('type=audio adds { mimeType: { startsWith: "audio/" } } to the where clause', async () => {
    mockFileAttachment.findMany.mockResolvedValue([]);

    const req = makeFilesRequest({ workspaceId: WORKSPACE_ID, q: 'podcast', type: 'audio' });
    await searchFiles(req);

    expect(mockFileAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          mimeType: { startsWith: 'audio/' },
        }),
      })
    );
  });

  it('type=video adds { mimeType: { startsWith: "video/" } } to the where clause', async () => {
    mockFileAttachment.findMany.mockResolvedValue([]);

    const req = makeFilesRequest({ workspaceId: WORKSPACE_ID, q: 'recording', type: 'video' });
    await searchFiles(req);

    expect(mockFileAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          mimeType: { startsWith: 'video/' },
        }),
      })
    );
  });

  it('type=document adds OR filter covering application/* and text/* MIME types', async () => {
    mockFileAttachment.findMany.mockResolvedValue([]);

    const req = makeFilesRequest({ workspaceId: WORKSPACE_ID, q: 'report', type: 'document' });
    await searchFiles(req);

    const callArg = mockFileAttachment.findMany.mock.calls[0][0];
    expect(callArg.where.OR).toEqual(
      expect.arrayContaining([
        { mimeType: { startsWith: 'application/' } },
        { mimeType: { startsWith: 'text/' } },
      ])
    );
  });

  it('omitting type applies no mimeType filter (returns all types)', async () => {
    mockFileAttachment.findMany.mockResolvedValue([]);

    const req = makeFilesRequest({ workspaceId: WORKSPACE_ID, q: 'file' });
    await searchFiles(req);

    const callArg = mockFileAttachment.findMany.mock.calls[0][0];
    // No mimeType key in the where clause when type is not supplied
    expect(callArg.where).not.toHaveProperty('mimeType');
    expect(callArg.where).not.toHaveProperty('OR');
  });

  // -------------------------------------------------------------------------
  // 4. Results ordered by most recent
  // -------------------------------------------------------------------------

  it('passes orderBy: { createdAt: "desc" } so most recent files come first', async () => {
    mockFileAttachment.findMany.mockResolvedValue([]);

    const req = makeFilesRequest({ workspaceId: WORKSPACE_ID, q: 'file' });
    await searchFiles(req);

    expect(mockFileAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
      })
    );
  });

  it('preserves the order returned by Prisma (most recent first)', async () => {
    const newer = makeMockFile({ id: 'file-2', name: 'newer.jpg', createdAt: new Date('2026-02-01') });
    const older = makeMockFile({ id: 'file-1', name: 'older.jpg', createdAt: new Date('2026-01-01') });
    // Prisma returns them already sorted desc — route must preserve that order
    mockFileAttachment.findMany.mockResolvedValue([newer, older]);

    const req = makeFilesRequest({ workspaceId: WORKSPACE_ID, q: 'file' });
    const res = await searchFiles(req);
    const body = await res.json();

    expect(body.data[0].id).toBe('file-2');
    expect(body.data[1].id).toBe('file-1');
  });

  // -------------------------------------------------------------------------
  // 5. Only files from the specified workspace
  // -------------------------------------------------------------------------

  it('scopes the query to the specified workspace via message.channel.workspaceId', async () => {
    mockFileAttachment.findMany.mockResolvedValue([]);

    const req = makeFilesRequest({ workspaceId: WORKSPACE_ID, q: 'doc' });
    await searchFiles(req);

    expect(mockFileAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          message: {
            isDeleted: false,
            channel: { workspaceId: WORKSPACE_ID },
          },
        }),
      })
    );
  });

  it('only returns files attached to non-deleted messages (isDeleted: false)', async () => {
    mockFileAttachment.findMany.mockResolvedValue([]);

    const req = makeFilesRequest({ workspaceId: 'ws-other', q: 'data' });
    await searchFiles(req);

    const callArg = mockFileAttachment.findMany.mock.calls[0][0];
    expect(callArg.where.message.isDeleted).toBe(false);
  });

  it('only returns files that have a messageId (messageId: { not: null })', async () => {
    mockFileAttachment.findMany.mockResolvedValue([]);

    const req = makeFilesRequest({ workspaceId: WORKSPACE_ID, q: 'file' });
    await searchFiles(req);

    const callArg = mockFileAttachment.findMany.mock.calls[0][0];
    expect(callArg.where.messageId).toEqual({ not: null });
  });

  // -------------------------------------------------------------------------
  // 6. Empty query returns empty array
  // -------------------------------------------------------------------------

  it('returns 200 with empty array when q is empty string', async () => {
    const req = makeFilesRequest({ workspaceId: WORKSPACE_ID, q: '' });
    const res = await searchFiles(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual([]);
    expect(mockFileAttachment.findMany).not.toHaveBeenCalled();
  });

  it('returns 200 with empty array when q is whitespace only', async () => {
    const req = makeFilesRequest({ workspaceId: WORKSPACE_ID, q: '  ' });
    const res = await searchFiles(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(mockFileAttachment.findMany).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 7. Invalid type value returns 400
  // -------------------------------------------------------------------------

  it('returns 400 when type is an invalid value', async () => {
    const req = makeFilesRequest({ workspaceId: WORKSPACE_ID, q: 'file', type: 'spreadsheet' });
    const res = await searchFiles(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(mockFileAttachment.findMany).not.toHaveBeenCalled();
  });

  it('returns 400 for type=gif (not in the valid list)', async () => {
    const req = makeFilesRequest({ workspaceId: WORKSPACE_ID, q: 'animation', type: 'gif' });
    const res = await searchFiles(req);

    expect(res.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // 8. Missing workspaceId returns 400
  // -------------------------------------------------------------------------

  it('returns 400 when workspaceId is missing', async () => {
    const req = makeFilesRequest({ q: 'report' });
    const res = await searchFiles(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  // -------------------------------------------------------------------------
  // 9. Unauthenticated returns 401
  // -------------------------------------------------------------------------

  it('returns 401 when the request has no valid session', async () => {
    mockAuth.mockResolvedValue(null);

    const req = makeFilesRequest({ workspaceId: WORKSPACE_ID, q: 'file' });
    const res = await searchFiles(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('UNAUTHORIZED');
    expect(mockFileAttachment.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 when the authenticated user is not a member of the workspace', async () => {
    mockGetMemberRole.mockResolvedValue(null);

    const req = makeFilesRequest({ workspaceId: WORKSPACE_ID, q: 'file' });
    const res = await searchFiles(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('FORBIDDEN');
    expect(mockFileAttachment.findMany).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Limit: take: 20
  // -------------------------------------------------------------------------

  it('passes take: 20 to Prisma to cap results at 20', async () => {
    mockFileAttachment.findMany.mockResolvedValue([]);

    const req = makeFilesRequest({ workspaceId: WORKSPACE_ID, q: 'file' });
    await searchFiles(req);

    expect(mockFileAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 })
    );
  });
});
