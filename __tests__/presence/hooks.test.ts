/**
 * Tests for presence/hooks/
 *
 * Covers:
 * - usePresence: heartbeat interval, presence:update listener, inactivity detection, cleanup
 * - useTypingIndicator: startTyping emit + timeout, stopTyping emit + clear,
 *   typing:users event handling, cleanup on unmount
 *
 * @jest-environment jsdom
 */

// --- Mocks ---

// Mock useSocket to return a fake socket
const mockSocket = {
  connected: true,
  emit: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
};

jest.mock('@/shared/hooks/useSocket', () => ({
  useSocket: () => mockSocket,
}));

// Mock the presence store
const mockSetPresence = jest.fn();
const mockSetTypingUsers = jest.fn();
const mockTypingByChannel: Record<string, any[]> = {};

jest.mock('@/presence/store', () => ({
  usePresenceStore: (selector: (state: any) => any) =>
    selector({
      setPresence: mockSetPresence,
      setTypingUsers: mockSetTypingUsers,
      typingByChannel: mockTypingByChannel,
      presenceMap: {},
      getPresence: () => 'offline',
    }),
}));

jest.mock('@/shared/lib/constants', () => ({
  PRESENCE_HEARTBEAT_INTERVAL: 30000,
  TYPING_TIMEOUT: 3000,
}));

import { renderHook, act } from '@testing-library/react';
import { usePresence } from '@/presence/hooks/usePresence';
import { useTypingIndicator } from '@/presence/hooks/useTypingIndicator';

// --- usePresence Tests ---

describe('usePresence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockSocket.connected = true;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends an initial heartbeat on mount', () => {
    renderHook(() => usePresence());

    // sendHeartbeat is called in the effect
    expect(mockSocket.emit).toHaveBeenCalledWith('presence:heartbeat');
  });

  it('registers presence:update listener on mount', () => {
    renderHook(() => usePresence());

    expect(mockSocket.on).toHaveBeenCalledWith(
      'presence:update',
      expect.any(Function)
    );
  });

  it('sends periodic heartbeats at the interval', () => {
    renderHook(() => usePresence());

    // Clear the initial heartbeat call
    const initialCallCount = mockSocket.emit.mock.calls.filter(
      (c: any[]) => c[0] === 'presence:heartbeat'
    ).length;

    // Advance by one interval
    act(() => {
      jest.advanceTimersByTime(30000);
    });

    const afterOneInterval = mockSocket.emit.mock.calls.filter(
      (c: any[]) => c[0] === 'presence:heartbeat'
    ).length;

    expect(afterOneInterval).toBeGreaterThan(initialCallCount);
  });

  it('calls setPresence when presence:update event received', () => {
    renderHook(() => usePresence());

    // Find the presence:update handler
    const onCall = mockSocket.on.mock.calls.find(
      (c: any[]) => c[0] === 'presence:update'
    );
    expect(onCall).toBeDefined();

    const handler = onCall![1];

    // Simulate receiving a presence update
    handler({ userId: 'user-1', status: 'online' });

    expect(mockSetPresence).toHaveBeenCalledWith('user-1', 'online');
  });

  it('does not send heartbeat when socket is disconnected', () => {
    mockSocket.connected = false;

    renderHook(() => usePresence());

    // The emit should not be called since socket is not connected
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('cleans up listeners and intervals on unmount', () => {
    const { unmount } = renderHook(() => usePresence());

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith(
      'presence:update',
      expect.any(Function)
    );
  });

  it('adds activity event listeners to document', () => {
    const addSpy = jest.spyOn(document, 'addEventListener');

    renderHook(() => usePresence());

    const activityEvents = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    for (const event of activityEvents) {
      expect(addSpy).toHaveBeenCalledWith(event, expect.any(Function), { passive: true });
    }

    addSpy.mockRestore();
  });

  it('removes activity event listeners on unmount', () => {
    const removeSpy = jest.spyOn(document, 'removeEventListener');

    const { unmount } = renderHook(() => usePresence());
    unmount();

    const activityEvents = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    for (const event of activityEvents) {
      expect(removeSpy).toHaveBeenCalledWith(event, expect.any(Function));
    }

    removeSpy.mockRestore();
  });

  it('listens for visibilitychange events', () => {
    const addSpy = jest.spyOn(document, 'addEventListener');

    renderHook(() => usePresence());

    expect(addSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

    addSpy.mockRestore();
  });

  it('listens for window focus events', () => {
    const addSpy = jest.spyOn(window, 'addEventListener');

    renderHook(() => usePresence());

    expect(addSpy).toHaveBeenCalledWith('focus', expect.any(Function));

    addSpy.mockRestore();
  });

  it('removes visibilitychange and focus listeners on unmount', () => {
    const docRemoveSpy = jest.spyOn(document, 'removeEventListener');
    const winRemoveSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => usePresence());
    unmount();

    expect(docRemoveSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(winRemoveSpy).toHaveBeenCalledWith('focus', expect.any(Function));

    docRemoveSpy.mockRestore();
    winRemoveSpy.mockRestore();
  });
});

// --- useTypingIndicator Tests ---

describe('useTypingIndicator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockSocket.connected = true;
    // Clear any typing data
    Object.keys(mockTypingByChannel).forEach((k) => delete mockTypingByChannel[k]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('registers typing:users listener on mount', () => {
    renderHook(() => useTypingIndicator('ch-1'));

    expect(mockSocket.on).toHaveBeenCalledWith(
      'typing:users',
      expect.any(Function)
    );
  });

  it('removes typing:users listener on unmount', () => {
    const { unmount } = renderHook(() => useTypingIndicator('ch-1'));

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith(
      'typing:users',
      expect.any(Function)
    );
  });

  it('startTyping emits typing:start event', () => {
    const { result } = renderHook(() => useTypingIndicator('ch-1'));

    act(() => {
      result.current.startTyping('ch-1');
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('typing:start', {
      channelId: 'ch-1',
    });
  });

  it('startTyping sets auto-stop timer that emits typing:stop after 3s', () => {
    const { result } = renderHook(() => useTypingIndicator('ch-1'));

    act(() => {
      result.current.startTyping('ch-1');
    });

    // Clear the startTyping emit calls
    mockSocket.emit.mockClear();

    // Advance past the 3s TYPING_TIMEOUT
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('typing:stop', {
      channelId: 'ch-1',
    });
  });

  it('calling startTyping again resets the auto-stop timer', () => {
    const { result } = renderHook(() => useTypingIndicator('ch-1'));

    act(() => {
      result.current.startTyping('ch-1');
    });

    // Advance 2s (before auto-stop fires)
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // Call startTyping again to reset
    act(() => {
      result.current.startTyping('ch-1');
    });

    mockSocket.emit.mockClear();

    // Advance 2s again — should NOT have fired auto-stop yet (timer was reset)
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(mockSocket.emit).not.toHaveBeenCalledWith('typing:stop', {
      channelId: 'ch-1',
    });

    // Advance another 1s — now it should fire
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('typing:stop', {
      channelId: 'ch-1',
    });
  });

  it('stopTyping emits typing:stop event', () => {
    const { result } = renderHook(() => useTypingIndicator('ch-1'));

    act(() => {
      result.current.stopTyping('ch-1');
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('typing:stop', {
      channelId: 'ch-1',
    });
  });

  it('stopTyping clears the auto-stop timer', () => {
    const { result } = renderHook(() => useTypingIndicator('ch-1'));

    act(() => {
      result.current.startTyping('ch-1');
    });

    act(() => {
      result.current.stopTyping('ch-1');
    });

    mockSocket.emit.mockClear();

    // Advance past the timeout — should NOT fire another typing:stop
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(mockSocket.emit).not.toHaveBeenCalledWith('typing:stop', {
      channelId: 'ch-1',
    });
  });

  it('does not emit when socket is disconnected', () => {
    mockSocket.connected = false;

    const { result } = renderHook(() => useTypingIndicator('ch-1'));

    act(() => {
      result.current.startTyping('ch-1');
    });

    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('calls setTypingUsers when typing:users event received', () => {
    renderHook(() => useTypingIndicator('ch-1'));

    const onCall = mockSocket.on.mock.calls.find(
      (c: any[]) => c[0] === 'typing:users'
    );
    expect(onCall).toBeDefined();

    const handler = onCall![1];

    const payload = {
      channelId: 'ch-1',
      users: [{ userId: 'user-2', name: 'Bob' }],
    };
    handler(payload);

    expect(mockSetTypingUsers).toHaveBeenCalledWith('ch-1', [
      { userId: 'user-2', name: 'Bob' },
    ]);
  });

  it('returns empty typingUsers when channelId is null', () => {
    const { result } = renderHook(() => useTypingIndicator(null));

    expect(result.current.typingUsers).toEqual([]);
  });

  it('returns typingUsers from the store for the given channel', () => {
    mockTypingByChannel['ch-1'] = [{ userId: 'user-2', name: 'Bob' }];

    const { result } = renderHook(() => useTypingIndicator('ch-1'));

    expect(result.current.typingUsers).toEqual([
      { userId: 'user-2', name: 'Bob' },
    ]);
  });

  it('returns empty typingUsers when channel has no typing data', () => {
    const { result } = renderHook(() => useTypingIndicator('ch-no-data'));

    expect(result.current.typingUsers).toEqual([]);
  });

  it('emits typing:stop on unmount if auto-stop timer is active', () => {
    const { result, unmount } = renderHook(() => useTypingIndicator('ch-1'));

    act(() => {
      result.current.startTyping('ch-1');
    });

    mockSocket.emit.mockClear();

    unmount();

    expect(mockSocket.emit).toHaveBeenCalledWith('typing:stop', {
      channelId: 'ch-1',
    });
  });
});
