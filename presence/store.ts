/**
 * presence/store.ts
 *
 * Zustand store for presence and typing indicator state.
 * Updated by usePresence and useTypingIndicator hooks.
 * Read by PresenceIndicator and TypingIndicator components.
 *
 * Usage:
 *   import { usePresenceStore } from '@/presence/store'
 *   const status = usePresenceStore(s => s.presenceMap[userId] ?? 'offline')
 */

'use client';

import { create } from 'zustand';
import { PresenceStatus } from '@/shared/types';
import type { TypingUser } from '@/shared/types';
import type { PresenceStoreState } from './types';

export const usePresenceStore = create<PresenceStoreState>((set, get) => ({
  presenceMap: {},
  typingByChannel: {},

  setPresence: (userId: string, status: PresenceStatus) =>
    set((state) => ({
      presenceMap: {
        ...state.presenceMap,
        [userId]: status,
      },
    })),

  setTypingUsers: (channelId: string, users: TypingUser[]) =>
    set((state) => ({
      typingByChannel: {
        ...state.typingByChannel,
        [channelId]: users,
      },
    })),

  getPresence: (userId: string) => {
    return get().presenceMap[userId] ?? PresenceStatus.OFFLINE;
  },
}));
