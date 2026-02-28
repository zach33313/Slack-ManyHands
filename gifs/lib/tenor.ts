/**
 * gifs/lib/tenor.ts
 *
 * Tenor API v2 server-side client.
 * Requires TENOR_API_KEY environment variable.
 *
 * API docs: https://developers.google.com/tenor/guides/quickstart
 */

import type { TenorGif, GifSearchResult } from '../types';

const TENOR_BASE_URL = 'https://tenor.googleapis.com/v2';

function getApiKey(): string {
  const key = process.env.TENOR_API_KEY;
  if (!key) {
    // Return a placeholder so the app doesn't crash — GIF search will fail gracefully
    console.warn('[tenor] TENOR_API_KEY is not set. GIF search will not work.');
    return 'MISSING_KEY';
  }
  return key;
}

/**
 * Map a raw Tenor API result object to our TenorGif type.
 */
function mapResult(item: any): TenorGif {
  const media = item.media_formats ?? {};

  // Prefer gif format, fall back to mediumgif, then tinygif for preview
  const fullUrl =
    media.gif?.url ??
    media.mediumgif?.url ??
    media.tinygif?.url ??
    '';

  const previewUrl =
    media.tinygif?.url ??
    media.nanogif?.url ??
    media.gif?.url ??
    '';

  const dims = media.gif?.dims ?? media.tinygif?.dims ?? [200, 200];

  return {
    id: item.id ?? '',
    title: item.title ?? '',
    url: fullUrl,
    previewUrl,
    width: dims[0] ?? 200,
    height: dims[1] ?? 200,
  };
}

/**
 * Search Tenor for GIFs matching a query.
 *
 * @param query - Search term
 * @param limit - Number of results (default 20)
 * @param pos - Pagination cursor from a previous response (optional)
 */
export async function searchGifs(
  query: string,
  limit = 20,
  pos?: string
): Promise<GifSearchResult> {
  const apiKey = getApiKey();
  const params = new URLSearchParams({
    q: query,
    key: apiKey,
    limit: String(Math.min(limit, 50)),
    media_filter: 'gif,tinygif',
    contentfilter: 'medium',
    ...(pos ? { pos } : {}),
  });

  const res = await fetch(`${TENOR_BASE_URL}/search?${params.toString()}`, {
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    throw new Error(`Tenor search failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  return {
    results: (data.results ?? []).map(mapResult),
    next: data.next ?? null,
  };
}

/**
 * Fetch trending GIFs from Tenor.
 *
 * @param limit - Number of results (default 20)
 */
export async function getTrending(limit = 20): Promise<GifSearchResult> {
  const apiKey = getApiKey();
  const params = new URLSearchParams({
    key: apiKey,
    limit: String(Math.min(limit, 50)),
    media_filter: 'gif,tinygif',
    contentfilter: 'medium',
  });

  const res = await fetch(`${TENOR_BASE_URL}/featured?${params.toString()}`, {
    next: { revalidate: 300 }, // Cache trending for 5 minutes
  });

  if (!res.ok) {
    throw new Error(`Tenor trending failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  return {
    results: (data.results ?? []).map(mapResult),
    next: data.next ?? null,
  };
}

/**
 * Search a specific Tenor category (e.g. "reactions", "memes").
 */
export async function searchCategory(
  category: string,
  limit = 20
): Promise<GifSearchResult> {
  return searchGifs(category, limit);
}
