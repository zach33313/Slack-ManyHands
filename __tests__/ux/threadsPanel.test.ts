/**
 * @jest-environment jsdom
 */

/**
 * Tests for messages/components/ThreadsPanel.tsx — localStorage helpers
 *
 * Covers:
 * - getFollowedThreads: returns [] when localStorage is empty
 * - getFollowedThreads: returns parsed array from localStorage
 * - saveFollowedThreads: writes JSON to localStorage
 * - addFollowedThread: prepends new thread; ignores duplicates
 * - removeFollowedThread: removes by parentMessageId
 * - isFollowingThread: returns true/false correctly
 * - markThreadResolved: updates resolved flag without removing thread
 */

import {
  getFollowedThreads,
  saveFollowedThreads,
  addFollowedThread,
  removeFollowedThread,
  isFollowingThread,
  markThreadResolved,
  type FollowedThread,
} from '@/messages/components/ThreadsPanel';

const USER_ID = 'user-42';
const WS_ID = 'ws-99';
const STORAGE_KEY = `slack-clone-followed-threads-${USER_ID}-${WS_ID}`;

function makeThread(parentMessageId: string, overrides?: Partial<FollowedThread>): FollowedThread {
  return {
    parentMessageId,
    parentContentPreview: `Preview of ${parentMessageId}`,
    channelId: 'ch-1',
    channelName: 'general',
    replyCount: 3,
    unreadCount: 1,
    isResolved: false,
    followedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('getFollowedThreads', () => {
  beforeEach(() => localStorage.clear());

  it('returns empty array when nothing is stored', () => {
    const result = getFollowedThreads(USER_ID, WS_ID);
    expect(result).toEqual([]);
  });

  it('returns parsed threads from localStorage', () => {
    const threads = [makeThread('msg-1'), makeThread('msg-2')];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));

    const result = getFollowedThreads(USER_ID, WS_ID);
    expect(result).toHaveLength(2);
    expect(result[0].parentMessageId).toBe('msg-1');
    expect(result[1].parentMessageId).toBe('msg-2');
  });

  it('returns empty array when stored JSON is invalid', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{');
    const result = getFollowedThreads(USER_ID, WS_ID);
    expect(result).toEqual([]);
  });

  it('is scoped by userId and workspaceId', () => {
    const otherKey = `slack-clone-followed-threads-other-user-${WS_ID}`;
    localStorage.setItem(otherKey, JSON.stringify([makeThread('msg-other')]));

    const result = getFollowedThreads(USER_ID, WS_ID);
    expect(result).toEqual([]);
  });
});

describe('saveFollowedThreads', () => {
  beforeEach(() => localStorage.clear());

  it('writes threads to localStorage as JSON', () => {
    const threads = [makeThread('msg-1')];
    saveFollowedThreads(USER_ID, WS_ID, threads);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].parentMessageId).toBe('msg-1');
  });

  it('overwrites previous data', () => {
    saveFollowedThreads(USER_ID, WS_ID, [makeThread('msg-old')]);
    saveFollowedThreads(USER_ID, WS_ID, [makeThread('msg-new')]);

    const result = getFollowedThreads(USER_ID, WS_ID);
    expect(result).toHaveLength(1);
    expect(result[0].parentMessageId).toBe('msg-new');
  });
});

describe('addFollowedThread', () => {
  beforeEach(() => localStorage.clear());

  it('adds thread to empty list', () => {
    addFollowedThread(USER_ID, WS_ID, makeThread('msg-1'));
    const result = getFollowedThreads(USER_ID, WS_ID);
    expect(result).toHaveLength(1);
    expect(result[0].parentMessageId).toBe('msg-1');
  });

  it('prepends new thread (most recent first)', () => {
    addFollowedThread(USER_ID, WS_ID, makeThread('msg-1'));
    addFollowedThread(USER_ID, WS_ID, makeThread('msg-2'));

    const result = getFollowedThreads(USER_ID, WS_ID);
    // msg-2 was added last, so it should be at index 0
    expect(result[0].parentMessageId).toBe('msg-2');
    expect(result[1].parentMessageId).toBe('msg-1');
  });

  it('ignores duplicate parentMessageId (idempotent)', () => {
    addFollowedThread(USER_ID, WS_ID, makeThread('msg-1'));
    addFollowedThread(USER_ID, WS_ID, makeThread('msg-1'));

    const result = getFollowedThreads(USER_ID, WS_ID);
    expect(result).toHaveLength(1);
  });
});

describe('removeFollowedThread', () => {
  beforeEach(() => localStorage.clear());

  it('removes thread by parentMessageId', () => {
    saveFollowedThreads(USER_ID, WS_ID, [makeThread('msg-1'), makeThread('msg-2')]);

    removeFollowedThread(USER_ID, WS_ID, 'msg-1');
    const result = getFollowedThreads(USER_ID, WS_ID);

    expect(result).toHaveLength(1);
    expect(result[0].parentMessageId).toBe('msg-2');
  });

  it('is a no-op when thread does not exist', () => {
    saveFollowedThreads(USER_ID, WS_ID, [makeThread('msg-1')]);

    expect(() => removeFollowedThread(USER_ID, WS_ID, 'nonexistent')).not.toThrow();
    expect(getFollowedThreads(USER_ID, WS_ID)).toHaveLength(1);
  });

  it('results in empty list when removing the only thread', () => {
    addFollowedThread(USER_ID, WS_ID, makeThread('msg-only'));
    removeFollowedThread(USER_ID, WS_ID, 'msg-only');

    expect(getFollowedThreads(USER_ID, WS_ID)).toEqual([]);
  });
});

describe('isFollowingThread', () => {
  beforeEach(() => localStorage.clear());

  it('returns false when not following any threads', () => {
    expect(isFollowingThread(USER_ID, WS_ID, 'msg-1')).toBe(false);
  });

  it('returns true after following a thread', () => {
    addFollowedThread(USER_ID, WS_ID, makeThread('msg-1'));
    expect(isFollowingThread(USER_ID, WS_ID, 'msg-1')).toBe(true);
  });

  it('returns false for a different thread', () => {
    addFollowedThread(USER_ID, WS_ID, makeThread('msg-1'));
    expect(isFollowingThread(USER_ID, WS_ID, 'msg-2')).toBe(false);
  });

  it('returns false after unfollowing', () => {
    addFollowedThread(USER_ID, WS_ID, makeThread('msg-1'));
    removeFollowedThread(USER_ID, WS_ID, 'msg-1');
    expect(isFollowingThread(USER_ID, WS_ID, 'msg-1')).toBe(false);
  });
});

describe('markThreadResolved', () => {
  beforeEach(() => localStorage.clear());

  it('marks a thread as resolved', () => {
    saveFollowedThreads(USER_ID, WS_ID, [makeThread('msg-1', { isResolved: false })]);

    markThreadResolved(USER_ID, WS_ID, 'msg-1', true);

    const result = getFollowedThreads(USER_ID, WS_ID);
    expect(result[0].isResolved).toBe(true);
  });

  it('marks a resolved thread as unresolved', () => {
    saveFollowedThreads(USER_ID, WS_ID, [makeThread('msg-1', { isResolved: true })]);

    markThreadResolved(USER_ID, WS_ID, 'msg-1', false);

    const result = getFollowedThreads(USER_ID, WS_ID);
    expect(result[0].isResolved).toBe(false);
  });

  it('does not remove the thread when resolving', () => {
    saveFollowedThreads(USER_ID, WS_ID, [makeThread('msg-1'), makeThread('msg-2')]);

    markThreadResolved(USER_ID, WS_ID, 'msg-1', true);

    const result = getFollowedThreads(USER_ID, WS_ID);
    expect(result).toHaveLength(2);
  });

  it('only updates the target thread, leaving others unchanged', () => {
    saveFollowedThreads(USER_ID, WS_ID, [
      makeThread('msg-1', { isResolved: false }),
      makeThread('msg-2', { isResolved: false }),
    ]);

    markThreadResolved(USER_ID, WS_ID, 'msg-1', true);

    const result = getFollowedThreads(USER_ID, WS_ID);
    expect(result.find((t) => t.parentMessageId === 'msg-1')?.isResolved).toBe(true);
    expect(result.find((t) => t.parentMessageId === 'msg-2')?.isResolved).toBe(false);
  });

  it('is a no-op when thread does not exist', () => {
    saveFollowedThreads(USER_ID, WS_ID, [makeThread('msg-1')]);

    expect(() => markThreadResolved(USER_ID, WS_ID, 'nonexistent', true)).not.toThrow();
    expect(getFollowedThreads(USER_ID, WS_ID)).toHaveLength(1);
  });
});
