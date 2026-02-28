/**
 * link-previews/types.ts
 *
 * Types for OG (Open Graph) link unfurling.
 * URLs extracted from messages are fetched server-side via open-graph-scraper,
 * stored as LinkPreview rows, and displayed as cards below the message.
 */

// ---------------------------------------------------------------------------
// Domain Types
// ---------------------------------------------------------------------------

/** Open Graph metadata extracted from a URL */
export interface LinkPreviewData {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  /** Hostname extracted from url (e.g. "github.com") */
  domain: string;
  favicon: string | null;
}
