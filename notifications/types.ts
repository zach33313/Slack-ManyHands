/**
 * notifications/types.ts
 *
 * Types for the notifications domain.
 * Extends the shared Notification type with hydrated details for UI rendering.
 */

import type { NotificationType } from '@/shared/types';

// ---------------------------------------------------------------------------
// Notification preference for a channel
// ---------------------------------------------------------------------------

/** Per-channel notification preferences */
export enum NotifyPref {
  /** Receive all notifications (every message) */
  ALL = 'ALL',
  /** Receive notifications only for @mentions */
  MENTIONS = 'MENTIONS',
  /** Receive no notifications from this channel */
  NOTHING = 'NOTHING',
  /** Use workspace-level default preference */
  DEFAULT = 'DEFAULT',
}

// ---------------------------------------------------------------------------
// Notification with hydrated details for UI display
// ---------------------------------------------------------------------------

/** Notification record with resolved sender/channel info for rendering */
export interface NotificationWithDetails {
  id: string;
  type: NotificationType;
  userId: string;
  /** ID of the message that triggered this notification */
  messageId: string | null;
  /** ID of the channel where the notification originated */
  channelId: string | null;
  /** Name of the channel (resolved from payload/DB) */
  channelName: string | null;
  /** Display name of the user who triggered the notification */
  senderName: string;
  /** Image/avatar URL of the sender */
  senderImage: string | null;
  /** Preview text of the message content */
  preview: string;
  /** Whether the notification has been read */
  isRead: boolean;
  /** When the notification was created */
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Notification preferences per channel
// ---------------------------------------------------------------------------

/** Per-channel notification preference setting */
export interface NotificationPreferences {
  channelId: string;
  pref: NotifyPref;
}

// ---------------------------------------------------------------------------
// Notification counts for the badge
// ---------------------------------------------------------------------------

/** Aggregate notification counts */
export interface NotificationCounts {
  /** Total number of notifications */
  total: number;
  /** Number of unread notifications */
  unread: number;
}

// ---------------------------------------------------------------------------
// Query options
// ---------------------------------------------------------------------------

/** Options for fetching notifications */
export interface GetNotificationsOptions {
  /** Only return unread notifications */
  unreadOnly?: boolean;
  /** Cursor for pagination (notification ID) */
  cursor?: string;
  /** Number of items per page */
  limit?: number;
}
