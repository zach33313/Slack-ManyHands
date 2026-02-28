/**
 * scheduling/types.ts
 *
 * Types for the scheduled messages feature.
 * Messages are stored in the scheduled_messages table and
 * delivered by server/scheduler.ts (node-cron) when scheduledFor <= now.
 *
 * Core shared types (TiptapJSON, etc.) live in shared/types/index.ts.
 */

import type { TiptapJSON } from '@/shared/types';

// ---------------------------------------------------------------------------
// Domain Types
// ---------------------------------------------------------------------------

/** A scheduled message pending delivery or already sent */
export interface ScheduledMessage {
  id: string;
  channelId: string;
  userId: string;
  content: TiptapJSON;
  contentPlain: string;
  /** When the message should be sent */
  scheduledFor: Date;
  /** When the message was actually sent (null if pending) */
  sentAt: Date | null;
  isCancelled: boolean;
  createdAt: Date;
}

/** Input for creating a new scheduled message */
export interface ScheduleMessageInput {
  channelId: string;
  content: TiptapJSON;
  /** Must be in the future */
  scheduledFor: Date;
}
