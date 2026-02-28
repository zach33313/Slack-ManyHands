/**
 * members/types.ts
 *
 * Types for the members and user profiles domain.
 * Used by queries, actions, and components within this domain.
 */

import type { MemberRole, UserSummary, PresenceStatus } from '@/shared/types';

/**
 * A workspace member with full user details hydrated.
 * Returned by member list queries and displayed in the MemberList component.
 */
export interface MemberWithUser {
  id: string;
  workspaceId: string;
  userId: string;
  role: MemberRole;
  joinedAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    title: string | null;
    statusText: string | null;
    statusEmoji: string | null;
    timezone: string | null;
  };
}

/**
 * Workspace member with presence status attached.
 * Used in the MemberList to show online/offline grouping.
 */
export interface MemberWithPresence extends MemberWithUser {
  presenceStatus: PresenceStatus;
}

/**
 * Input for updating the current user's profile.
 * All fields are optional — only provided fields are updated.
 */
export interface UpdateProfileInput {
  displayName?: string;
  statusText?: string;
  statusEmoji?: string;
  timezone?: string;
  title?: string;
}

/**
 * Full user profile returned by getUserProfile().
 */
export interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  title: string | null;
  statusText: string | null;
  statusEmoji: string | null;
  timezone: string | null;
  /** Do Not Disturb expiration — null means DND is not active */
  dndUntil?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Avatar size variants used by UserAvatar component.
 */
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

/**
 * Map from AvatarSize to pixel values.
 */
export const AVATAR_SIZE_PX: Record<AvatarSize, number> = {
  xs: 20,
  sm: 28,
  md: 36,
  lg: 72,
};

export type { MemberRole };
