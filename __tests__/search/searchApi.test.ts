/**
 * Tests for app/api/workspaces/[workspaceId]/search/route.ts
 *
 * Tests the Search API GET endpoint.
 * Covers:
 *   - Returns results for valid search
 *   - Validates workspace membership
 *   - Requires authentication
 *   - Requires query parameter
 *   - Respects limit parameter
 *   - Clamps limit to MAX_SEARCH_RESULTS
 *   - Uses parseSearchQuery for filter extraction
 */

// --- Mocks ---

const mockGetToken = jest.fn();
const mockFindUnique = jest.fn();
const mockFindFirst = jest.fn();
const mockSearchMessages = jest.fn();
const mockParseSearchQuery = jest.fn();
const mockFindMany = jest.fn();
const mockCount = jest.fn();

jest.mock('next-auth/jwt', () => ({
  getToken: (...args: any[]) => mockGetToken(...args),
}));

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    workspaceMember: { findUnique: mockFindUnique, findFirst: mockFindFirst },
    channelMember: { findMany: mockFindMany },
    channel: { findMany: mockFindMany },
    user: { findFirst: mockFindFirst },
    message: { findMany: mockFindMany, count: mockCount },
  })),
}));

jest.mock('../../shared/lib/constants', () => ({
  SEARCH_RESULTS_LIMIT: 20,
  MAX_SEARCH_RESULTS: 50,
}));

jest.mock('../../search/queries', () => ({
  parseSearchQuery: (...args: any[]) => mockParseSearchQuery(...args),
  searchMessages: (...args: any[]) => mockSearchMessages(...args),
}));

// Import the route handler
import { GET } from '../../app/api/workspaces/[workspaceId]/search/route';
import { NextRequest } from 'next/server';

// Helper to create a NextRequest with query params
function createSearchRequest(params: Record<string, string>, workspaceId = 'ws-1'): [NextRequest, any] {
  const url = new URL(`http://localhost:3000/api/workspaces/${workspaceId}/search`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const req = new NextRequest(url);
  const context = { params: { workspaceId } };
  return [req, context];
}

describe('GET /api/workspaces/[workspaceId]/search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: authenticated user
    mockGetToken.mockResolvedValue({ sub: 'user-1' });
    // Default: user is a workspace member
    mockFindUnique.mockResolvedValue({ userId: 'user-1', workspaceId: 'ws-1', role: 'MEMBER' });
    // Default parse result
    mockParseSearchQuery.mockReturnValue({ query: 'hello' });
    // Default search result
    mockSearchMessages.mockResolvedValue({
      results: [],
      cursor: null,
      hasMore: false,
      total: 0,
    });
  });

  // -----------------------------------------------------------------------
  // Authentication
  // -----------------------------------------------------------------------
  describe('authentication', () => {
    it('returns 401 when no authentication token is present', async () => {
      mockGetToken.mockResolvedValue(null);
      // In test env (NODE_ENV=test), the dev fallback won't trigger
      // so userId stays null → 401

      const [req, ctx] = createSearchRequest({ q: 'hello' });
      const response = await GET(req, ctx);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.ok).toBe(false);
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('allows authenticated users', async () => {
      mockGetToken.mockResolvedValue({ sub: 'user-1' });

      const [req, ctx] = createSearchRequest({ q: 'hello' });
      const response = await GET(req, ctx);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Workspace membership
  // -----------------------------------------------------------------------
  describe('workspace membership', () => {
    it('returns 403 when user is not a workspace member', async () => {
      mockFindUnique.mockResolvedValue(null);

      const [req, ctx] = createSearchRequest({ q: 'hello' });
      const response = await GET(req, ctx);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.ok).toBe(false);
      expect(body.code).toBe('FORBIDDEN');
    });

    it('verifies membership with workspaceId and userId', async () => {
      const [req, ctx] = createSearchRequest({ q: 'hello' }, 'ws-test');
      await GET(req, ctx);

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: {
          workspaceId_userId: { workspaceId: 'ws-test', userId: 'user-1' },
        },
      });
    });
  });

  // -----------------------------------------------------------------------
  // Query validation
  // -----------------------------------------------------------------------
  describe('query validation', () => {
    it('returns 400 when q parameter is missing', async () => {
      const [req, ctx] = createSearchRequest({});
      const response = await GET(req, ctx);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when q is empty string', async () => {
      const [req, ctx] = createSearchRequest({ q: '' });
      const response = await GET(req, ctx);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.ok).toBe(false);
    });

    it('returns 400 when q is whitespace only', async () => {
      const [req, ctx] = createSearchRequest({ q: '   ' });
      const response = await GET(req, ctx);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.ok).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Search flow
  // -----------------------------------------------------------------------
  describe('search flow', () => {
    it('calls parseSearchQuery with the raw query', async () => {
      const [req, ctx] = createSearchRequest({ q: 'in:#general hello' });
      await GET(req, ctx);

      expect(mockParseSearchQuery).toHaveBeenCalledWith('in:#general hello');
    });

    it('passes parsed filters to searchMessages', async () => {
      const parsedFilters = { query: 'hello', channelName: 'general' };
      mockParseSearchQuery.mockReturnValue(parsedFilters);

      const [req, ctx] = createSearchRequest({ q: 'in:#general hello' });
      await GET(req, ctx);

      expect(mockSearchMessages).toHaveBeenCalledWith(
        'ws-1',
        'user-1',
        parsedFilters,
        undefined, // no cursor
        20 // default limit
      );
    });

    it('passes cursor param to searchMessages', async () => {
      const [req, ctx] = createSearchRequest({ q: 'hello', cursor: 'msg-42' });
      await GET(req, ctx);

      expect(mockSearchMessages).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'msg-42',
        expect.anything()
      );
    });

    it('returns search results in ok envelope', async () => {
      const searchResponse = {
        results: [
          {
            message: { id: 'msg-1', contentPlain: 'hello world' },
            channelName: 'general',
            highlights: ['hello world'],
          },
        ],
        cursor: 'msg-1',
        hasMore: true,
        total: 5,
      };
      mockSearchMessages.mockResolvedValue(searchResponse);

      const [req, ctx] = createSearchRequest({ q: 'hello' });
      const response = await GET(req, ctx);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data).toEqual(searchResponse);
    });
  });

  // -----------------------------------------------------------------------
  // Limit parameter
  // -----------------------------------------------------------------------
  describe('limit parameter', () => {
    it('uses default limit of 20 when not specified', async () => {
      const [req, ctx] = createSearchRequest({ q: 'hello' });
      await GET(req, ctx);

      expect(mockSearchMessages).toHaveBeenCalledWith(
        'ws-1',
        'user-1',
        { query: 'hello' },
        undefined, // no cursor
        20
      );
    });

    it('uses custom limit when specified', async () => {
      const [req, ctx] = createSearchRequest({ q: 'hello', limit: '10' });
      await GET(req, ctx);

      expect(mockSearchMessages).toHaveBeenCalledWith(
        'ws-1',
        'user-1',
        { query: 'hello' },
        undefined,
        10
      );
    });

    it('clamps limit to MAX_SEARCH_RESULTS (50)', async () => {
      const [req, ctx] = createSearchRequest({ q: 'hello', limit: '100' });
      await GET(req, ctx);

      expect(mockSearchMessages).toHaveBeenCalledWith(
        'ws-1',
        'user-1',
        { query: 'hello' },
        undefined,
        50
      );
    });

    it('treats limit 0 as falsy and falls back to default (20)', async () => {
      // parseInt('0') = 0, which is falsy, so || SEARCH_RESULTS_LIMIT applies
      const [req, ctx] = createSearchRequest({ q: 'hello', limit: '0' });
      await GET(req, ctx);

      expect(mockSearchMessages).toHaveBeenCalledWith(
        'ws-1',
        'user-1',
        { query: 'hello' },
        undefined,
        20
      );
    });

    it('handles non-numeric limit gracefully', async () => {
      const [req, ctx] = createSearchRequest({ q: 'hello', limit: 'abc' });
      await GET(req, ctx);

      // NaN is falsy, so || SEARCH_RESULTS_LIMIT (20) applies
      expect(mockSearchMessages).toHaveBeenCalledWith(
        'ws-1',
        'user-1',
        { query: 'hello' },
        undefined,
        20
      );
    });
  });
});
