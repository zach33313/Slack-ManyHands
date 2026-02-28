/**
 * Tests for messages API routes
 *
 * Covers:
 * - GET /api/channels/[channelId]/messages — paginated messages
 * - POST /api/channels/[channelId]/messages — create message
 * - GET /api/messages/[messageId] — single message
 * - PATCH /api/messages/[messageId] — edit message (ownership validation)
 * - DELETE /api/messages/[messageId] — soft-delete
 * - POST /api/messages/[messageId]/reactions — add reaction
 * - DELETE /api/messages/[messageId]/reactions — remove reaction
 * - GET /api/messages/[messageId]/threads — thread replies
 * - POST /api/messages/[messageId]/threads — create thread reply
 * - POST /api/messages/[messageId]/pin — pin message
 * - DELETE /api/messages/[messageId]/pin — unpin message
 */

jest.mock('@/auth/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/messages/queries', () => ({
  getMessages: jest.fn(),
  getMessageById: jest.fn(),
  getThreadReplies: jest.fn(),
}));

jest.mock('@/messages/actions', () => ({
  sendMessage: jest.fn(),
  editMessage: jest.fn(),
  deleteMessage: jest.fn(),
  addReaction: jest.fn(),
  removeReaction: jest.fn(),
  pinMessage: jest.fn(),
  unpinMessage: jest.fn(),
}));

import { auth } from '@/auth/auth';
import { getMessages, getMessageById, getThreadReplies } from '@/messages/queries';
import {
  sendMessage,
  editMessage,
  deleteMessage,
  addReaction,
  removeReaction,
  pinMessage,
  unpinMessage,
} from '@/messages/actions';

// Route handlers
import { GET as channelMessagesGET, POST as channelMessagesPOST } from '@/app/api/channels/[channelId]/messages/route';
import { GET as messageGET, PATCH as messagePATCH, DELETE as messageDELETE } from '@/app/api/messages/[messageId]/route';
import { POST as reactionPOST, DELETE as reactionDELETE } from '@/app/api/messages/[messageId]/reactions/route';
import { GET as threadsGET, POST as threadsPOST } from '@/app/api/messages/[messageId]/threads/route';
import { POST as pinPOST, DELETE as pinDELETE } from '@/app/api/messages/[messageId]/pin/route';

const mockedAuth = auth as unknown as jest.Mock;
const mockedGetMessages = getMessages as jest.Mock;
const mockedGetMessageById = getMessageById as jest.Mock;
const mockedGetThreadReplies = getThreadReplies as jest.Mock;
const mockedSendMessage = sendMessage as jest.Mock;
const mockedEditMessage = editMessage as jest.Mock;
const mockedDeleteMessage = deleteMessage as jest.Mock;
const mockedAddReaction = addReaction as jest.Mock;
const mockedRemoveReaction = removeReaction as jest.Mock;
const mockedPinMessage = pinMessage as jest.Mock;
const mockedUnpinMessage = unpinMessage as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a request object that mimics NextRequest.
 * Plain `Request` objects don't have `nextUrl`, but the route handlers
 * access `request.nextUrl.searchParams`. We add it manually.
 */
function createRequest(url: string, options?: RequestInit): any {
  const req = new Request(url, options);
  const parsedUrl = new URL(url);
  // Attach nextUrl so route handlers can access searchParams
  (req as any).nextUrl = parsedUrl;
  return req;
}

const validContent = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
};

const mockMessage = {
  id: 'msg-1',
  channelId: 'ch-1',
  userId: 'user-1',
  content: validContent,
  contentPlain: 'Hello',
  parentId: null,
  replyCount: 0,
  isEdited: false,
  isDeleted: false,
  editedAt: null,
  deletedAt: null,
  createdAt: new Date().toISOString(),
  author: { id: 'user-1', name: 'Alice', image: null },
  files: [],
  reactions: [],
};

// ---------------------------------------------------------------------------
// GET /api/channels/[channelId]/messages
// ---------------------------------------------------------------------------

describe('GET /api/channels/[channelId]/messages', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    const req = createRequest('http://localhost:3000/api/channels/ch-1/messages');
    const res = await channelMessagesGET(req as any, { params: { channelId: 'ch-1' } });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns paginated messages on success', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedGetMessages.mockResolvedValue({
      messages: [mockMessage],
      nextCursor: 'msg-1',
      hasMore: false,
    });

    const req = createRequest('http://localhost:3000/api/channels/ch-1/messages');
    const res = await channelMessagesGET(req as any, { params: { channelId: 'ch-1' } });
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.cursor).toBe('msg-1');
    expect(body.pagination.hasMore).toBe(false);
  });

  it('passes cursor and limit params to getMessages', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedGetMessages.mockResolvedValue({
      messages: [],
      nextCursor: null,
      hasMore: false,
    });

    const req = createRequest(
      'http://localhost:3000/api/channels/ch-1/messages?cursor=msg-cursor&limit=25'
    );
    const res = await channelMessagesGET(req as any, { params: { channelId: 'ch-1' } });

    expect(res.status).toBe(200);
    expect(mockedGetMessages).toHaveBeenCalledWith('ch-1', {
      cursor: 'msg-cursor',
      limit: 25,
    });
  });

  it('returns 400 for invalid limit', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });

    const req = createRequest(
      'http://localhost:3000/api/channels/ch-1/messages?limit=-1'
    );
    const res = await channelMessagesGET(req as any, { params: { channelId: 'ch-1' } });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for non-numeric limit', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });

    const req = createRequest(
      'http://localhost:3000/api/channels/ch-1/messages?limit=abc'
    );
    const res = await channelMessagesGET(req as any, { params: { channelId: 'ch-1' } });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// POST /api/channels/[channelId]/messages
// ---------------------------------------------------------------------------

describe('POST /api/channels/[channelId]/messages', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    const req = createRequest('http://localhost:3000/api/channels/ch-1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: validContent }),
    });
    const res = await channelMessagesPOST(req as any, { params: { channelId: 'ch-1' } });

    expect(res.status).toBe(401);
  });

  it('returns 400 when content is missing', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });

    const req = createRequest('http://localhost:3000/api/channels/ch-1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await channelMessagesPOST(req as any, { params: { channelId: 'ch-1' } });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid Tiptap content', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });

    const req = createRequest('http://localhost:3000/api/channels/ch-1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { type: 'invalid' } }),
    });
    const res = await channelMessagesPOST(req as any, { params: { channelId: 'ch-1' } });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for non-array fileIds', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });

    const req = createRequest('http://localhost:3000/api/channels/ch-1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: validContent, fileIds: 'not-array' }),
    });
    const res = await channelMessagesPOST(req as any, { params: { channelId: 'ch-1' } });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 201 on successful message creation', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedSendMessage.mockResolvedValue(mockMessage);

    const req = createRequest('http://localhost:3000/api/channels/ch-1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: validContent }),
    });
    const res = await channelMessagesPOST(req as any, { params: { channelId: 'ch-1' } });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe('msg-1');
  });

  it('passes channelId, content, parentId, and fileIds to sendMessage', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedSendMessage.mockResolvedValue(mockMessage);

    const req = createRequest('http://localhost:3000/api/channels/ch-1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: validContent,
        parentId: 'parent-1',
        fileIds: ['f1', 'f2'],
      }),
    });
    const res = await channelMessagesPOST(req as any, { params: { channelId: 'ch-1' } });

    expect(res.status).toBe(201);
    expect(mockedSendMessage).toHaveBeenCalledWith({
      channelId: 'ch-1',
      content: validContent,
      parentId: 'parent-1',
      fileIds: ['f1', 'f2'],
    });
  });

  it('returns 400 for invalid JSON body', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });

    const req = createRequest('http://localhost:3000/api/channels/ch-1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json at all',
    });
    const res = await channelMessagesPOST(req as any, { params: { channelId: 'ch-1' } });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// GET /api/messages/[messageId]
// ---------------------------------------------------------------------------

describe('GET /api/messages/[messageId]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    const req = createRequest('http://localhost:3000/api/messages/msg-1');
    const res = await messageGET(req as any, { params: { messageId: 'msg-1' } });

    expect(res.status).toBe(401);
  });

  it('returns 404 when message not found', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedGetMessageById.mockResolvedValue(null);

    const req = createRequest('http://localhost:3000/api/messages/nonexistent');
    const res = await messageGET(req as any, { params: { messageId: 'nonexistent' } });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('returns message when found', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedGetMessageById.mockResolvedValue(mockMessage);

    const req = createRequest('http://localhost:3000/api/messages/msg-1');
    const res = await messageGET(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.data.id).toBe('msg-1');
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/messages/[messageId]
// ---------------------------------------------------------------------------

describe('PATCH /api/messages/[messageId]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    const req = createRequest('http://localhost:3000/api/messages/msg-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: validContent }),
    });
    const res = await messagePATCH(req as any, { params: { messageId: 'msg-1' } });

    expect(res.status).toBe(401);
  });

  it('returns 400 when content is missing', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });

    const req = createRequest('http://localhost:3000/api/messages/msg-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await messagePATCH(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid Tiptap content', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });

    const req = createRequest('http://localhost:3000/api/messages/msg-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'plain string' }),
    });
    const res = await messagePATCH(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 403 when editing another user\'s message', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedEditMessage.mockRejectedValue(new Error('Not authorized to edit this message'));

    const req = createRequest('http://localhost:3000/api/messages/msg-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: validContent }),
    });
    const res = await messagePATCH(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('returns 404 when message not found', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedEditMessage.mockRejectedValue(new Error('Message not found'));

    const req = createRequest('http://localhost:3000/api/messages/msg-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: validContent }),
    });
    const res = await messagePATCH(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('returns 400 when editing a deleted message', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedEditMessage.mockRejectedValue(new Error('Cannot edit a deleted message'));

    const req = createRequest('http://localhost:3000/api/messages/msg-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: validContent }),
    });
    const res = await messagePATCH(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('returns updated message on success', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedEditMessage.mockResolvedValue({ ...mockMessage, isEdited: true });

    const req = createRequest('http://localhost:3000/api/messages/msg-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: validContent }),
    });
    const res = await messagePATCH(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.data.isEdited).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/messages/[messageId]
// ---------------------------------------------------------------------------

describe('DELETE /api/messages/[messageId]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    const req = createRequest('http://localhost:3000/api/messages/msg-1', {
      method: 'DELETE',
    });
    const res = await messageDELETE(req as any, { params: { messageId: 'msg-1' } });

    expect(res.status).toBe(401);
  });

  it('returns 404 when message not found', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedDeleteMessage.mockRejectedValue(new Error('Message not found'));

    const req = createRequest('http://localhost:3000/api/messages/msg-1', {
      method: 'DELETE',
    });
    const res = await messageDELETE(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('returns 403 when not authorized to delete', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedDeleteMessage.mockRejectedValue(
      new Error('Not authorized to delete this message')
    );

    const req = createRequest('http://localhost:3000/api/messages/msg-1', {
      method: 'DELETE',
    });
    const res = await messageDELETE(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('returns 400 when message is already deleted', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedDeleteMessage.mockRejectedValue(
      new Error('Message is already deleted')
    );

    const req = createRequest('http://localhost:3000/api/messages/msg-1', {
      method: 'DELETE',
    });
    const res = await messageDELETE(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('soft-deletes successfully', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedDeleteMessage.mockResolvedValue(undefined);

    const req = createRequest('http://localhost:3000/api/messages/msg-1', {
      method: 'DELETE',
    });
    const res = await messageDELETE(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.data.deleted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /api/messages/[messageId]/reactions
// ---------------------------------------------------------------------------

describe('POST /api/messages/[messageId]/reactions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    const req = createRequest('http://localhost:3000/api/messages/msg-1/reactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji: '👍' }),
    });
    const res = await reactionPOST(req as any, { params: { messageId: 'msg-1' } });

    expect(res.status).toBe(401);
  });

  it('returns 400 when emoji is missing', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });

    const req = createRequest('http://localhost:3000/api/messages/msg-1/reactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await reactionPOST(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for empty emoji string', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });

    const req = createRequest('http://localhost:3000/api/messages/msg-1/reactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji: '  ' }),
    });
    const res = await reactionPOST(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns reactions on success', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedAddReaction.mockResolvedValue([
      { emoji: '👍', count: 1, userIds: ['user-1'] },
    ]);

    const req = createRequest('http://localhost:3000/api/messages/msg-1/reactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji: '👍' }),
    });
    const res = await reactionPOST(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.data.messageId).toBe('msg-1');
    expect(body.data.reactions).toHaveLength(1);
  });

  it('returns 404 when message not found', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedAddReaction.mockRejectedValue(new Error('Message not found'));

    const req = createRequest('http://localhost:3000/api/messages/msg-1/reactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji: '👍' }),
    });
    const res = await reactionPOST(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/messages/[messageId]/reactions
// ---------------------------------------------------------------------------

describe('DELETE /api/messages/[messageId]/reactions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    const req = createRequest(
      'http://localhost:3000/api/messages/msg-1/reactions?emoji=%F0%9F%91%8D',
      { method: 'DELETE' }
    );
    const res = await reactionDELETE(req as any, { params: { messageId: 'msg-1' } });

    expect(res.status).toBe(401);
  });

  it('returns 400 when emoji query param is missing', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });

    const req = createRequest(
      'http://localhost:3000/api/messages/msg-1/reactions',
      { method: 'DELETE' }
    );
    const res = await reactionDELETE(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns updated reactions on success', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedRemoveReaction.mockResolvedValue([]);

    const req = createRequest(
      'http://localhost:3000/api/messages/msg-1/reactions?emoji=%F0%9F%91%8D',
      { method: 'DELETE' }
    );
    const res = await reactionDELETE(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.data.reactions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GET /api/messages/[messageId]/threads
// ---------------------------------------------------------------------------

describe('GET /api/messages/[messageId]/threads', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    const req = createRequest('http://localhost:3000/api/messages/msg-1/threads');
    const res = await threadsGET(req as any, { params: { messageId: 'msg-1' } });

    expect(res.status).toBe(401);
  });

  it('returns 404 when parent message not found', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedGetMessageById.mockResolvedValue(null);

    const req = createRequest('http://localhost:3000/api/messages/nonexistent/threads');
    const res = await threadsGET(req as any, { params: { messageId: 'nonexistent' } });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('returns thread replies on success', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedGetMessageById.mockResolvedValue(mockMessage);
    mockedGetThreadReplies.mockResolvedValue([
      { ...mockMessage, id: 'reply-1', parentId: 'msg-1' },
      { ...mockMessage, id: 'reply-2', parentId: 'msg-1' },
    ]);

    const req = createRequest('http://localhost:3000/api/messages/msg-1/threads');
    const res = await threadsGET(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// POST /api/messages/[messageId]/threads
// ---------------------------------------------------------------------------

describe('POST /api/messages/[messageId]/threads', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    const req = createRequest('http://localhost:3000/api/messages/msg-1/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: validContent }),
    });
    const res = await threadsPOST(req as any, { params: { messageId: 'msg-1' } });

    expect(res.status).toBe(401);
  });

  it('returns 404 when parent message not found', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedGetMessageById.mockResolvedValue(null);

    const req = createRequest('http://localhost:3000/api/messages/nonexistent/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: validContent }),
    });
    const res = await threadsPOST(req as any, { params: { messageId: 'nonexistent' } });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('returns 400 when content is missing', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedGetMessageById.mockResolvedValue(mockMessage);

    const req = createRequest('http://localhost:3000/api/messages/msg-1/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await threadsPOST(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('creates thread reply with 201 status', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedGetMessageById.mockResolvedValue(mockMessage);
    const replyMessage = { ...mockMessage, id: 'reply-1', parentId: 'msg-1' };
    mockedSendMessage.mockResolvedValue(replyMessage);

    const req = createRequest('http://localhost:3000/api/messages/msg-1/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: validContent }),
    });
    const res = await threadsPOST(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(mockedSendMessage).toHaveBeenCalledWith({
      channelId: 'ch-1',
      content: validContent,
      parentId: 'msg-1',
      fileIds: undefined,
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/messages/[messageId]/pin
// ---------------------------------------------------------------------------

describe('POST /api/messages/[messageId]/pin', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    const req = createRequest('http://localhost:3000/api/messages/msg-1/pin', {
      method: 'POST',
    });
    const res = await pinPOST(req as any, { params: { messageId: 'msg-1' } });

    expect(res.status).toBe(401);
  });

  it('returns 404 when message not found', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedGetMessageById.mockResolvedValue(null);

    const req = createRequest('http://localhost:3000/api/messages/msg-1/pin', {
      method: 'POST',
    });
    const res = await pinPOST(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('returns 409 when message is already pinned', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedGetMessageById.mockResolvedValue(mockMessage);
    mockedPinMessage.mockRejectedValue(new Error('Message is already pinned'));

    const req = createRequest('http://localhost:3000/api/messages/msg-1/pin', {
      method: 'POST',
    });
    const res = await pinPOST(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe('CONFLICT');
  });

  it('returns 422 when pin limit reached', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedGetMessageById.mockResolvedValue(mockMessage);
    mockedPinMessage.mockRejectedValue(
      new Error('Maximum pin limit reached (100 pins per channel)')
    );

    const req = createRequest('http://localhost:3000/api/messages/msg-1/pin', {
      method: 'POST',
    });
    const res = await pinPOST(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.code).toBe('LIMIT_EXCEEDED');
  });

  it('returns 201 on successful pin', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedGetMessageById.mockResolvedValue(mockMessage);
    mockedPinMessage.mockResolvedValue(undefined);

    const req = createRequest('http://localhost:3000/api/messages/msg-1/pin', {
      method: 'POST',
    });
    const res = await pinPOST(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.pinned).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/messages/[messageId]/pin
// ---------------------------------------------------------------------------

describe('DELETE /api/messages/[messageId]/pin', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null);

    const req = createRequest('http://localhost:3000/api/messages/msg-1/pin', {
      method: 'DELETE',
    });
    const res = await pinDELETE(req as any, { params: { messageId: 'msg-1' } });

    expect(res.status).toBe(401);
  });

  it('returns 404 when message not found', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedGetMessageById.mockResolvedValue(null);

    const req = createRequest('http://localhost:3000/api/messages/msg-1/pin', {
      method: 'DELETE',
    });
    const res = await pinDELETE(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('returns 404 when message is not pinned', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedGetMessageById.mockResolvedValue(mockMessage);
    mockedUnpinMessage.mockRejectedValue(new Error('Message is not pinned'));

    const req = createRequest('http://localhost:3000/api/messages/msg-1/pin', {
      method: 'DELETE',
    });
    const res = await pinDELETE(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('unpins successfully', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockedGetMessageById.mockResolvedValue(mockMessage);
    mockedUnpinMessage.mockResolvedValue(undefined);

    const req = createRequest('http://localhost:3000/api/messages/msg-1/pin', {
      method: 'DELETE',
    });
    const res = await pinDELETE(req as any, { params: { messageId: 'msg-1' } });
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.data.unpinned).toBe(true);
  });
});
