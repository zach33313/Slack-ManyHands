/**
 * Tests for server/socket-handlers/messages.ts
 *
 * Verifies message event handlers:
 * - message:send creates message in DB and emits message:new to channel room
 * - message:edit updates message and emits message:updated (only for own messages)
 * - message:delete soft-deletes and emits message:deleted
 * - message:react creates reaction and emits reaction:updated
 * - message:unreact removes reaction and emits reaction:updated
 */

// Mock @prisma/client before importing the handler
const mockPrismaMessage = {
  create: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
  findMany: jest.fn(),
  count: jest.fn(),
};

const mockPrismaReaction = {
  findMany: jest.fn(),
  upsert: jest.fn(),
  deleteMany: jest.fn(),
};

const mockPrismaFileAttachment = {
  updateMany: jest.fn(),
};

const mockPrismaUser = {
  findUnique: jest.fn(),
};

const mockPrismaChannelMember = {
  findUnique: jest.fn(),
  findMany: jest.fn(),
};

const mockPrismaChannel = {
  findUnique: jest.fn(),
};

const mockPrismaNotification = {
  create: jest.fn(),
};

const mockPrismaWorkspaceMember = {
  findUnique: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    message: mockPrismaMessage,
    reaction: mockPrismaReaction,
    fileAttachment: mockPrismaFileAttachment,
    user: mockPrismaUser,
    channelMember: mockPrismaChannelMember,
    channel: mockPrismaChannel,
    notification: mockPrismaNotification,
    workspaceMember: mockPrismaWorkspaceMember,
  })),
}));

jest.mock('../../shared/lib/constants', () => ({
  channelRoom: (id: string) => `channel:${id}`,
  userRoom: (id: string) => `user:${id}`,
  workspaceRoom: (id: string) => `workspace:${id}`,
}));

jest.mock('../../workflows/engine', () => ({
  executeWorkflowsForEvent: jest.fn().mockResolvedValue(undefined),
}));

import { registerMessageHandlers } from '../../server/socket-handlers/messages';

describe('Message Handlers', () => {
  let socket: any;
  let handlers: Record<string, (...args: any[]) => Promise<void>>;
  let mockNspEmit: jest.Mock;
  let mockNspTo: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockNspEmit = jest.fn();
    mockNspTo = jest.fn().mockReturnValue({ emit: mockNspEmit });

    handlers = {};
    socket = {
      data: { userId: 'user-1', email: 'user1@test.com' },
      on: jest.fn((event: string, handler: any) => {
        handlers[event] = handler;
      }),
      nsp: {
        to: mockNspTo,
      },
    };

    // Default: user is a channel member (required for message:send membership check)
    mockPrismaChannelMember.findUnique.mockResolvedValue({ channelId: 'ch-1', userId: 'user-1' });
    // Default: no other channel members (skips unread:update and DM notification loops)
    mockPrismaChannelMember.findMany.mockResolvedValue([]);
    // Default: channel not found (skips notification + workflow blocks)
    mockPrismaChannel.findUnique.mockResolvedValue(null);
    // Default: zero unread count
    mockPrismaMessage.count.mockResolvedValue(0);
    // Default: no thread participants
    mockPrismaMessage.findMany.mockResolvedValue([]);
    // Default: notification created successfully
    mockPrismaNotification.create.mockResolvedValue({ id: 'notif-1', createdAt: new Date() });

    registerMessageHandlers(socket);
  });

  // Helper to create a full message DB result
  function makeDbMessage(overrides: Record<string, unknown> = {}) {
    return {
      id: 'msg-1',
      channelId: 'ch-1',
      userId: 'user-1',
      contentJson: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] }),
      contentPlain: 'Hello',
      parentId: null,
      replyCount: 0,
      isEdited: false,
      isDeleted: false,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date('2026-01-01'),
      author: { id: 'user-1', name: 'Test User', image: null },
      files: [],
      reactions: [],
      ...overrides,
    };
  }

  describe('event registration', () => {
    it('registers all message event handlers', () => {
      expect(socket.on).toHaveBeenCalledWith('message:send', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('message:edit', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('message:delete', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('message:react', expect.any(Function));
      expect(socket.on).toHaveBeenCalledWith('message:unreact', expect.any(Function));
    });
  });

  describe('message:send', () => {
    it('creates a message in the database and emits message:new', async () => {
      const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }] };

      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-new' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage({ id: 'msg-new' }));

      await handlers['message:send']({ channelId: 'ch-1', content });

      // Should create message in DB
      expect(mockPrismaMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channelId: 'ch-1',
          userId: 'user-1',
          contentJson: JSON.stringify(content),
          contentPlain: 'Hello world',
          parentId: null,
        }),
      });

      // Should emit to channel room
      expect(mockNspTo).toHaveBeenCalledWith('channel:ch-1');
      expect(mockNspEmit).toHaveBeenCalledWith('message:new', expect.objectContaining({
        id: 'msg-new',
        channelId: 'ch-1',
      }));
    });

    it('handles thread reply with parentId', async () => {
      const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Reply' }] }] };

      mockPrismaMessage.create.mockResolvedValue({ id: 'reply-1' });
      mockPrismaMessage.update.mockResolvedValue({});
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage({ id: 'reply-1', parentId: 'parent-1' }));

      await handlers['message:send']({ channelId: 'ch-1', content, parentId: 'parent-1' });

      // Should create message with parentId
      expect(mockPrismaMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          parentId: 'parent-1',
        }),
      });

      // Should increment parent's reply count
      expect(mockPrismaMessage.update).toHaveBeenCalledWith({
        where: { id: 'parent-1' },
        data: { replyCount: { increment: 1 } },
      });

      // Should emit both message:new and thread:reply
      expect(mockNspEmit).toHaveBeenCalledWith('message:new', expect.any(Object));
      expect(mockNspEmit).toHaveBeenCalledWith('thread:reply', expect.any(Object));
    });

    it('associates file attachments when fileIds provided', async () => {
      const content = { type: 'doc', content: [] };

      mockPrismaMessage.create.mockResolvedValue({ id: 'msg-files' });
      mockPrismaMessage.findUnique.mockResolvedValue(makeDbMessage({ id: 'msg-files' }));

      await handlers['message:send']({
        channelId: 'ch-1',
        content,
        fileIds: ['file-1', 'file-2'],
      });

      expect(mockPrismaFileAttachment.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['file-1', 'file-2'] },
          userId: 'user-1',
        },
        data: { messageId: 'msg-files' },
      });
    });

    it('does nothing when channelId is missing', async () => {
      await handlers['message:send']({ channelId: '', content: { type: 'doc' } });

      expect(mockPrismaMessage.create).not.toHaveBeenCalled();
    });

    it('does nothing when content is missing', async () => {
      await handlers['message:send']({ channelId: 'ch-1', content: null });

      expect(mockPrismaMessage.create).not.toHaveBeenCalled();
    });

    it('handles database errors gracefully', async () => {
      const content = { type: 'doc', content: [] };
      mockPrismaMessage.create.mockRejectedValue(new Error('DB error'));

      // Should not throw
      await expect(
        handlers['message:send']({ channelId: 'ch-1', content })
      ).resolves.toBeUndefined();
    });
  });

  describe('message:edit', () => {
    it('updates message content and emits message:updated', async () => {
      const newContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated' }] }] };

      // First findUnique: ownership check
      mockPrismaMessage.findUnique.mockResolvedValueOnce({
        userId: 'user-1',
        channelId: 'ch-1',
        isDeleted: false,
      });
      // Update
      mockPrismaMessage.update.mockResolvedValue({});
      // Second findUnique: fetch full message
      mockPrismaMessage.findUnique.mockResolvedValueOnce(
        makeDbMessage({ isEdited: true, editedAt: new Date() })
      );

      await handlers['message:edit']({ messageId: 'msg-1', content: newContent });

      expect(mockPrismaMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: expect.objectContaining({
          contentJson: JSON.stringify(newContent),
          contentPlain: 'Updated',
          isEdited: true,
          editedAt: expect.any(Date),
        }),
      });

      expect(mockNspTo).toHaveBeenCalledWith('channel:ch-1');
      expect(mockNspEmit).toHaveBeenCalledWith('message:updated', expect.any(Object));
    });

    it('rejects edit when user does not own the message', async () => {
      mockPrismaMessage.findUnique.mockResolvedValue({
        userId: 'other-user',
        channelId: 'ch-1',
        isDeleted: false,
      });

      await handlers['message:edit']({
        messageId: 'msg-1',
        content: { type: 'doc', content: [] },
      });

      // Should NOT update
      expect(mockPrismaMessage.update).not.toHaveBeenCalled();
      expect(mockNspEmit).not.toHaveBeenCalled();
    });

    it('rejects edit when message is already deleted', async () => {
      mockPrismaMessage.findUnique.mockResolvedValue({
        userId: 'user-1',
        channelId: 'ch-1',
        isDeleted: true,
      });

      await handlers['message:edit']({
        messageId: 'msg-1',
        content: { type: 'doc', content: [] },
      });

      expect(mockPrismaMessage.update).not.toHaveBeenCalled();
    });

    it('does nothing when message not found', async () => {
      mockPrismaMessage.findUnique.mockResolvedValue(null);

      await handlers['message:edit']({
        messageId: 'nonexistent',
        content: { type: 'doc', content: [] },
      });

      expect(mockPrismaMessage.update).not.toHaveBeenCalled();
    });

    it('does nothing when messageId is empty', async () => {
      await handlers['message:edit']({ messageId: '', content: { type: 'doc' } });

      expect(mockPrismaMessage.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('message:delete', () => {
    it('soft-deletes message and emits message:deleted', async () => {
      mockPrismaMessage.findUnique.mockResolvedValue({
        userId: 'user-1',
        channelId: 'ch-1',
        isDeleted: false,
      });
      mockPrismaMessage.update.mockResolvedValue({});

      await handlers['message:delete']({ messageId: 'msg-1' });

      expect(mockPrismaMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: {
          isDeleted: true,
          deletedAt: expect.any(Date),
        },
      });

      expect(mockNspTo).toHaveBeenCalledWith('channel:ch-1');
      expect(mockNspEmit).toHaveBeenCalledWith('message:deleted', {
        messageId: 'msg-1',
        channelId: 'ch-1',
      });
    });

    it('rejects delete when user does not own the message', async () => {
      mockPrismaMessage.findUnique.mockResolvedValue({
        userId: 'other-user',
        channelId: 'ch-1',
        isDeleted: false,
      });

      await handlers['message:delete']({ messageId: 'msg-1' });

      expect(mockPrismaMessage.update).not.toHaveBeenCalled();
      expect(mockNspEmit).not.toHaveBeenCalled();
    });

    it('does nothing when message is already deleted', async () => {
      mockPrismaMessage.findUnique.mockResolvedValue({
        userId: 'user-1',
        channelId: 'ch-1',
        isDeleted: true,
      });

      await handlers['message:delete']({ messageId: 'msg-1' });

      expect(mockPrismaMessage.update).not.toHaveBeenCalled();
    });

    it('does nothing when messageId is empty', async () => {
      await handlers['message:delete']({ messageId: '' });

      expect(mockPrismaMessage.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('message:react', () => {
    it('creates reaction and emits reaction:updated', async () => {
      mockPrismaMessage.findUnique.mockResolvedValue({ channelId: 'ch-1' });
      mockPrismaReaction.upsert.mockResolvedValue({});
      mockPrismaReaction.findMany.mockResolvedValue([
        { emoji: '👍', userId: 'user-1' },
        { emoji: '👍', userId: 'user-2' },
      ]);

      await handlers['message:react']({ messageId: 'msg-1', emoji: '👍' });

      expect(mockPrismaReaction.upsert).toHaveBeenCalledWith({
        where: {
          userId_messageId_emoji: {
            userId: 'user-1',
            messageId: 'msg-1',
            emoji: '👍',
          },
        },
        create: {
          userId: 'user-1',
          messageId: 'msg-1',
          emoji: '👍',
        },
        update: {},
      });

      expect(mockNspTo).toHaveBeenCalledWith('channel:ch-1');
      expect(mockNspEmit).toHaveBeenCalledWith('reaction:updated', {
        messageId: 'msg-1',
        reactions: [
          { emoji: '👍', count: 2, userIds: ['user-1', 'user-2'] },
        ],
      });
    });

    it('does nothing when message not found', async () => {
      mockPrismaMessage.findUnique.mockResolvedValue(null);

      await handlers['message:react']({ messageId: 'nonexistent', emoji: '👍' });

      expect(mockPrismaReaction.upsert).not.toHaveBeenCalled();
    });

    it('does nothing when messageId is empty', async () => {
      await handlers['message:react']({ messageId: '', emoji: '👍' });

      expect(mockPrismaMessage.findUnique).not.toHaveBeenCalled();
    });

    it('does nothing when emoji is empty', async () => {
      await handlers['message:react']({ messageId: 'msg-1', emoji: '' });

      expect(mockPrismaMessage.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('message:unreact', () => {
    it('removes reaction and emits reaction:updated', async () => {
      mockPrismaMessage.findUnique.mockResolvedValue({ channelId: 'ch-1' });
      mockPrismaReaction.deleteMany.mockResolvedValue({ count: 1 });
      mockPrismaReaction.findMany.mockResolvedValue([]);

      await handlers['message:unreact']({ messageId: 'msg-1', emoji: '👍' });

      expect(mockPrismaReaction.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          messageId: 'msg-1',
          emoji: '👍',
        },
      });

      expect(mockNspTo).toHaveBeenCalledWith('channel:ch-1');
      expect(mockNspEmit).toHaveBeenCalledWith('reaction:updated', {
        messageId: 'msg-1',
        reactions: [],
      });
    });

    it('does nothing when message not found', async () => {
      mockPrismaMessage.findUnique.mockResolvedValue(null);

      await handlers['message:unreact']({ messageId: 'nonexistent', emoji: '👍' });

      expect(mockPrismaReaction.deleteMany).not.toHaveBeenCalled();
    });

    it('does nothing when messageId is empty', async () => {
      await handlers['message:unreact']({ messageId: '', emoji: '👍' });

      expect(mockPrismaMessage.findUnique).not.toHaveBeenCalled();
    });
  });
});
