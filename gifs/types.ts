/**
 * gifs/types.ts
 *
 * Types for the GIF search feature.
 * Server-side proxy to Tenor API v2 (requires TENOR_API_KEY env var).
 * GIFs inserted as message content via Tiptap.
 */

// ---------------------------------------------------------------------------
// Domain Types
// ---------------------------------------------------------------------------

/** A single GIF result from Tenor */
export interface TenorGif {
  id: string;
  title: string;
  /** Full-size GIF URL for display */
  url: string;
  /** Tiny preview URL for grid thumbnails */
  previewUrl: string;
  width: number;
  height: number;
}

/** Paginated GIF search response */
export interface GifSearchResult {
  results: TenorGif[];
  /** Pagination cursor from Tenor API (null if no more results) */
  next: string | null;
}
