/**
 * presence/types.ts
 *
 * Types for the presence and typing indicators domain.
 * Used by presence hooks, components, and the Zustand presence store.
 */

import { PresenceStatus } from '@/shared/types';
import type { TypingUser } from '@/shared/types';

/**
 * Map of userId → current presence status.
 * Maintained in the Zustand presence store and updated via Socket.IO events.
 */
export type PresenceMap = Record<string, PresenceStatus>;

/**
 * Map of channelId → list of users currently typing in that channel.
 * Updated by the useTypingIndicator hook via Socket.IO typing:users events.
 */
export type TypingByChannel = Record<string, TypingUser[]>;

/**
 * Zustand presence store state shape.
 */
export interface PresenceStoreState {
  /** Current presence status of all known users */
  presenceMap: PresenceMap;
  /** Current typing users per channel */
  typingByChannel: TypingByChannel;

  /** Set a single user's presence status */
  setPresence: (userId: string, status: PresenceStatus) => void;
  /** Set typing users for a channel */
  setTypingUsers: (channelId: string, users: TypingUser[]) => void;
  /** Get a user's presence status (defaults to OFFLINE) */
  getPresence: (userId: string) => PresenceStatus;
}

export { PresenceStatus };
export type { TypingUser };
