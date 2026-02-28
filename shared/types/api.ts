/**
 * shared/types/api.ts
 *
 * Standard API response envelopes and pagination types.
 * All Next.js Route Handlers must return responses conforming to these shapes.
 *
 * Usage:
 *   import type { ApiSuccess, ApiError, PaginatedResponse } from '@/shared/types/api'
 */

// ---------------------------------------------------------------------------
// Response envelopes
// ---------------------------------------------------------------------------

/** Successful single-item response */
export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

/** Error response — returned with 4xx/5xx HTTP status codes */
export interface ApiError {
  ok: false;
  error: string;
  /** Machine-readable error code e.g. 'NOT_FOUND', 'UNAUTHORIZED', 'VALIDATION_ERROR' */
  code: string;
  /** Field-level validation errors (Zod) */
  fieldErrors?: Record<string, string[]>;
}

/** Successful paginated list response */
export interface PaginatedResponse<T> {
  ok: true;
  data: T[];
  pagination: PaginationMeta;
}

/** Pagination metadata included in paginated responses */
export interface PaginationMeta {
  /** Cursor for the next page — pass as `cursor` query param */
  cursor: string | null;
  /** Whether more items exist after this page */
  hasMore: boolean;
  /** Total count — only populated when explicitly requested (expensive) */
  total?: number;
}

// ---------------------------------------------------------------------------
// Common query params
// ---------------------------------------------------------------------------

/** Standard cursor-based pagination query params */
export interface PaginationParams {
  /** Cursor from previous page's pagination.cursor */
  cursor?: string;
  /** Items per page — default 50, max 100 */
  limit?: number;
}

/** Message list query params (extends pagination) */
export interface MessageQueryParams extends PaginationParams {
  /** Fetch messages before this message ID (for loading older history) */
  before?: string;
  /** Fetch messages after this message ID (for loading newer history) */
  after?: string;
}

/** Workspace search query params */
export interface SearchQueryParams {
  q: string;
  type?: 'messages' | 'channels' | 'files';
  channelId?: string;
  userId?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Helper type unions
// ---------------------------------------------------------------------------

/** Union of all possible API responses — useful for fetch wrappers */
export type ApiResponse<T> = ApiSuccess<T> | ApiError;
export type ApiListResponse<T> = PaginatedResponse<T> | ApiError;

// ---------------------------------------------------------------------------
// Route handler helper (implementation stubs)
// ---------------------------------------------------------------------------

/**
 * Wrap a value in the standard success envelope.
 * Use in Route Handlers: `return NextResponse.json(ok(data))`
 *
 * @param data - The response payload
 */
export function ok<T>(data: T): ApiSuccess<T> {
  return { ok: true, data };
}

/**
 * Wrap an error in the standard error envelope.
 * Use in Route Handlers: `return NextResponse.json(err('NOT_FOUND', 'Channel not found'), { status: 404 })`
 *
 * @param code - Machine-readable error code
 * @param message - Human-readable message
 * @param fieldErrors - Optional Zod validation errors
 */
export function err(
  code: string,
  message: string,
  fieldErrors?: Record<string, string[]>
): ApiError {
  return { ok: false, code, error: message, ...(fieldErrors && { fieldErrors }) };
}

/**
 * Wrap a list in the standard paginated envelope.
 *
 * @param data - The list items
 * @param cursor - Next page cursor (last item's ID, or null if no more pages)
 * @param hasMore - Whether more items exist
 */
export function paginated<T>(
  data: T[],
  cursor: string | null,
  hasMore: boolean
): PaginatedResponse<T> {
  return { ok: true, data, pagination: { cursor, hasMore } };
}
