/**
 * Tests for messages/queries.ts
 *
 * Covers:
 * - groupReactions: groups flat reactions into ReactionGroup[]
 * - getMessages: cursor-based pagination, DESC ordering, limit clamping
 * - getThreadReplies: ASC ordering
 * - getMessageById: single message lookup
 * - getThreadInfo: reply count, participants, lastReplyAt
 * - getPinnedMessages: ordered by pinnedAt DESC
 * - toMessageWithMeta: soft-deleted content hiding, JSON parse fallback
 */

jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    message: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    pin: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/shared/lib/prisma';
import {
  groupReactions,
  getMessages,
  getThreadReplies,
  getMessageById,
  getThreadInfo,
  getPinnedMessages,
} from '@/messages/queries';

const mockedPrisma = prisma as unknown as {
  message: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
  };
  pin: {
    findMany: jest.Mock;
  };
};

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makePrismaMessage(overrides: Partial<{
  id: string;
  channelId: string;
  userId: string;
  contentJson: string;
  contentPlain: string;
  parentId: string | null;
  replyCount: number;
  isEdited: boolean;
  isDeleted: boolean;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  author: { id: string; name: string | null; image: string | null };
  files: any[];
  reactions: any[];
}> = {}) {
  return {
    id: 'msg-1',
    channelId: 'ch-1',
    userId: 'user-1',
    contentJson: JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    }),
    contentPlain: 'Hello',
    parentId: null,
    replyCount: 0,
    isEdited: false,
    isDeleted: false,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date('2024-01-01T12:00:00Z'),
    author: { id: 'user-1', name: 'Alice', image: null },
    files: [],
    reactions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// groupReactions
// ---------------------------------------------------------------------------

describe('groupReactions', () => {
  it('returns empty array for empty input', () => {
    expect(groupReactions([])).toEqual([]);
  });

  it('groups reactions by emoji', () => {
    const result = groupReactions([
      { emoji: '👍', userId: 'u1' },
      { emoji: '👍', userId: 'u2' },
      { emoji: '❤️', userId: 'u1' },
    ]);

    expect(result).toHaveLength(2);

    const thumbs = result.find((r) => r.emoji === '👍');
    expect(thumbs).toEqual({
      emoji: '👍',
      count: 2,
      userIds: ['u1', 'u2'],
    });

    const heart = result.find((r) => r.emoji === '❤️');
    expect(heart).toEqual({
      emoji: '❤️',
      count: 1,
      userIds: ['u1'],
    });
  });

  it('preserves insertion order of emojis', () => {
    const result = groupReactions([
      { emoji: '🔥', userId: 'u1' },
      { emoji: '👍', userId: 'u1' },
      { emoji: '🔥', userId: 'u2' },
    ]);

    expect(result[0].emoji).toBe('🔥');
    expect(result[1].emoji).toBe('👍');
  });

  it('handles single reaction', () => {
    const result = groupReactions([{ emoji: '👍', userId: 'u1' }]);
    expect(result).toEqual([{ emoji: '👍', count: 1, userIds: ['u1'] }]);
  });

  it('handles many users on same emoji', () => {
    const reactions = Array.from({ length: 10 }, (_, i) => ({
      emoji: '🎉',
      userId: `u${i}`,
    }));
    const result = groupReactions(reactions);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(10);
    expect(result[0].userIds).toHaveLength(10);
  });
});

// ---------------------------------------------------------------------------
// getMessages
// ---------------------------------------------------------------------------

describe('getMessages', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches messages with default limit (50) plus 1 for hasMore check', async () => {
    mockedPrisma.message.findMany.mockResolvedValue([]);

    await getMessages('ch-1');

    expect(mockedPrisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { channelId: 'ch-1', parentId: null },
        orderBy: { createdAt: 'desc' },
        take: 51, // 50 + 1
      })
    );
  });

  it('respects custom limit', async () => {
    mockedPrisma.message.findMany.mockResolvedValue([]);

    await getMessages('ch-1', { limit: 10 });

    expect(mockedPrisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 11 }) // 10 + 1
    );
  });

  it('clamps limit to MAX_MESSAGES_PER_PAGE (100)', async () => {
    mockedPrisma.message.findMany.mockResolvedValue([]);

    await getMessages('ch-1', { limit: 500 });

    expect(mockedPrisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 101 }) // 100 + 1
    );
  });

  it('clamps limit minimum to 1', async () => {
    mockedPrisma.message.findMany.mockResolvedValue([]);

    await getMessages('ch-1', { limit: 0 });

    // The fallback is MESSAGES_PER_PAGE (50) since Math.max(0 || 50, 1) = 50
    expect(mockedPrisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 51 })
    );
  });

  it('returns hasMore=true when more results than limit', async () => {
    const messages = Array.from({ length: 6 }, (_, i) =>
      makePrismaMessage({ id: `msg-${i}`, createdAt: new Date(2024, 0, 1, i) })
    );
    mockedPrisma.message.findMany.mockResolvedValue(messages);

    const result = await getMessages('ch-1', { limit: 5 });

    expect(result.hasMore).toBe(true);
    expect(result.messages).toHaveLength(5);
  });

  it('returns hasMore=false when results fit within limit', async () => {
    const messages = [makePrismaMessage()];
    mockedPrisma.message.findMany.mockResolvedValue(messages);

    const result = await getMessages('ch-1', { limit: 5 });

    expect(result.hasMore).toBe(false);
    expect(result.messages).toHaveLength(1);
  });

  it('returns nextCursor as last message ID', async () => {
    const messages = [
      makePrismaMessage({ id: 'msg-1' }),
      makePrismaMessage({ id: 'msg-2' }),
    ];
    mockedPrisma.message.findMany.mockResolvedValue(messages);

    const result = await getMessages('ch-1', { limit: 5 });

    expect(result.nextCursor).toBe('msg-2');
  });

  it('returns null nextCursor when no results', async () => {
    mockedPrisma.message.findMany.mockResolvedValue([]);

    const result = await getMessages('ch-1');

    expect(result.nextCursor).toBeNull();
    expect(result.messages).toEqual([]);
  });

  it('passes cursor for pagination', async () => {
    mockedPrisma.message.findMany.mockResolvedValue([]);

    await getMessages('ch-1', { cursor: 'msg-cursor' });

    expect(mockedPrisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: 'msg-cursor' },
        skip: 1,
      })
    );
  });

  it('omits cursor params when no cursor provided', async () => {
    mockedPrisma.message.findMany.mockResolvedValue([]);

    await getMessages('ch-1');

    const call = mockedPrisma.message.findMany.mock.calls[0][0];
    expect(call.cursor).toBeUndefined();
    expect(call.skip).toBeUndefined();
  });

  it('hides content for soft-deleted messages', async () => {
    const messages = [
      makePrismaMessage({
        isDeleted: true,
        deletedAt: new Date(),
      }),
    ];
    mockedPrisma.message.findMany.mockResolvedValue(messages);

    const result = await getMessages('ch-1');

    expect(result.messages[0].content).toEqual({ type: 'doc', content: [] });
    expect(result.messages[0].contentPlain).toBe('');
  });

  it('parses contentJson and maps author correctly', async () => {
    const messages = [
      makePrismaMessage({
        author: { id: 'user-1', name: null, image: 'img.jpg' },
      }),
    ];
    mockedPrisma.message.findMany.mockResolvedValue(messages);

    const result = await getMessages('ch-1');

    expect(result.messages[0].author.name).toBe('Unknown');
    expect(result.messages[0].author.image).toBe('img.jpg');
    expect(result.messages[0].content.type).toBe('doc');
  });

  it('falls back to plain text wrapper on invalid JSON', async () => {
    const messages = [
      makePrismaMessage({
        contentJson: 'not valid json {{{',
        contentPlain: 'fallback text',
      }),
    ];
    mockedPrisma.message.findMany.mockResolvedValue(messages);

    const result = await getMessages('ch-1');

    expect(result.messages[0].content.type).toBe('doc');
    expect(result.messages[0].content.content[0].type).toBe('paragraph');
  });
});

// ---------------------------------------------------------------------------
// getThreadReplies
// ---------------------------------------------------------------------------

describe('getThreadReplies', () => {
  beforeEach(() => jest.clearAllMocks());

  it('queries with parentId and ASC order', async () => {
    mockedPrisma.message.findMany.mockResolvedValue([]);

    await getThreadReplies('parent-msg-1');

    expect(mockedPrisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { parentId: 'parent-msg-1' },
        orderBy: { createdAt: 'asc' },
      })
    );
  });

  it('returns mapped MessageWithMeta array', async () => {
    const replies = [
      makePrismaMessage({ id: 'reply-1', parentId: 'parent-1' }),
      makePrismaMessage({ id: 'reply-2', parentId: 'parent-1' }),
    ];
    mockedPrisma.message.findMany.mockResolvedValue(replies);

    const result = await getThreadReplies('parent-1');

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('reply-1');
    expect(result[1].id).toBe('reply-2');
  });

  it('returns empty array when no replies', async () => {
    mockedPrisma.message.findMany.mockResolvedValue([]);

    const result = await getThreadReplies('parent-1');

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getMessageById
// ---------------------------------------------------------------------------

describe('getMessageById', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when message not found', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue(null);

    const result = await getMessageById('nonexistent');

    expect(result).toBeNull();
  });

  it('returns MessageWithMeta when found', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue(makePrismaMessage());

    const result = await getMessageById('msg-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('msg-1');
    expect(result!.content.type).toBe('doc');
  });

  it('groups reactions on single message', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue(
      makePrismaMessage({
        reactions: [
          { emoji: '👍', userId: 'u1' },
          { emoji: '👍', userId: 'u2' },
        ],
      })
    );

    const result = await getMessageById('msg-1');

    expect(result!.reactions).toHaveLength(1);
    expect(result!.reactions[0].emoji).toBe('👍');
    expect(result!.reactions[0].count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getThreadInfo
// ---------------------------------------------------------------------------

describe('getThreadInfo', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when message not found', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue(null);

    const result = await getThreadInfo('nonexistent');

    expect(result).toBeNull();
  });

  it('returns zero replyCount and empty participants when no replies', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({ replyCount: 0 });

    const result = await getThreadInfo('msg-1');

    expect(result).toEqual({
      replyCount: 0,
      lastReplyAt: null,
      participants: [],
    });
  });

  it('returns correct reply count and deduped participants', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({ replyCount: 3 });
    mockedPrisma.message.findMany.mockResolvedValue([
      {
        createdAt: new Date('2024-06-03'),
        author: { id: 'u1', name: 'Alice', image: null },
      },
      {
        createdAt: new Date('2024-06-02'),
        author: { id: 'u2', name: 'Bob', image: 'bob.jpg' },
      },
      {
        createdAt: new Date('2024-06-01'),
        author: { id: 'u1', name: 'Alice', image: null },
      },
    ]);

    const result = await getThreadInfo('msg-1');

    expect(result!.replyCount).toBe(3);
    expect(result!.lastReplyAt).toEqual(new Date('2024-06-03'));
    expect(result!.participants).toHaveLength(2);
    expect(result!.participants[0].id).toBe('u1');
    expect(result!.participants[1].id).toBe('u2');
  });

  it('handles null author name as "Unknown"', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({ replyCount: 1 });
    mockedPrisma.message.findMany.mockResolvedValue([
      {
        createdAt: new Date('2024-06-01'),
        author: { id: 'u1', name: null, image: null },
      },
    ]);

    const result = await getThreadInfo('msg-1');

    expect(result!.participants[0].name).toBe('Unknown');
  });
});

// ---------------------------------------------------------------------------
// getPinnedMessages
// ---------------------------------------------------------------------------

describe('getPinnedMessages', () => {
  beforeEach(() => jest.clearAllMocks());

  it('queries pins with DESC order by pinnedAt', async () => {
    mockedPrisma.pin.findMany.mockResolvedValue([]);

    await getPinnedMessages('ch-1');

    expect(mockedPrisma.pin.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { channelId: 'ch-1' },
        orderBy: { pinnedAt: 'desc' },
      })
    );
  });

  it('returns pinned messages mapped through toMessageWithMeta', async () => {
    mockedPrisma.pin.findMany.mockResolvedValue([
      { message: makePrismaMessage({ id: 'pinned-1' }) },
      { message: makePrismaMessage({ id: 'pinned-2' }) },
    ]);

    const result = await getPinnedMessages('ch-1');

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('pinned-1');
    expect(result[1].id).toBe('pinned-2');
  });

  it('returns empty array when no pins', async () => {
    mockedPrisma.pin.findMany.mockResolvedValue([]);

    const result = await getPinnedMessages('ch-1');

    expect(result).toEqual([]);
  });
});
