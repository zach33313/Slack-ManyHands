/**
 * Tests for presence/store.ts
 *
 * Covers:
 * - Initial state (empty presenceMap and typingByChannel)
 * - setPresence: sets and overwrites user presence
 * - setTypingUsers: sets and overwrites typing users for a channel
 * - getPresence: returns status or defaults to OFFLINE
 * - Multiple users / channels in parallel
 */

import { PresenceStatus } from '@/shared/types';
import type { TypingUser } from '@/shared/types';

// We need to reset the store between tests, so we import `usePresenceStore`
// and use its `setState` / `getState` API directly (Zustand vanilla API).
import { usePresenceStore } from '@/presence/store';

describe('usePresenceStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    usePresenceStore.setState({
      presenceMap: {},
      typingByChannel: {},
    });
  });

  // --- Initial state ---

  it('starts with an empty presenceMap', () => {
    const state = usePresenceStore.getState();
    expect(state.presenceMap).toEqual({});
  });

  it('starts with an empty typingByChannel', () => {
    const state = usePresenceStore.getState();
    expect(state.typingByChannel).toEqual({});
  });

  // --- setPresence ---

  it('sets a user to online', () => {
    usePresenceStore.getState().setPresence('user-1', PresenceStatus.ONLINE);

    const state = usePresenceStore.getState();
    expect(state.presenceMap['user-1']).toBe(PresenceStatus.ONLINE);
  });

  it('sets a user to away', () => {
    usePresenceStore.getState().setPresence('user-1', PresenceStatus.AWAY);

    const state = usePresenceStore.getState();
    expect(state.presenceMap['user-1']).toBe(PresenceStatus.AWAY);
  });

  it('sets a user to offline', () => {
    usePresenceStore.getState().setPresence('user-1', PresenceStatus.OFFLINE);

    const state = usePresenceStore.getState();
    expect(state.presenceMap['user-1']).toBe(PresenceStatus.OFFLINE);
  });

  it('overwrites existing presence status', () => {
    const { setPresence } = usePresenceStore.getState();
    setPresence('user-1', PresenceStatus.ONLINE);
    setPresence('user-1', PresenceStatus.AWAY);

    const state = usePresenceStore.getState();
    expect(state.presenceMap['user-1']).toBe(PresenceStatus.AWAY);
  });

  it('manages multiple users independently', () => {
    const { setPresence } = usePresenceStore.getState();
    setPresence('user-1', PresenceStatus.ONLINE);
    setPresence('user-2', PresenceStatus.AWAY);
    setPresence('user-3', PresenceStatus.OFFLINE);

    const state = usePresenceStore.getState();
    expect(state.presenceMap['user-1']).toBe(PresenceStatus.ONLINE);
    expect(state.presenceMap['user-2']).toBe(PresenceStatus.AWAY);
    expect(state.presenceMap['user-3']).toBe(PresenceStatus.OFFLINE);
  });

  it('does not affect other users when setting one user', () => {
    const { setPresence } = usePresenceStore.getState();
    setPresence('user-1', PresenceStatus.ONLINE);
    setPresence('user-2', PresenceStatus.AWAY);

    // Update user-1 without affecting user-2
    setPresence('user-1', PresenceStatus.OFFLINE);

    const state = usePresenceStore.getState();
    expect(state.presenceMap['user-1']).toBe(PresenceStatus.OFFLINE);
    expect(state.presenceMap['user-2']).toBe(PresenceStatus.AWAY);
  });

  // --- setTypingUsers ---

  it('sets typing users for a channel', () => {
    const users: TypingUser[] = [
      { userId: 'user-1', name: 'Alice' },
      { userId: 'user-2', name: 'Bob' },
    ];

    usePresenceStore.getState().setTypingUsers('ch-1', users);

    const state = usePresenceStore.getState();
    expect(state.typingByChannel['ch-1']).toEqual(users);
  });

  it('overwrites typing users for a channel', () => {
    const { setTypingUsers } = usePresenceStore.getState();
    setTypingUsers('ch-1', [{ userId: 'user-1', name: 'Alice' }]);
    setTypingUsers('ch-1', [{ userId: 'user-2', name: 'Bob' }]);

    const state = usePresenceStore.getState();
    expect(state.typingByChannel['ch-1']).toEqual([
      { userId: 'user-2', name: 'Bob' },
    ]);
  });

  it('clears typing users when set to empty array', () => {
    const { setTypingUsers } = usePresenceStore.getState();
    setTypingUsers('ch-1', [{ userId: 'user-1', name: 'Alice' }]);
    setTypingUsers('ch-1', []);

    const state = usePresenceStore.getState();
    expect(state.typingByChannel['ch-1']).toEqual([]);
  });

  it('manages typing users for multiple channels independently', () => {
    const { setTypingUsers } = usePresenceStore.getState();
    setTypingUsers('ch-1', [{ userId: 'user-1', name: 'Alice' }]);
    setTypingUsers('ch-2', [{ userId: 'user-2', name: 'Bob' }]);

    const state = usePresenceStore.getState();
    expect(state.typingByChannel['ch-1']).toEqual([
      { userId: 'user-1', name: 'Alice' },
    ]);
    expect(state.typingByChannel['ch-2']).toEqual([
      { userId: 'user-2', name: 'Bob' },
    ]);
  });

  // --- getPresence ---

  it('returns OFFLINE for unknown user', () => {
    const status = usePresenceStore.getState().getPresence('nonexistent');
    expect(status).toBe(PresenceStatus.OFFLINE);
  });

  it('returns the correct status for a known user', () => {
    usePresenceStore.getState().setPresence('user-1', PresenceStatus.ONLINE);

    const status = usePresenceStore.getState().getPresence('user-1');
    expect(status).toBe(PresenceStatus.ONLINE);
  });

  it('reflects status updates in getPresence', () => {
    const { setPresence, getPresence } = usePresenceStore.getState();
    setPresence('user-1', PresenceStatus.ONLINE);
    expect(getPresence('user-1')).toBe(PresenceStatus.ONLINE);

    setPresence('user-1', PresenceStatus.AWAY);
    // Note: getPresence reads from get() so it always returns latest
    expect(usePresenceStore.getState().getPresence('user-1')).toBe(PresenceStatus.AWAY);
  });
});
