/**
 * admin/types.ts
 *
 * Types for the admin dashboard feature.
 * Admin routes require ADMIN+ role (checked via hasPermission).
 * Analytics data sourced from aggregate Prisma queries.
 * Charts rendered with Recharts (code-split to admin route only).
 *
 * Core shared types (UserSummary, etc.) live in shared/types/index.ts.
 */

import type { UserSummary } from '@/shared/types';

// ---------------------------------------------------------------------------
// Domain Types
// ---------------------------------------------------------------------------

/** Workspace analytics data for dashboard charts */
export interface AnalyticsData {
  messagesPerDay: Array<{ date: string; count: number }>;
  activeUsersPerDay: Array<{ date: string; count: number }>;
  topChannels: Array<{ channelId: string; name: string; messageCount: number }>;
  memberGrowth: Array<{ date: string; totalMembers: number }>;
  totalMessages: number;
  totalMembers: number;
  totalChannels: number;
}

/** A single audit log entry for admin review */
export interface AuditLogEntry {
  id: string;
  workspaceId: string;
  actorId: string;
  actor: UserSummary;
  /** Action identifier, e.g. 'MEMBER_ROLE_CHANGED', 'MEMBER_REMOVED', 'CHANNEL_ARCHIVED' */
  action: string;
  targetId: string | null;
  /** Key-value changes, e.g. { role: { from: 'MEMBER', to: 'ADMIN' } } */
  changes: Record<string, unknown> | null;
  createdAt: Date;
}

/** Query params for fetching analytics */
export interface AnalyticsQueryParams {
  workspaceId: string;
  /** Time range: '7d', '30d', '90d' */
  range: '7d' | '30d' | '90d';
}

/** Query params for fetching audit log */
export interface AuditLogQueryParams {
  workspaceId: string;
  cursor?: string;
  limit?: number;
}
