/**
 * Tests for search/queries.ts — searchMessages function
 *
 * Tests the database search query logic with mocked Prisma client.
 * Covers:
 *   - Returns messages matching query text (LIKE)
 *   - Filters by channel correctly
 *   - Filters by user correctly
 *   - Filters by has:file (messages with attachments)
 *   - Respects user channel access (doesn't return messages from channels user isn't in)
 *   - Pagination works
 *   - Empty results
 *   - Date range filtering
 */

// --- Mock setup ---

const mockFindMany = jest.fn();
const mockFindFirst = jest.fn();
const mockFindUnique = jest.fn();
const mockCount = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    channelMember: { findMany: mockFindMany },
    channel: { findMany: mockFindMany },
    user: { findFirst: mockFindFirst },
    message: { findMany: mockFindMany, count: mockCount },
    workspaceMember: { findUnique: mockFindUnique },
  })),
}));

jest.mock('../../shared/lib/constants', () => ({
  SEARCH_RESULTS_LIMIT: 20,
  MAX_SEARCH_RESULTS: 50,
}));

import { searchMessages } from '../../search/queries';
import type { SearchFilters } from '../../search/types';

// Build a mock message row as Prisma would return
function makeMockMessage(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? 'msg-1',
    channelId: overrides.channelId ?? 'ch-1',
    userId: overrides.userId ?? 'user-1',
    contentJson: JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: overrides.text ?? 'hello world' }] }],
    }),
    contentPlain: overrides.text ?? 'hello world',
    parentId: overrides.parentId ?? null,
    replyCount: overrides.replyCount ?? 0,
    isEdited: false,
    isDeleted: false,
    createdAt: overrides.createdAt ?? new Date('2024-06-15T12:00:00Z'),
    updatedAt: new Date('2024-06-15T12:00:00Z'),
    author: {
      id: overrides.userId ?? 'user-1',
      name: overrides.authorName ?? 'Alice',
      image: null,
    },
    _count: {
      files: overrides.fileCount ?? 0,
    },
    ...overrides,
  };
}

describe('searchMessages', () => {
  const workspaceId = 'ws-1';
  const userId = 'user-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper to setup the mock chain for a typical search
  // searchMessages calls findMany 3 times:
  //   1. channelMember.findMany → user's channel memberships
  //   2. channel.findMany → workspace channels
  //   3. message.findMany → actual search results
  function setupMocks(options: {
    channelMemberships?: { channelId: string }[];
    workspaceChannels?: { id: string; name: string }[];
    messages?: any[];
    totalCount?: number;
    matchingUser?: { id: string } | null;
  } = {}) {
    const memberships = options.channelMemberships ?? [{ channelId: 'ch-1' }];
    const channels = options.workspaceChannels ?? [{ id: 'ch-1', name: 'general' }];
    const messages = options.messages ?? [];
    const total = options.totalCount ?? messages.length;

    // Track call order
    let findManyCallIndex = 0;
    mockFindMany.mockImplementation(() => {
      const callIdx = findManyCallIndex++;
      if (callIdx === 0) return Promise.resolve(memberships);
      if (callIdx === 1) return Promise.resolve(channels);
      return Promise.resolve(messages);
    });

    mockCount.mockResolvedValue(total);
    if (options.matchingUser !== undefined) {
      mockFindFirst.mockResolvedValue(options.matchingUser);
    }
  }

  // -----------------------------------------------------------------------
  // Basic text search
  // -----------------------------------------------------------------------
  describe('text matching', () => {
    it('returns messages matching query text', async () => {
      const msg = makeMockMessage({ text: 'hello world' });
      setupMocks({ messages: [msg] });

      const result = await searchMessages(workspaceId, userId, { query: 'hello' });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].message.id).toBe('msg-1');
      expect(result.results[0].message.contentPlain).toBe('hello world');
      expect(result.results[0].channelName).toBe('general');
    });

    it('returns empty results when no messages match', async () => {
      setupMocks({ messages: [] });

      const result = await searchMessages(workspaceId, userId, { query: 'nonexistent' });

      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('generates highlight snippets from matching content', async () => {
      const msg = makeMockMessage({ text: 'This is a test message about hello world today' });
      setupMocks({ messages: [msg] });

      const result = await searchMessages(workspaceId, userId, { query: 'hello' });

      expect(result.results[0].highlights).toBeDefined();
      expect(result.results[0].highlights.length).toBeGreaterThan(0);
      // At least one highlight should contain the search term
      const hasMatch = result.results[0].highlights.some(
        (h: string) => h.toLowerCase().includes('hello')
      );
      expect(hasMatch).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Channel filtering
  // -----------------------------------------------------------------------
  describe('channel filtering', () => {
    it('filters by channel name via channelName filter', async () => {
      const msg = makeMockMessage({ channelId: 'ch-eng' });
      setupMocks({
        channelMemberships: [{ channelId: 'ch-1' }, { channelId: 'ch-eng' }],
        workspaceChannels: [
          { id: 'ch-1', name: 'general' },
          { id: 'ch-eng', name: 'engineering' },
        ],
        messages: [msg],
      });

      const result = await searchMessages(workspaceId, userId, {
        query: 'hello',
        channelName: 'engineering',
      });

      // The message.findMany call should only include the matching channel
      expect(result.results).toHaveLength(1);
    });

    it('returns empty when channel name filter matches no accessible channel', async () => {
      setupMocks({
        channelMemberships: [{ channelId: 'ch-1' }],
        workspaceChannels: [{ id: 'ch-1', name: 'general' }],
      });

      const result = await searchMessages(workspaceId, userId, {
        query: 'hello',
        channelName: 'nonexistent',
      });

      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('filters by channel ID via channelId filter', async () => {
      const msg = makeMockMessage({ channelId: 'ch-1' });
      setupMocks({
        channelMemberships: [{ channelId: 'ch-1' }, { channelId: 'ch-2' }],
        workspaceChannels: [
          { id: 'ch-1', name: 'general' },
          { id: 'ch-2', name: 'random' },
        ],
        messages: [msg],
      });

      const result = await searchMessages(workspaceId, userId, {
        query: 'hello',
        channelId: 'ch-1',
      });

      expect(result.results).toHaveLength(1);
    });

    it('returns empty when channelId is not in accessible channels', async () => {
      setupMocks({
        channelMemberships: [{ channelId: 'ch-1' }],
        workspaceChannels: [{ id: 'ch-1', name: 'general' }],
      });

      const result = await searchMessages(workspaceId, userId, {
        query: 'hello',
        channelId: 'ch-private-no-access',
      });

      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // User access control
  // -----------------------------------------------------------------------
  describe('user channel access', () => {
    it('only searches channels the user is a member of', async () => {
      setupMocks({
        channelMemberships: [{ channelId: 'ch-1' }],
        workspaceChannels: [{ id: 'ch-1', name: 'general' }],
        messages: [],
      });

      await searchMessages(workspaceId, userId, { query: 'test' });

      // First findMany: channelMember.findMany for user memberships
      expect(mockFindMany).toHaveBeenCalledTimes(3);
      // The first call is for channel memberships
      expect(mockFindMany.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({ userId }),
        })
      );
    });

    it('returns empty results when user has no channel memberships', async () => {
      setupMocks({ channelMemberships: [] });

      const result = await searchMessages(workspaceId, userId, { query: 'test' });

      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
      // Should short-circuit without calling channel or message queries
      expect(mockFindMany).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // User name filtering
  // -----------------------------------------------------------------------
  describe('user filtering', () => {
    it('filters by userId', async () => {
      const msg = makeMockMessage({ userId: 'user-2', authorName: 'Bob' });
      setupMocks({ messages: [msg] });

      const result = await searchMessages(workspaceId, userId, {
        query: 'hello',
        userId: 'user-2',
      });

      expect(result.results).toHaveLength(1);
    });

    it('resolves userName to userId via database lookup', async () => {
      const msg = makeMockMessage({ userId: 'user-2', authorName: 'Bob' });
      setupMocks({
        messages: [msg],
        matchingUser: { id: 'user-2' },
      });

      const result = await searchMessages(workspaceId, userId, {
        query: 'hello',
        userName: 'bob',
      });

      expect(mockFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: 'bob' },
          }),
        })
      );
      expect(result.results).toHaveLength(1);
    });

    it('returns empty when userName does not resolve', async () => {
      setupMocks({
        channelMemberships: [{ channelId: 'ch-1' }],
        workspaceChannels: [{ id: 'ch-1', name: 'general' }],
        matchingUser: null,
      });

      const result = await searchMessages(workspaceId, userId, {
        query: 'hello',
        userName: 'nonexistent',
      });

      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // has:file filter
  // -----------------------------------------------------------------------
  describe('has:file filter', () => {
    it('passes files filter to Prisma where clause', async () => {
      const msgWithFile = makeMockMessage({ id: 'msg-with-file', fileCount: 2 });
      setupMocks({ messages: [msgWithFile] });

      const result = await searchMessages(workspaceId, userId, {
        query: 'hello',
        hasFile: true,
      });

      // The message.findMany (3rd call) should include files: { some: {} }
      const msgCall = mockFindMany.mock.calls[2];
      expect(msgCall[0].where.files).toEqual({ some: {} });
      expect(result.results).toHaveLength(1);
      expect(result.results[0].message.id).toBe('msg-with-file');
      expect(result.results[0].message.fileCount).toBe(2);
    });

    it('does not include files filter when hasFile is not set', async () => {
      const msgWithFile = makeMockMessage({ id: 'msg-1', fileCount: 1 });
      const msgNoFile = makeMockMessage({ id: 'msg-2', fileCount: 0 });
      setupMocks({ messages: [msgWithFile, msgNoFile] });

      const result = await searchMessages(workspaceId, userId, { query: 'hello' });

      // The message.findMany (3rd call) should NOT include files filter
      const msgCall = mockFindMany.mock.calls[2];
      expect(msgCall[0].where.files).toBeUndefined();
      expect(result.results).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // Pagination
  // -----------------------------------------------------------------------
  describe('pagination', () => {
    it('returns hasMore=false when results fit within limit', async () => {
      const messages = [makeMockMessage({ id: 'msg-1' })];
      setupMocks({ messages, totalCount: 1 });

      const result = await searchMessages(workspaceId, userId, { query: 'hello' }, undefined, 20);

      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });

    it('returns hasMore=true and cursor when more results exist', async () => {
      // Create limit+1 messages to trigger hasMore
      const messages = Array.from({ length: 3 }, (_, i) =>
        makeMockMessage({ id: `msg-${i}`, text: 'hello' })
      );
      setupMocks({ messages, totalCount: 5 });

      const result = await searchMessages(workspaceId, userId, { query: 'hello' }, undefined, 2);

      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBeTruthy();
      // Should return at most `limit` results
      expect(result.results.length).toBeLessThanOrEqual(2);
    });

    it('passes cursor to Prisma for pagination', async () => {
      setupMocks({ messages: [] });

      await searchMessages(workspaceId, userId, { query: 'hello' }, 'cursor-msg-id', 10);

      // The message.findMany call (3rd call) should include cursor params
      const messagesFindManyCall = mockFindMany.mock.calls[2];
      expect(messagesFindManyCall[0]).toEqual(
        expect.objectContaining({
          cursor: { id: 'cursor-msg-id' },
          skip: 1,
        })
      );
    });
  });

  // -----------------------------------------------------------------------
  // Content JSON parsing
  // -----------------------------------------------------------------------
  describe('content JSON parsing', () => {
    it('parses contentJson from string to TiptapJSON', async () => {
      const msg = makeMockMessage({ text: 'hello' });
      setupMocks({ messages: [msg] });

      const result = await searchMessages(workspaceId, userId, { query: 'hello' });

      expect(result.results[0].message.content).toEqual({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
      });
    });

    it('handles invalid contentJson gracefully', async () => {
      const msg = makeMockMessage({ text: 'test' });
      msg.contentJson = 'invalid json';
      setupMocks({ messages: [msg] });

      const result = await searchMessages(workspaceId, userId, { query: 'test' });

      expect(result.results[0].message.content).toEqual({
        type: 'doc',
        content: [],
      });
    });
  });

  // -----------------------------------------------------------------------
  // Date range filtering
  // -----------------------------------------------------------------------
  describe('date range filtering', () => {
    it('passes before date to the where clause', async () => {
      const beforeDate = new Date('2024-06-01T23:59:59.999Z');
      setupMocks({ messages: [] });

      await searchMessages(workspaceId, userId, {
        query: 'hello',
        before: beforeDate,
      });

      // The message.findMany (3rd call) where clause should have createdAt
      const msgCall = mockFindMany.mock.calls[2];
      expect(msgCall[0].where.createdAt).toEqual(
        expect.objectContaining({ lte: beforeDate })
      );
    });

    it('passes after date to the where clause', async () => {
      const afterDate = new Date('2024-01-01T00:00:00.000Z');
      setupMocks({ messages: [] });

      await searchMessages(workspaceId, userId, {
        query: 'hello',
        after: afterDate,
      });

      const msgCall = mockFindMany.mock.calls[2];
      expect(msgCall[0].where.createdAt).toEqual(
        expect.objectContaining({ gte: afterDate })
      );
    });

    it('passes both before and after dates', async () => {
      const beforeDate = new Date('2024-06-01T23:59:59.999Z');
      const afterDate = new Date('2024-01-01T00:00:00.000Z');
      setupMocks({ messages: [] });

      await searchMessages(workspaceId, userId, {
        query: 'hello',
        before: beforeDate,
        after: afterDate,
      });

      const msgCall = mockFindMany.mock.calls[2];
      expect(msgCall[0].where.createdAt).toEqual({
        lte: beforeDate,
        gte: afterDate,
      });
    });
  });

  // -----------------------------------------------------------------------
  // Search response shape
  // -----------------------------------------------------------------------
  describe('response shape', () => {
    it('returns correctly shaped SearchResponse', async () => {
      const msg = makeMockMessage({ text: 'hello world' });
      setupMocks({ messages: [msg], totalCount: 1 });

      const result = await searchMessages(workspaceId, userId, { query: 'hello' });

      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('cursor');
      expect(result).toHaveProperty('hasMore');
      expect(result).toHaveProperty('total');
      expect(typeof result.total).toBe('number');
      expect(typeof result.hasMore).toBe('boolean');
    });

    it('includes author info in each result message', async () => {
      const msg = makeMockMessage({ userId: 'user-1', authorName: 'Alice' });
      setupMocks({ messages: [msg] });

      const result = await searchMessages(workspaceId, userId, { query: 'hello' });

      expect(result.results[0].message.author).toEqual({
        id: 'user-1',
        name: 'Alice',
        image: null,
      });
    });

    it('maps channelId to channel name in results', async () => {
      const msg = makeMockMessage({ channelId: 'ch-1' });
      setupMocks({
        channelMemberships: [{ channelId: 'ch-1' }],
        workspaceChannels: [{ id: 'ch-1', name: 'engineering' }],
        messages: [msg],
      });

      const result = await searchMessages(workspaceId, userId, { query: 'hello' });

      expect(result.results[0].channelName).toBe('engineering');
    });
  });
});
