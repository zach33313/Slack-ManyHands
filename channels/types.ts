/**
 * channels/types.ts
 *
 * Channel-domain specific types that extend the shared types.
 * These types are used in queries, actions, and components within the channels domain.
 *
 * Base types (Channel, ChannelWithMeta, ChannelMember, CreateChannelInput)
 * are re-exported from shared/types/index.ts.
 */

import type {
  Channel,
  ChannelType,
  ChannelWithMeta,
  UserSummary,
} from '@/shared/types';

// Re-export base types for convenience
export type { Channel, ChannelWithMeta, CreateChannelInput } from '@/shared/types';

/**
 * Input for updating an existing channel.
 * All fields are optional — only provided fields are updated.
 */
export interface UpdateChannelInput {
  name?: string;
  description?: string;
  /** Topic is stored in the description field but displayed separately in the header */
  topic?: string;
}

/**
 * Channel member record with hydrated user data.
 * Used in member lists and channel settings.
 */
export interface ChannelMemberWithUser {
  id: string;
  channelId: string;
  userId: string;
  lastReadAt: Date | null;
  notifyPref: string;
  joinedAt: Date;
  user: UserSummary & {
    email?: string;
    title?: string | null;
    statusText?: string | null;
    statusEmoji?: string | null;
    timezone?: string | null;
  };
}

/**
 * Channel with full metadata used in sidebar rendering.
 * Extends ChannelWithMeta with additional display state.
 */
export interface ChannelListItem extends ChannelWithMeta {
  /** Whether the current user has starred this channel */
  isStarred: boolean;
  /** Whether the current user has muted notifications for this channel */
  isMuted: boolean;
  /** Preview text of the last message in the channel */
  lastMessagePreview: string | null;
  /** Timestamp of the last message */
  lastMessageAt: Date | null;
}

/**
 * DM channel with the other participant's info.
 * Used in the DirectMessageList sidebar component.
 */
export interface DMChannelItem {
  id: string;
  workspaceId: string;
  type: ChannelType;
  /** The other user(s) in the DM */
  participants: UserSummary[];
  /** Display name: other user's name for 1:1, comma-separated for group */
  displayName: string;
  /** Avatar: other user's image for 1:1, null for group */
  displayImage: string | null;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
}

/**
 * Result of channel validation checks.
 */
export interface ChannelValidation {
  valid: boolean;
  error?: string;
}
