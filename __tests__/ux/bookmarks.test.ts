/**
 * Tests for bookmarks/actions.ts
 *
 * Covers:
 * - addBookmark: auth required, verifies message exists, upserts bookmark
 * - addBookmark: throws on deleted message
 * - removeBookmark: auth required, deletes matching bookmark
 * - getBookmarks: auth required, returns enriched BookmarkWithMessage[]
 * - getBookmarks: aggregates reactions into ReactionGroup[]
 * - getBookmarks: extracts text preview from Tiptap JSON
 * - searchBookmarks: filters by content, channelName, and author name
 * - searchBookmarks: empty query returns all bookmarks
 */

jest.mock('@/auth/auth', () => ({
  auth: jest.fn(),
}));

const mockBookmark = {
  findMany: jest.fn(),
  upsert: jest.fn(),
  deleteMany: jest.fn(),
};

const mockMessage = {
  findUnique: jest.fn(),
};

jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    bookmark: mockBookmark,
    message: mockMessage,
  },
}));

import { auth } from '@/auth/auth';
import { addBookmark, removeBookmark, getBookmarks, searchBookmarks } from '@/bookmarks/actions';

const mockedAuth = auth as unknown as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDbBookmark(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'bm-1',
    messageId: 'msg-1',
    userId: 'user-1',
    createdAt: new Date('2025-01-01'),
    message: {
      id: 'msg-1',
      channelId: 'ch-1',
      userId: 'user-2',
      parentId: null,
      replyCount: 0,
      isEdited: false,
      isDeleted: false,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      contentJson: JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
      }),
      contentPlain: 'Hello world',
      author: { id: 'user-2', name: 'Bob', image: null },
      channel: { id: 'ch-1', name: 'general' },
      files: [],
      reactions: [],
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// addBookmark
// ---------------------------------------------------------------------------

describe('addBookmark', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws Unauthorized when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    await expect(addBookmark('msg-1')).rejects.toThrow('Unauthorized');
  });

  it('throws when message does not exist', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockMessage.findUnique.mockResolvedValue(null);

    await expect(addBookmark('missing-msg')).rejects.toThrow('Message not found');
  });

  it('throws when message is soft-deleted', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockMessage.findUnique.mockResolvedValue({ id: 'msg-1', isDeleted: true });

    await expect(addBookmark('msg-1')).rejects.toThrow('Message not found');
  });

  it('upserts bookmark for valid message', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockMessage.findUnique.mockResolvedValue({ id: 'msg-1', isDeleted: false });
    mockBookmark.upsert.mockResolvedValue({});

    await addBookmark('msg-1');

    expect(mockBookmark.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { messageId_userId: { messageId: 'msg-1', userId: 'user-1' } },
        create: { messageId: 'msg-1', userId: 'user-1' },
      })
    );
  });

  it('is idempotent — upsert update is empty (no-op on duplicate)', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockMessage.findUnique.mockResolvedValue({ id: 'msg-1', isDeleted: false });
    mockBookmark.upsert.mockResolvedValue({});

    await addBookmark('msg-1');

    const call = mockBookmark.upsert.mock.calls[0][0];
    expect(call.update).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// removeBookmark
// ---------------------------------------------------------------------------

describe('removeBookmark', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws Unauthorized when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    await expect(removeBookmark('msg-1')).rejects.toThrow('Unauthorized');
  });

  it('calls deleteMany with correct where clause', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockBookmark.deleteMany.mockResolvedValue({ count: 1 });

    await removeBookmark('msg-1');

    expect(mockBookmark.deleteMany).toHaveBeenCalledWith({
      where: { messageId: 'msg-1', userId: 'user-1' },
    });
  });

  it('silently succeeds when bookmark does not exist (count=0)', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockBookmark.deleteMany.mockResolvedValue({ count: 0 });

    await expect(removeBookmark('nonexistent-msg')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getBookmarks
// ---------------------------------------------------------------------------

describe('getBookmarks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws Unauthorized when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    await expect(getBookmarks('ws-1')).rejects.toThrow('Unauthorized');
  });

  it('returns empty array when no bookmarks', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockBookmark.findMany.mockResolvedValue([]);

    const result = await getBookmarks('ws-1');
    expect(result).toEqual([]);
  });

  it('returns enriched BookmarkWithMessage objects', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockBookmark.findMany.mockResolvedValue([makeDbBookmark()]);

    const result = await getBookmarks('ws-1');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'bm-1',
      messageId: 'msg-1',
      userId: 'user-1',
      channelName: 'general',
      channelId: 'ch-1',
    });
  });

  it('extracts text preview from Tiptap JSON', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockBookmark.findMany.mockResolvedValue([makeDbBookmark()]);

    const result = await getBookmarks('ws-1');
    expect(result[0].contentPreview).toBe('Hello world');
  });

  it('truncates content preview at 120 chars', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    const longText = 'a'.repeat(200);
    const dbBookmark = makeDbBookmark({
      message: {
        ...makeDbBookmark().message,
        contentJson: JSON.stringify({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: longText }] }],
        }),
        contentPlain: longText,
      },
    });
    mockBookmark.findMany.mockResolvedValue([dbBookmark]);

    const result = await getBookmarks('ws-1');
    expect(result[0].contentPreview).toHaveLength(121); // 120 + '…'
    expect(result[0].contentPreview).toMatch(/…$/);
  });

  it('groups reactions into ReactionGroup objects', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    const dbBookmark = makeDbBookmark({
      message: {
        ...makeDbBookmark().message,
        reactions: [
          { emoji: '👍', userId: 'user-2' },
          { emoji: '👍', userId: 'user-3' },
          { emoji: '❤️', userId: 'user-1' },
        ],
      },
    });
    mockBookmark.findMany.mockResolvedValue([dbBookmark]);

    const result = await getBookmarks('ws-1');
    const reactions = result[0].message.reactions;

    const thumbsUp = reactions.find((r) => r.emoji === '👍');
    const heart = reactions.find((r) => r.emoji === '❤️');

    expect(thumbsUp?.count).toBe(2);
    expect(heart?.count).toBe(1);
    // hasReacted should be true for the authenticated user's reaction
    expect(heart?.hasReacted).toBe(true);
    expect(thumbsUp?.hasReacted).toBe(false);
  });

  it('hydrates message with correct userId and content', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockBookmark.findMany.mockResolvedValue([makeDbBookmark()]);

    const result = await getBookmarks('ws-1');
    expect(result[0].message.userId).toBe('user-2');
    expect(result[0].message.content).toMatchObject({ type: 'doc' });
  });

  it('throws when contentJson cannot be parsed (DB invariant violation)', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    const dbBookmark = makeDbBookmark({
      message: {
        ...makeDbBookmark().message,
        contentJson: 'invalid-json',
        contentPlain: 'fallback text',
      },
    });
    mockBookmark.findMany.mockResolvedValue([dbBookmark]);

    // The action calls JSON.parse(msg.contentJson) for the message content field —
    // if the DB stores malformed JSON this throws (intentional: DB should always store valid JSON)
    await expect(getBookmarks('ws-1')).rejects.toThrow(SyntaxError);
  });
});

// ---------------------------------------------------------------------------
// searchBookmarks
// ---------------------------------------------------------------------------

describe('searchBookmarks', () => {
  const bookmarksByChannel = [
    makeDbBookmark({
      id: 'bm-1',
      messageId: 'msg-1',
      message: {
        ...makeDbBookmark().message,
        id: 'msg-1',
        contentPlain: 'Deploy to production',
        contentJson: JSON.stringify({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Deploy to production' }] }],
        }),
        author: { id: 'user-2', name: 'Alice', image: null },
        channel: { id: 'ch-1', name: 'deployments' },
      },
    }),
    makeDbBookmark({
      id: 'bm-2',
      messageId: 'msg-2',
      message: {
        ...makeDbBookmark().message,
        id: 'msg-2',
        contentPlain: 'Team meeting notes',
        contentJson: JSON.stringify({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Team meeting notes' }] }],
        }),
        author: { id: 'user-3', name: 'Bob', image: null },
        channel: { id: 'ch-2', name: 'general' },
      },
    }),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockBookmark.findMany.mockResolvedValue(bookmarksByChannel);
  });

  it('returns all bookmarks when query is empty string', async () => {
    const result = await searchBookmarks('ws-1', '');
    expect(result).toHaveLength(2);
  });

  it('returns all bookmarks when query is whitespace only', async () => {
    const result = await searchBookmarks('ws-1', '   ');
    expect(result).toHaveLength(2);
  });

  it('filters by content preview (case-insensitive)', async () => {
    const result = await searchBookmarks('ws-1', 'deploy');
    expect(result).toHaveLength(1);
    expect(result[0].channelName).toBe('deployments');
  });

  it('filters by channel name (case-insensitive)', async () => {
    const result = await searchBookmarks('ws-1', 'GENERAL');
    expect(result).toHaveLength(1);
    expect(result[0].channelName).toBe('general');
  });

  it('filters by author name (case-insensitive)', async () => {
    const result = await searchBookmarks('ws-1', 'alice');
    expect(result).toHaveLength(1);
    expect(result[0].message.author.name).toBe('Alice');
  });

  it('returns empty array when no bookmarks match', async () => {
    const result = await searchBookmarks('ws-1', 'zxyzxyzxy');
    expect(result).toHaveLength(0);
  });

  it('throws Unauthorized when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    await expect(searchBookmarks('ws-1', 'query')).rejects.toThrow('Unauthorized');
  });
});
