/**
 * @jest-environment jsdom
 */

/**
 * Tests for notification UI components
 *
 * Tests the NotificationBell and NotificationList components:
 * - NotificationBell: renders bell, shows badge, toggles dropdown, socket sub
 * - NotificationList: fetches/displays notifications, mark read, navigation
 * - Browser push: permission request, Notification when tab hidden
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing components
// ---------------------------------------------------------------------------

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

// Mock useSocket
const mockSocketOn = jest.fn();
const mockSocketOff = jest.fn();
jest.mock('../../shared/hooks/useSocket', () => ({
  useSocket: () => ({
    on: mockSocketOn,
    off: mockSocketOff,
  }),
}));

// Mock utils
jest.mock('../../shared/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
  formatRelativeTime: () => '2 minutes ago',
  truncate: (text: string, max: number) =>
    text.length > max ? text.slice(0, max - 3) + '...' : text,
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Bell: (props: Record<string, unknown>) =>
    React.createElement('svg', { 'data-testid': 'bell-icon', ...props }),
  AtSign: (props: Record<string, unknown>) =>
    React.createElement('svg', { 'data-testid': 'at-sign-icon', ...props }),
  MessageSquare: (props: Record<string, unknown>) =>
    React.createElement('svg', { 'data-testid': 'message-square-icon', ...props }),
  MessageCircleReply: (props: Record<string, unknown>) =>
    React.createElement('svg', { 'data-testid': 'message-reply-icon', ...props }),
  SmilePlus: (props: Record<string, unknown>) =>
    React.createElement('svg', { 'data-testid': 'smile-plus-icon', ...props }),
  Check: (props: Record<string, unknown>) =>
    React.createElement('svg', { 'data-testid': 'check-icon', ...props }),
  BellOff: (props: Record<string, unknown>) =>
    React.createElement('svg', { 'data-testid': 'bell-off-icon', ...props }),
  Loader2: (props: Record<string, unknown>) =>
    React.createElement('svg', { 'data-testid': 'loader-icon', ...props }),
}));

// ---------------------------------------------------------------------------
// Import components under test
// ---------------------------------------------------------------------------

import { NotificationBell } from '../../notifications/components/NotificationBell';
import { NotificationList } from '../../notifications/components/NotificationList';
import { NotificationType } from '../../shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockNotification(overrides?: Record<string, unknown>) {
  return {
    id: 'notif-1',
    type: NotificationType.MENTION,
    userId: 'user-1',
    messageId: 'msg-1',
    channelId: 'ch-1',
    channelName: 'general',
    senderName: 'Alice',
    senderImage: null,
    preview: 'Hello world',
    isRead: false,
    createdAt: new Date('2025-01-15T10:00:00Z').toISOString(),
    ...overrides,
  };
}

function mockFetchResponse(data: unknown, ok = true) {
  return jest.fn().mockResolvedValue({
    ok,
    json: async () => data,
  });
}

// ---------------------------------------------------------------------------
// NotificationBell Tests
// ---------------------------------------------------------------------------

describe('NotificationBell', () => {
  let originalFetch: typeof global.fetch;
  let originalNotification: typeof global.Notification;

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;
    originalNotification = global.Notification;

    // Mock browser Notification API
    const MockNotification = jest.fn() as unknown as jest.MockedClass<typeof Notification>;
    Object.defineProperty(MockNotification, 'permission', {
      value: 'default',
      writable: true,
      configurable: true,
    });
    MockNotification.requestPermission = jest.fn().mockResolvedValue('granted');
    global.Notification = MockNotification as any;

    // Default: fetch returns 0 unread
    global.fetch = mockFetchResponse({
      ok: true,
      data: [],
      pagination: { total: 0 },
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.Notification = originalNotification;
  });

  it('renders the bell icon button', async () => {
    await act(async () => {
      render(<NotificationBell />);
    });

    expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
    expect(screen.getByTestId('bell-icon')).toBeInTheDocument();
  });

  it('shows unread badge when count > 0', async () => {
    global.fetch = mockFetchResponse({
      ok: true,
      data: [],
      pagination: { total: 5 },
    });

    await act(async () => {
      render(<NotificationBell />);
    });

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  it('hides badge when unread count is 0', async () => {
    global.fetch = mockFetchResponse({
      ok: true,
      data: [],
      pagination: { total: 0 },
    });

    await act(async () => {
      render(<NotificationBell />);
    });

    await waitFor(() => {
      // No badge number should appear
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });
  });

  it('shows "99+" when unread count exceeds 99', async () => {
    global.fetch = mockFetchResponse({
      ok: true,
      data: [],
      pagination: { total: 150 },
    });

    await act(async () => {
      render(<NotificationBell />);
    });

    await waitFor(() => {
      expect(screen.getByText('99+')).toBeInTheDocument();
    });
  });

  it('toggles dropdown on click', async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<NotificationBell />);
    });

    const button = screen.getByLabelText('Notifications');

    // Initially no dropdown
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // Click to open
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
  });

  it('subscribes to socket notification:new events', async () => {
    await act(async () => {
      render(<NotificationBell />);
    });

    expect(mockSocketOn).toHaveBeenCalledWith(
      'notification:new',
      expect.any(Function)
    );
  });

  it('increments unread count on socket notification:new', async () => {
    global.fetch = mockFetchResponse({
      ok: true,
      data: [],
      pagination: { total: 3 },
    });

    await act(async () => {
      render(<NotificationBell />);
    });

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    // Simulate socket event
    const onNewNotification = mockSocketOn.mock.calls.find(
      (call: unknown[]) => call[0] === 'notification:new'
    )?.[1] as (notification: unknown) => void;

    expect(onNewNotification).toBeDefined();

    act(() => {
      onNewNotification({
        id: 'new-notif',
        type: 'DM',
        payload: { preview: 'New message' },
      });
    });

    await waitFor(() => {
      expect(screen.getByText('4')).toBeInTheDocument();
    });
  });

  it('requests browser notification permission on mount', async () => {
    await act(async () => {
      render(<NotificationBell />);
    });

    expect(global.Notification.requestPermission).toHaveBeenCalled();
  });

  it('cleans up socket listener on unmount', async () => {
    let unmount: () => void;

    await act(async () => {
      const result = render(<NotificationBell />);
      unmount = result.unmount;
    });

    act(() => {
      unmount();
    });

    expect(mockSocketOff).toHaveBeenCalledWith(
      'notification:new',
      expect.any(Function)
    );
  });
});

// ---------------------------------------------------------------------------
// NotificationList Tests
// ---------------------------------------------------------------------------

describe('NotificationList', () => {
  let originalFetch: typeof global.fetch;
  const mockOnMarkAllRead = jest.fn();
  const mockOnMarkOneRead = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;
    mockPush.mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('shows loading state initially', async () => {
    // Never resolving fetch to keep loading state
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));

    await act(async () => {
      render(
        <NotificationList
          onMarkAllRead={mockOnMarkAllRead}
          onMarkOneRead={mockOnMarkOneRead}
          onClose={mockOnClose}
        />
      );
    });

    expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
  });

  it('fetches and displays notifications', async () => {
    const notifications = [
      createMockNotification({ id: 'n1', senderName: 'Alice' }),
      createMockNotification({
        id: 'n2',
        senderName: 'Bob',
        type: NotificationType.DM,
        isRead: true,
      }),
    ];

    global.fetch = mockFetchResponse({
      ok: true,
      data: notifications,
      pagination: { hasMore: false },
    });

    await act(async () => {
      render(
        <NotificationList
          onMarkAllRead={mockOnMarkAllRead}
          onMarkOneRead={mockOnMarkOneRead}
          onClose={mockOnClose}
        />
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
  });

  it('shows empty state when no notifications', async () => {
    global.fetch = mockFetchResponse({
      ok: true,
      data: [],
      pagination: { hasMore: false },
    });

    await act(async () => {
      render(
        <NotificationList
          onMarkAllRead={mockOnMarkAllRead}
          onMarkOneRead={mockOnMarkOneRead}
          onClose={mockOnClose}
        />
      );
    });

    await waitFor(() => {
      expect(screen.getByText('No notifications yet')).toBeInTheDocument();
      expect(screen.getByTestId('bell-off-icon')).toBeInTheDocument();
    });
  });

  it('shows "Mark all as read" button when unread notifications exist', async () => {
    const notifications = [
      createMockNotification({ id: 'n1', isRead: false }),
    ];

    global.fetch = mockFetchResponse({
      ok: true,
      data: notifications,
      pagination: { hasMore: false },
    });

    await act(async () => {
      render(
        <NotificationList
          onMarkAllRead={mockOnMarkAllRead}
          onMarkOneRead={mockOnMarkOneRead}
          onClose={mockOnClose}
        />
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Mark all as read')).toBeInTheDocument();
    });
  });

  it('clicking notification marks it as read and navigates', async () => {
    const user = userEvent.setup();
    const notifications = [
      createMockNotification({
        id: 'n1',
        isRead: false,
        channelId: 'ch-1',
        senderName: 'Alice',
      }),
    ];

    // First call: fetch notifications; second call: mark read
    let fetchCallCount = 0;
    global.fetch = jest.fn().mockImplementation((url: string) => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        // Initial fetch
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              data: notifications,
              pagination: { hasMore: false },
            }),
        });
      }
      // Mark read API call
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, data: { success: true } }),
      });
    });

    await act(async () => {
      render(
        <NotificationList
          onMarkAllRead={mockOnMarkAllRead}
          onMarkOneRead={mockOnMarkOneRead}
          onClose={mockOnClose}
        />
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    const notificationButton = screen.getByRole('menuitem');
    await user.click(notificationButton);

    await waitFor(() => {
      // Should call mark read API
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/notifications/n1/read',
        expect.objectContaining({ method: 'PATCH' })
      );
      // Should navigate to channel
      expect(mockPush).toHaveBeenCalledWith('/channel/ch-1');
      // Should call onMarkOneRead and onClose
      expect(mockOnMarkOneRead).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('shows load more button when hasMore is true', async () => {
    const notifications = [
      createMockNotification({ id: 'n1' }),
    ];

    global.fetch = mockFetchResponse({
      ok: true,
      data: notifications,
      pagination: { hasMore: true },
    });

    await act(async () => {
      render(
        <NotificationList
          onMarkAllRead={mockOnMarkAllRead}
          onMarkOneRead={mockOnMarkOneRead}
          onClose={mockOnClose}
        />
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Load more')).toBeInTheDocument();
    });
  });

  it('calls onMarkAllRead when mark all is clicked', async () => {
    const user = userEvent.setup();
    const notifications = [
      createMockNotification({ id: 'n1', isRead: false }),
    ];

    let fetchCallCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              data: notifications,
              pagination: { hasMore: false },
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, data: { count: 1 } }),
      });
    });

    await act(async () => {
      render(
        <NotificationList
          onMarkAllRead={mockOnMarkAllRead}
          onMarkOneRead={mockOnMarkOneRead}
          onClose={mockOnClose}
        />
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Mark all as read')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Mark all as read'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/notifications/read-all',
        expect.objectContaining({ method: 'POST' })
      );
      expect(mockOnMarkAllRead).toHaveBeenCalled();
    });
  });

  it('displays correct action text for each notification type', async () => {
    const notifications = [
      createMockNotification({
        id: 'n1',
        type: NotificationType.MENTION,
        senderName: 'Alice',
      }),
      createMockNotification({
        id: 'n2',
        type: NotificationType.DM,
        senderName: 'Bob',
      }),
      createMockNotification({
        id: 'n3',
        type: NotificationType.THREAD_REPLY,
        senderName: 'Charlie',
      }),
      createMockNotification({
        id: 'n4',
        type: NotificationType.REACTION,
        senderName: 'Diana',
      }),
    ];

    global.fetch = mockFetchResponse({
      ok: true,
      data: notifications,
      pagination: { hasMore: false },
    });

    await act(async () => {
      render(
        <NotificationList
          onMarkAllRead={mockOnMarkAllRead}
          onMarkOneRead={mockOnMarkOneRead}
          onClose={mockOnClose}
        />
      );
    });

    await waitFor(() => {
      expect(screen.getByText('mentioned you')).toBeInTheDocument();
      expect(screen.getByText('sent you a message')).toBeInTheDocument();
      expect(screen.getByText('replied in a thread')).toBeInTheDocument();
      expect(screen.getByText('reacted to your message')).toBeInTheDocument();
    });
  });

  it('does not call mark read for already-read notifications', async () => {
    const user = userEvent.setup();
    const notifications = [
      createMockNotification({
        id: 'n1',
        isRead: true,
        channelId: 'ch-1',
        senderName: 'Alice',
      }),
    ];

    global.fetch = mockFetchResponse({
      ok: true,
      data: notifications,
      pagination: { hasMore: false },
    });

    await act(async () => {
      render(
        <NotificationList
          onMarkAllRead={mockOnMarkAllRead}
          onMarkOneRead={mockOnMarkOneRead}
          onClose={mockOnClose}
        />
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('menuitem'));

    await waitFor(() => {
      // Should navigate
      expect(mockPush).toHaveBeenCalledWith('/channel/ch-1');
      // Should NOT call mark read (already read)
      expect(mockOnMarkOneRead).not.toHaveBeenCalled();
    });
  });
});
