/**
 * Tests for messages/actions.ts
 *
 * Covers:
 * - sendMessage: creates message with correct userId, connects files, thread replies
 * - editMessage: validates ownership, sets isEdited, rejects deleted messages
 * - deleteMessage: soft-deletes, validates ownership, allows admin override
 * - pinMessage: validates channel, respects max 100 limit, rejects duplicates
 * - unpinMessage: validates pin exists and belongs to channel
 * - addReaction: upserts reaction, returns grouped reactions
 * - removeReaction: deletes reaction, returns updated groups
 * - bookmarkMessage: idempotent upsert
 */

jest.mock('@/auth/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    message: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    reaction: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    pin: {
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    bookmark: {
      upsert: jest.fn(),
    },
    channel: {
      findUnique: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    workspaceMember: {
      findUnique: jest.fn(),
    },
  },
}));

// Mock getMessageById from queries since sendMessage/editMessage use it
jest.mock('@/messages/queries', () => ({
  getMessageById: jest.fn(),
  groupReactions: jest.requireActual('@/messages/queries').groupReactions,
}));

import { auth } from '@/auth/auth';
import { prisma } from '@/shared/lib/prisma';
import { getMessageById } from '@/messages/queries';
import {
  sendMessage,
  editMessage,
  deleteMessage,
  pinMessage,
  unpinMessage,
  addReaction,
  removeReaction,
  bookmarkMessage,
} from '@/messages/actions';

const mockedAuth = auth as unknown as jest.Mock;
const mockedPrisma = prisma as unknown as {
  message: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  reaction: {
    upsert: jest.Mock;
    findMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  pin: {
    findUnique: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
  };
  bookmark: {
    upsert: jest.Mock;
  };
  channel: {
    findUnique: jest.Mock;
  };
  notification: {
    create: jest.Mock;
  };
  workspaceMember: {
    findUnique: jest.Mock;
  };
};
const mockedGetMessageById = getMessageById as jest.Mock;

const validContent = {
  type: 'doc' as const,
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
};

const mockMessageWithMeta = {
  id: 'msg-1',
  channelId: 'ch-1',
  userId: 'user-1',
  content: validContent,
  contentPlain: 'Hello world',
  parentId: null,
  replyCount: 0,
  isEdited: false,
  isDeleted: false,
  editedAt: null,
  deletedAt: null,
  createdAt: new Date(),
  author: { id: 'user-1', name: 'Alice', image: null },
  files: [],
  reactions: [],
};

// ---------------------------------------------------------------------------
// sendMessage
// ---------------------------------------------------------------------------

describe('sendMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: authenticated as user-1
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('throws when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    await expect(
      sendMessage({ channelId: 'ch-1', content: validContent })
    ).rejects.toThrow('Unauthorized');
  });

  it('creates message with correct userId and channelId', async () => {
    mockedPrisma.message.create.mockResolvedValue({
      id: 'msg-new',
      channelId: 'ch-1',
      userId: 'user-1',
      reactions: [],
      files: [],
      author: { id: 'user-1', name: 'Alice', image: null },
    });
    mockedGetMessageById.mockResolvedValue(mockMessageWithMeta);
    mockedPrisma.channel.findUnique.mockResolvedValue({ workspaceId: 'ws-1' });

    await sendMessage({ channelId: 'ch-1', content: validContent });

    expect(mockedPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channelId: 'ch-1',
          userId: 'user-1',
          contentPlain: 'Hello world',
        }),
      })
    );
  });

  it('stores content as JSON string', async () => {
    mockedPrisma.message.create.mockResolvedValue({
      id: 'msg-new',
      channelId: 'ch-1',
      userId: 'user-1',
      reactions: [],
      files: [],
      author: { id: 'user-1', name: 'Alice', image: null },
    });
    mockedGetMessageById.mockResolvedValue(mockMessageWithMeta);
    mockedPrisma.channel.findUnique.mockResolvedValue({ workspaceId: 'ws-1' });

    await sendMessage({ channelId: 'ch-1', content: validContent });

    const createCall = mockedPrisma.message.create.mock.calls[0][0];
    expect(createCall.data.contentJson).toBe(JSON.stringify(validContent));
  });

  it('connects file attachments when fileIds provided', async () => {
    mockedPrisma.message.create.mockResolvedValue({
      id: 'msg-new',
      channelId: 'ch-1',
      userId: 'user-1',
      reactions: [],
      files: [],
      author: { id: 'user-1', name: 'Alice', image: null },
    });
    mockedGetMessageById.mockResolvedValue(mockMessageWithMeta);
    mockedPrisma.channel.findUnique.mockResolvedValue({ workspaceId: 'ws-1' });

    await sendMessage({
      channelId: 'ch-1',
      content: validContent,
      fileIds: ['file-1', 'file-2'],
    });

    const createCall = mockedPrisma.message.create.mock.calls[0][0];
    expect(createCall.data.files).toEqual({
      connect: [{ id: 'file-1' }, { id: 'file-2' }],
    });
  });

  it('validates parentId exists before creating thread reply', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue(null);

    await expect(
      sendMessage({
        channelId: 'ch-1',
        content: validContent,
        parentId: 'nonexistent',
      })
    ).rejects.toThrow('Parent message not found');
  });

  it('validates parent message belongs to same channel', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({
      id: 'parent-1',
      channelId: 'ch-other',
    });

    await expect(
      sendMessage({
        channelId: 'ch-1',
        content: validContent,
        parentId: 'parent-1',
      })
    ).rejects.toThrow('Parent message does not belong to this channel');
  });

  it('increments parent replyCount for thread replies', async () => {
    // Parent message lookup
    mockedPrisma.message.findUnique.mockResolvedValue({
      id: 'parent-1',
      channelId: 'ch-1',
    });
    mockedPrisma.message.create.mockResolvedValue({
      id: 'reply-1',
      channelId: 'ch-1',
      userId: 'user-1',
      reactions: [],
      files: [],
      author: { id: 'user-1', name: 'Alice', image: null },
    });
    mockedGetMessageById.mockResolvedValue({
      ...mockMessageWithMeta,
      id: 'reply-1',
      parentId: 'parent-1',
    });
    mockedPrisma.channel.findUnique.mockResolvedValue({ workspaceId: 'ws-1' });

    await sendMessage({
      channelId: 'ch-1',
      content: validContent,
      parentId: 'parent-1',
    });

    expect(mockedPrisma.message.update).toHaveBeenCalledWith({
      where: { id: 'parent-1' },
      data: { replyCount: { increment: 1 } },
    });
  });

  it('extracts plain text from Tiptap content', async () => {
    const contentWithMultipleBlocks = {
      type: 'doc' as const,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Line 1' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Line 2' }] },
      ],
    };

    mockedPrisma.message.create.mockResolvedValue({
      id: 'msg-new',
      channelId: 'ch-1',
      userId: 'user-1',
      reactions: [],
      files: [],
      author: { id: 'user-1', name: 'Alice', image: null },
    });
    mockedGetMessageById.mockResolvedValue(mockMessageWithMeta);
    mockedPrisma.channel.findUnique.mockResolvedValue({ workspaceId: 'ws-1' });

    await sendMessage({ channelId: 'ch-1', content: contentWithMultipleBlocks });

    const createCall = mockedPrisma.message.create.mock.calls[0][0];
    expect(createCall.data.contentPlain).toBe('Line 1\nLine 2');
  });
});

// ---------------------------------------------------------------------------
// editMessage
// ---------------------------------------------------------------------------

describe('editMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('throws when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    await expect(editMessage('msg-1', validContent)).rejects.toThrow(
      'Unauthorized'
    );
  });

  it('throws when message not found', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue(null);

    await expect(editMessage('nonexistent', validContent)).rejects.toThrow(
      'Message not found'
    );
  });

  it('throws when message is deleted', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({
      userId: 'user-1',
      channelId: 'ch-1',
      isDeleted: true,
    });

    await expect(editMessage('msg-1', validContent)).rejects.toThrow(
      'Cannot edit a deleted message'
    );
  });

  it('throws when editing another user\'s message', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({
      userId: 'user-2',
      channelId: 'ch-1',
      isDeleted: false,
    });

    await expect(editMessage('msg-1', validContent)).rejects.toThrow(
      'Not authorized to edit this message'
    );
  });

  it('updates message with isEdited=true and editedAt', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({
      userId: 'user-1',
      channelId: 'ch-1',
      isDeleted: false,
    });
    mockedPrisma.message.update.mockResolvedValue({});
    mockedGetMessageById.mockResolvedValue({
      ...mockMessageWithMeta,
      isEdited: true,
    });

    const result = await editMessage('msg-1', validContent);

    expect(mockedPrisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: expect.objectContaining({
        isEdited: true,
        editedAt: expect.any(Date),
        contentJson: JSON.stringify(validContent),
      }),
    });
    expect(result.isEdited).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// deleteMessage
// ---------------------------------------------------------------------------

describe('deleteMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('throws when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    await expect(deleteMessage('msg-1')).rejects.toThrow('Unauthorized');
  });

  it('throws when message not found', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue(null);

    await expect(deleteMessage('nonexistent')).rejects.toThrow(
      'Message not found'
    );
  });

  it('throws when message is already deleted', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({
      userId: 'user-1',
      channelId: 'ch-1',
      isDeleted: true,
      channel: { workspaceId: 'ws-1' },
    });

    await expect(deleteMessage('msg-1')).rejects.toThrow(
      'Message is already deleted'
    );
  });

  it('soft-deletes own message', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({
      userId: 'user-1',
      channelId: 'ch-1',
      isDeleted: false,
      channel: { workspaceId: 'ws-1' },
    });

    await deleteMessage('msg-1');

    expect(mockedPrisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: expect.objectContaining({
        isDeleted: true,
        deletedAt: expect.any(Date),
      }),
    });
  });

  it('throws when non-owner/non-admin tries to delete another user\'s message', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({
      userId: 'user-2', // message by a different user
      channelId: 'ch-1',
      isDeleted: false,
      channel: { workspaceId: 'ws-1' },
    });
    // Current user is a regular MEMBER
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ role: 'MEMBER' });

    await expect(deleteMessage('msg-1')).rejects.toThrow(
      'Not authorized to delete this message'
    );
  });

  it('allows admin to delete another user\'s message', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({
      userId: 'user-2',
      channelId: 'ch-1',
      isDeleted: false,
      channel: { workspaceId: 'ws-1' },
    });
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ role: 'ADMIN' });

    await deleteMessage('msg-1');

    expect(mockedPrisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: expect.objectContaining({ isDeleted: true }),
    });
  });

  it('allows owner to delete another user\'s message', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({
      userId: 'user-2',
      channelId: 'ch-1',
      isDeleted: false,
      channel: { workspaceId: 'ws-1' },
    });
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue({ role: 'OWNER' });

    await deleteMessage('msg-1');

    expect(mockedPrisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'msg-1' },
      })
    );
  });

  it('throws when non-member tries to delete another user\'s message', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({
      userId: 'user-2',
      channelId: 'ch-1',
      isDeleted: false,
      channel: { workspaceId: 'ws-1' },
    });
    mockedPrisma.workspaceMember.findUnique.mockResolvedValue(null);

    await expect(deleteMessage('msg-1')).rejects.toThrow(
      'Not authorized to delete this message'
    );
  });
});

// ---------------------------------------------------------------------------
// pinMessage
// ---------------------------------------------------------------------------

describe('pinMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('throws when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    await expect(pinMessage('ch-1', 'msg-1')).rejects.toThrow('Unauthorized');
  });

  it('throws when message not found', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue(null);

    await expect(pinMessage('ch-1', 'nonexistent')).rejects.toThrow(
      'Message not found'
    );
  });

  it('throws when message belongs to different channel', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({
      channelId: 'ch-other',
      isDeleted: false,
    });

    await expect(pinMessage('ch-1', 'msg-1')).rejects.toThrow(
      'Message does not belong to this channel'
    );
  });

  it('throws when message is deleted', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({
      channelId: 'ch-1',
      isDeleted: true,
    });

    await expect(pinMessage('ch-1', 'msg-1')).rejects.toThrow(
      'Cannot pin a deleted message'
    );
  });

  it('throws when message is already pinned', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({
      channelId: 'ch-1',
      isDeleted: false,
    });
    mockedPrisma.pin.findUnique.mockResolvedValue({ id: 'pin-1' });

    await expect(pinMessage('ch-1', 'msg-1')).rejects.toThrow(
      'Message is already pinned'
    );
  });

  it('throws when pin limit (100) is reached', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({
      channelId: 'ch-1',
      isDeleted: false,
    });
    mockedPrisma.pin.findUnique.mockResolvedValue(null);
    mockedPrisma.pin.count.mockResolvedValue(100);

    await expect(pinMessage('ch-1', 'msg-1')).rejects.toThrow(
      'Maximum pin limit reached (100 pins per channel)'
    );
  });

  it('creates pin when all checks pass', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({
      channelId: 'ch-1',
      isDeleted: false,
    });
    mockedPrisma.pin.findUnique.mockResolvedValue(null);
    mockedPrisma.pin.count.mockResolvedValue(50);
    mockedPrisma.pin.create.mockResolvedValue({});

    await pinMessage('ch-1', 'msg-1');

    expect(mockedPrisma.pin.create).toHaveBeenCalledWith({
      data: {
        channelId: 'ch-1',
        messageId: 'msg-1',
        pinnedById: 'user-1',
      },
    });
  });
});

// ---------------------------------------------------------------------------
// unpinMessage
// ---------------------------------------------------------------------------

describe('unpinMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('throws when pin not found', async () => {
    mockedPrisma.pin.findUnique.mockResolvedValue(null);

    await expect(unpinMessage('ch-1', 'msg-1')).rejects.toThrow(
      'Message is not pinned'
    );
  });

  it('throws when pin belongs to different channel', async () => {
    mockedPrisma.pin.findUnique.mockResolvedValue({
      channelId: 'ch-other',
    });

    await expect(unpinMessage('ch-1', 'msg-1')).rejects.toThrow(
      'Pin does not belong to this channel'
    );
  });

  it('deletes pin when valid', async () => {
    mockedPrisma.pin.findUnique.mockResolvedValue({ channelId: 'ch-1' });

    await unpinMessage('ch-1', 'msg-1');

    expect(mockedPrisma.pin.delete).toHaveBeenCalledWith({
      where: { messageId: 'msg-1' },
    });
  });
});

// ---------------------------------------------------------------------------
// addReaction
// ---------------------------------------------------------------------------

describe('addReaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('throws when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    await expect(addReaction('msg-1', '👍')).rejects.toThrow('Unauthorized');
  });

  it('throws when message not found', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue(null);

    await expect(addReaction('nonexistent', '👍')).rejects.toThrow(
      'Message not found'
    );
  });

  it('upserts reaction with unique constraint', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({ channelId: 'ch-1' });
    mockedPrisma.reaction.upsert.mockResolvedValue({});
    mockedPrisma.reaction.findMany.mockResolvedValue([
      { emoji: '👍', userId: 'user-1' },
    ]);

    await addReaction('msg-1', '👍');

    expect(mockedPrisma.reaction.upsert).toHaveBeenCalledWith({
      where: {
        userId_messageId_emoji: {
          userId: 'user-1',
          messageId: 'msg-1',
          emoji: '👍',
        },
      },
      create: { messageId: 'msg-1', userId: 'user-1', emoji: '👍' },
      update: {},
    });
  });

  it('returns grouped reactions after adding', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({ channelId: 'ch-1' });
    mockedPrisma.reaction.upsert.mockResolvedValue({});
    mockedPrisma.reaction.findMany.mockResolvedValue([
      { emoji: '👍', userId: 'user-1' },
      { emoji: '👍', userId: 'user-2' },
      { emoji: '❤️', userId: 'user-1' },
    ]);

    const result = await addReaction('msg-1', '👍');

    expect(result).toHaveLength(2);
    expect(result.find((r) => r.emoji === '👍')?.count).toBe(2);
    expect(result.find((r) => r.emoji === '❤️')?.count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// removeReaction
// ---------------------------------------------------------------------------

describe('removeReaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('throws when message not found', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue(null);

    await expect(removeReaction('nonexistent', '👍')).rejects.toThrow(
      'Message not found'
    );
  });

  it('deletes the specific reaction', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({ channelId: 'ch-1' });
    mockedPrisma.reaction.deleteMany.mockResolvedValue({ count: 1 });
    mockedPrisma.reaction.findMany.mockResolvedValue([]);

    await removeReaction('msg-1', '👍');

    expect(mockedPrisma.reaction.deleteMany).toHaveBeenCalledWith({
      where: { messageId: 'msg-1', userId: 'user-1', emoji: '👍' },
    });
  });

  it('returns updated reaction groups after removal', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({ channelId: 'ch-1' });
    mockedPrisma.reaction.deleteMany.mockResolvedValue({ count: 1 });
    mockedPrisma.reaction.findMany.mockResolvedValue([
      { emoji: '❤️', userId: 'user-2' },
    ]);

    const result = await removeReaction('msg-1', '👍');

    expect(result).toHaveLength(1);
    expect(result[0].emoji).toBe('❤️');
  });

  it('returns empty array when all reactions removed', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({ channelId: 'ch-1' });
    mockedPrisma.reaction.deleteMany.mockResolvedValue({ count: 1 });
    mockedPrisma.reaction.findMany.mockResolvedValue([]);

    const result = await removeReaction('msg-1', '👍');

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// bookmarkMessage
// ---------------------------------------------------------------------------

describe('bookmarkMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('throws when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    await expect(bookmarkMessage('msg-1')).rejects.toThrow('Unauthorized');
  });

  it('throws when message not found', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue(null);

    await expect(bookmarkMessage('nonexistent')).rejects.toThrow(
      'Message not found'
    );
  });

  it('upserts bookmark (idempotent)', async () => {
    mockedPrisma.message.findUnique.mockResolvedValue({ id: 'msg-1' });
    mockedPrisma.bookmark.upsert.mockResolvedValue({});

    await bookmarkMessage('msg-1');

    expect(mockedPrisma.bookmark.upsert).toHaveBeenCalledWith({
      where: {
        messageId_userId: { messageId: 'msg-1', userId: 'user-1' },
      },
      create: { messageId: 'msg-1', userId: 'user-1' },
      update: {},
    });
  });
});
