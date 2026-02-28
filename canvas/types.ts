/**
 * canvas/types.ts
 *
 * Types for the collaborative canvas/notes feature.
 * Real-time sync via Yjs CRDT over Socket.IO (canvas:update, canvas:awareness).
 * Version history stored as CanvasVersion snapshots.
 *
 * Core shared types (UserSummary, etc.) live in shared/types/index.ts.
 */

import type { UserSummary } from '@/shared/types';

// ---------------------------------------------------------------------------
// Domain Types
// ---------------------------------------------------------------------------

/** A collaborative canvas document associated with a channel */
export interface Canvas {
  id: string;
  channelId: string;
  name: string;
  /** Tiptap/Yjs document serialized as JSON string */
  contentJson: string;
  createdById: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** A snapshot of a canvas at a point in time */
export interface CanvasVersion {
  id: string;
  canvasId: string;
  userId: string;
  /** Full content at this version */
  contentJson: string;
  /** User-provided description of changes */
  changeDescription: string | null;
  createdAt: Date;
  /** Hydrated editor info */
  editor: UserSummary;
}
