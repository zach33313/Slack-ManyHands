/**
 * __tests__/api/scheduled-messages.delete.test.ts
 *
 * API-level tests for DELETE /api/scheduled-messages?id=<id>
 *
 * Tests the route handler directly by mocking auth and scheduling actions,
 * without spinning up a real HTTP server.
 *
 * Test cases:
 *  1. DELETE with valid ID and owner auth returns 204
 *  2. DELETE with non-existent ID returns 404
 *  3. DELETE without auth returns 401
 *  4. DELETE on another user's message returns 403
 *  5. DELETE on already-sent message (sentAt not null) returns 400
 *  6. After DELETE, GET list no longer includes the cancelled message
 */

// ---------------------------------------------------------------------------
// Auth mock — must appear before any imports that transitively load auth
// ---------------------------------------------------------------------------

jest.mock('@/auth/auth', () => ({
  auth: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Scheduling actions mock — replaces the real DB-backed actions
// ---------------------------------------------------------------------------

jest.mock('@/scheduling/actions', () => ({
  getScheduledMessages: jest.fn(),
  createScheduledMessage: jest.fn(),
  cancelScheduledMessage: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { auth } from '@/auth/auth';
import { cancelScheduledMessage, getScheduledMessages } from '@/scheduling/actions';
import { DELETE, GET } from '../../app/api/scheduled-messages/route';

const mockAuth = auth as jest.Mock;
const mockCancel = cancelScheduledMessage as jest.Mock;
const mockGetScheduled = getScheduledMessages as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeleteRequest(id?: string): NextRequest {
  const url = new URL('http://localhost/api/scheduled-messages');
  if (id !== undefined) {
    url.searchParams.set('id', id);
  }
  return new NextRequest(url.toString(), { method: 'DELETE' });
}

function makeGetRequest(channelId?: string): NextRequest {
  const url = new URL('http://localhost/api/scheduled-messages');
  if (channelId) {
    url.searchParams.set('channelId', channelId);
  }
  return new NextRequest(url.toString(), { method: 'GET' });
}

/** Produces a ScheduledMessage-shaped object as returned by getScheduledMessages() */
function makeScheduledMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sched-1',
    channelId: 'ch-1',
    userId: 'user-1',
    content: { type: 'doc', content: [] as unknown[] },
    contentPlain: 'Hello world',
    scheduledFor: new Date(Date.now() + 3_600_000),
    sentAt: null,
    isCancelled: false,
    createdAt: new Date('2026-01-01'),
    channel: { id: 'ch-1', name: 'general' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('DELETE /api/scheduled-messages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: authenticated as user-1
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
  });

  // -------------------------------------------------------------------------
  // Test 1: happy path — returns 204
  // -------------------------------------------------------------------------

  it('returns 204 when authenticated user cancels their own pending message', async () => {
    mockCancel.mockResolvedValue(undefined);

    const req = makeDeleteRequest('sched-1');
    const res = await DELETE(req);

    expect(res.status).toBe(204);
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockCancel).toHaveBeenCalledWith('sched-1');

    // 204 No Content — body must be empty
    const text = await res.text();
    expect(text).toBe('');
  });

  // -------------------------------------------------------------------------
  // Test 2: non-existent message — returns 404
  // -------------------------------------------------------------------------

  it('returns 404 when the scheduled message does not exist', async () => {
    mockCancel.mockRejectedValue(new Error('Scheduled message not found'));

    const req = makeDeleteRequest('nonexistent-id');
    const res = await DELETE(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Scheduled message not found');
  });

  // -------------------------------------------------------------------------
  // Test 3: unauthenticated — returns 401
  // -------------------------------------------------------------------------

  it('returns 401 when the request is unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const req = makeDeleteRequest('sched-1');
    const res = await DELETE(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/i);

    // The action must never be invoked for unauthenticated requests
    expect(mockCancel).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 4: wrong owner — returns 403
  // -------------------------------------------------------------------------

  it("returns 403 when attempting to cancel another user's message", async () => {
    mockCancel.mockRejectedValue(new Error('Not authorized to cancel this message'));

    const req = makeDeleteRequest('sched-other-user');
    const res = await DELETE(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Not authorized to cancel this message');
  });

  // -------------------------------------------------------------------------
  // Test 5: already-sent message — returns 400
  // -------------------------------------------------------------------------

  it('returns 400 when the scheduled message has already been sent', async () => {
    mockCancel.mockRejectedValue(new Error('Message has already been sent'));

    const req = makeDeleteRequest('sched-sent');
    const res = await DELETE(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Message has already been sent');
  });

  // -------------------------------------------------------------------------
  // Test 6: GET list no longer includes the cancelled message
  // -------------------------------------------------------------------------

  it('after DELETE, GET list no longer includes the cancelled message', async () => {
    const scheduledMsg = makeScheduledMessage();

    // Step 1: GET returns one pending message before cancellation
    mockGetScheduled.mockResolvedValueOnce([scheduledMsg]);

    const getRes1 = await GET(makeGetRequest());
    const body1 = await getRes1.json();

    expect(getRes1.status).toBe(200);
    expect(body1.messages).toHaveLength(1);
    expect(body1.messages[0].id).toBe('sched-1');

    // Step 2: DELETE cancels the message
    mockCancel.mockResolvedValueOnce(undefined);

    const deleteRes = await DELETE(makeDeleteRequest('sched-1'));
    expect(deleteRes.status).toBe(204);
    expect(mockCancel).toHaveBeenCalledWith('sched-1');

    // Step 3: GET now returns an empty list (cancelled message is filtered by
    // getScheduledMessages which queries WHERE isCancelled = false AND sentAt IS NULL)
    mockGetScheduled.mockResolvedValueOnce([]);

    const getRes2 = await GET(makeGetRequest());
    const body2 = await getRes2.json();

    expect(getRes2.status).toBe(200);
    expect(body2.messages).toHaveLength(0);
  });
});
