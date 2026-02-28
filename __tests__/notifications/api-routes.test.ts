/**
 * Tests for notification API routes
 *
 * Tests the three notification API route handlers:
 * - GET /api/notifications — paginated list with unread count
 * - PATCH /api/notifications/:notificationId/read — mark single as read
 * - POST /api/notifications/read-all — mark all as read
 */

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the modules under test
// ---------------------------------------------------------------------------

// Mock auth
const mockAuth = jest.fn();
jest.mock('../../auth/auth', () => ({
  auth: () => mockAuth(),
}));

// Mock notification queries
const mockGetNotifications = jest.fn();
const mockGetUnreadCount = jest.fn();
const mockMarkNotificationRead = jest.fn();
const mockMarkAllRead = jest.fn();

jest.mock('../../notifications/queries', () => ({
  getNotifications: (...args: unknown[]) => mockGetNotifications(...args),
  getUnreadCount: (...args: unknown[]) => mockGetUnreadCount(...args),
  markNotificationRead: (...args: unknown[]) =>
    mockMarkNotificationRead(...args),
  markAllRead: (...args: unknown[]) => mockMarkAllRead(...args),
}));

// Mock next/server — provide minimal implementations for NextRequest/NextResponse
jest.mock('next/server', () => {
  return {
    NextRequest: class MockNextRequest {
      nextUrl: URL;
      constructor(url: string | URL) {
        this.nextUrl = typeof url === 'string' ? new URL(url) : url;
      }
    },
    NextResponse: {
      json: (body: unknown, init?: { status?: number }) => ({
        status: init?.status ?? 200,
        json: async () => body,
        headers: new Headers(),
      }),
    },
  };
});

// ---------------------------------------------------------------------------
// Import route handlers
// ---------------------------------------------------------------------------

import { GET } from '../../app/api/notifications/route';
import { PATCH } from '../../app/api/notifications/[notificationId]/read/route';
import { POST } from '../../app/api/notifications/read-all/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRequest(url: string) {
  return {
    nextUrl: new URL(url, 'http://localhost'),
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
    });
  });

  it('returns paginated notifications with unread count', async () => {
    const notifications = [
      {
        id: 'notif-1',
        type: 'MENTION',
        senderName: 'Alice',
        preview: 'Hello',
        isRead: false,
        createdAt: new Date(),
      },
    ];
    mockGetNotifications.mockResolvedValue({
      notifications,
      hasMore: false,
    });
    mockGetUnreadCount.mockResolvedValue(3);

    const request = createMockRequest('/api/notifications');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual(notifications);
    expect(body.pagination.hasMore).toBe(false);
    expect(body.pagination.total).toBe(3);
  });

  it('passes unreadOnly filter to query', async () => {
    mockGetNotifications.mockResolvedValue({
      notifications: [],
      hasMore: false,
    });
    mockGetUnreadCount.mockResolvedValue(0);

    const request = createMockRequest(
      '/api/notifications?unreadOnly=true'
    );
    await GET(request);

    expect(mockGetNotifications).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ unreadOnly: true })
    );
  });

  it('passes cursor and limit params to query', async () => {
    mockGetNotifications.mockResolvedValue({
      notifications: [],
      hasMore: false,
    });
    mockGetUnreadCount.mockResolvedValue(0);

    const request = createMockRequest(
      '/api/notifications?cursor=abc&limit=10'
    );
    await GET(request);

    expect(mockGetNotifications).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        cursor: 'abc',
        limit: 10,
      })
    );
  });

  it('caps limit at 100', async () => {
    mockGetNotifications.mockResolvedValue({
      notifications: [],
      hasMore: false,
    });
    mockGetUnreadCount.mockResolvedValue(0);

    const request = createMockRequest('/api/notifications?limit=500');
    await GET(request);

    expect(mockGetNotifications).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ limit: 100 })
    );
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const request = createMockRequest('/api/notifications');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when session has no user id', async () => {
    mockAuth.mockResolvedValue({ user: { id: undefined } });

    const request = createMockRequest('/api/notifications');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('returns 500 on internal error', async () => {
    mockGetNotifications.mockRejectedValue(new Error('DB error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const request = createMockRequest('/api/notifications');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('INTERNAL_ERROR');

    consoleSpy.mockRestore();
  });

  it('includes next cursor when hasMore is true', async () => {
    const notifications = [
      {
        id: 'notif-last',
        type: 'MENTION',
        senderName: 'Alice',
        preview: 'Hi',
        isRead: false,
        createdAt: new Date(),
      },
    ];
    mockGetNotifications.mockResolvedValue({
      notifications,
      hasMore: true,
    });
    mockGetUnreadCount.mockResolvedValue(0);

    const request = createMockRequest('/api/notifications');
    const response = await GET(request);
    const body = await response.json();

    expect(body.pagination.cursor).toBe('notif-last');
    expect(body.pagination.hasMore).toBe(true);
  });
});

describe('PATCH /api/notifications/:notificationId/read', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
    });
  });

  it('marks a notification as read', async () => {
    mockMarkNotificationRead.mockResolvedValue(true);

    const request = {} as any;
    const response = await PATCH(request, {
      params: { notificationId: 'notif-1' },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.success).toBe(true);
    expect(mockMarkNotificationRead).toHaveBeenCalledWith('notif-1', 'user-1');
  });

  it('returns 404 when notification not found', async () => {
    mockMarkNotificationRead.mockResolvedValue(false);

    const request = {} as any;
    const response = await PATCH(request, {
      params: { notificationId: 'nonexistent' },
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const request = {} as any;
    const response = await PATCH(request, {
      params: { notificationId: 'notif-1' },
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 500 on internal error', async () => {
    mockMarkNotificationRead.mockRejectedValue(new Error('DB error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const request = {} as any;
    const response = await PATCH(request, {
      params: { notificationId: 'notif-1' },
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);

    consoleSpy.mockRestore();
  });
});

describe('POST /api/notifications/read-all', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
    });
  });

  it('marks all notifications as read', async () => {
    mockMarkAllRead.mockResolvedValue(5);

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.count).toBe(5);
    expect(mockMarkAllRead).toHaveBeenCalledWith('user-1');
  });

  it('returns 0 count when no unread notifications', async () => {
    mockMarkAllRead.mockResolvedValue(0);

    const response = await POST();
    const body = await response.json();

    expect(body.data.count).toBe(0);
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 500 on internal error', async () => {
    mockMarkAllRead.mockRejectedValue(new Error('DB error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);

    consoleSpy.mockRestore();
  });
});
