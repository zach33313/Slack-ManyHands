/**
 * Tests for gifs/lib/tenor.ts
 *
 * Covers the Tenor API v2 client:
 * - searchGifs: calls /v2/search with correct params, maps results to TenorGif
 * - getTrending: calls /v2/featured with correct params
 * - searchCategory: delegates to searchGifs with the category as query
 */

// ---------------------------------------------------------------------------
// Mock global.fetch — Tenor client uses fetch directly
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

import { searchGifs, getTrending, searchCategory } from '../../gifs/lib/tenor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A raw Tenor API result item with full media_formats */
function makeTenorItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'gif-1',
    title: 'funny cat',
    media_formats: {
      gif: { url: 'https://media.tenor.com/cat.gif', dims: [200, 150] },
      tinygif: { url: 'https://media.tenor.com/cat-tiny.gif', dims: [100, 75] },
    },
    ...overrides,
  };
}

/** Wrap items into a Tenor API response shape */
function makeApiResponse(items: unknown[] = [], next?: string) {
  return {
    results: items,
    next: next ?? null,
  };
}

/** Return a resolved Response-like object with an ok JSON body */
function mockOkResponse(body: object): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response);
}

/** Return a resolved Response-like object representing an HTTP error */
function mockErrorResponse(status: number, statusText = 'Error'): Promise<Response> {
  return Promise.resolve({
    ok: false,
    status,
    statusText,
  } as Response);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Tenor GIF Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure the API key is set so the client doesn't log a warning
    process.env.TENOR_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.TENOR_API_KEY;
  });

  // -------------------------------------------------------------------------
  // searchGifs
  // -------------------------------------------------------------------------

  describe('searchGifs', () => {
    it('calls the Tenor /v2/search endpoint', async () => {
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse([makeTenorItem()])));

      await searchGifs('cats');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('tenor.googleapis.com/v2/search');
    });

    it('includes query, key, and limit in the request URL', async () => {
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse([])));

      await searchGifs('cats', 10);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('q=cats');
      expect(url).toContain('key=test-api-key');
      expect(url).toContain('limit=10');
    });

    it('maps a Tenor result to TenorGif shape', async () => {
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse([makeTenorItem()])));

      const result = await searchGifs('cats');

      expect(result.results).toHaveLength(1);
      const gif = result.results[0]!;
      expect(gif.id).toBe('gif-1');
      expect(gif.title).toBe('funny cat');
      expect(gif.url).toBe('https://media.tenor.com/cat.gif');
      expect(gif.previewUrl).toBe('https://media.tenor.com/cat-tiny.gif');
      expect(gif.width).toBe(200);
      expect(gif.height).toBe(150);
    });

    it('returns the next pagination cursor from the response', async () => {
      mockFetch.mockReturnValue(
        mockOkResponse(makeApiResponse([makeTenorItem()], 'cursor-abc'))
      );

      const result = await searchGifs('cats');

      expect(result.next).toBe('cursor-abc');
    });

    it('returns null next when there are no more results', async () => {
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse([])));

      const result = await searchGifs('cats');

      expect(result.next).toBeNull();
    });

    it('appends the pos param when provided', async () => {
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse([])));

      await searchGifs('cats', 20, 'next-page-cursor');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('pos=next-page-cursor');
    });

    it('does not include pos param when not provided', async () => {
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse([])));

      await searchGifs('cats');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).not.toContain('pos=');
    });

    it('caps limit at 50 even if a higher value is requested', async () => {
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse([])));

      await searchGifs('cats', 999);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('limit=50');
    });

    it('returns empty results array when API response has no results key', async () => {
      mockFetch.mockReturnValue(mockOkResponse({ next: null }));

      const result = await searchGifs('xyz');

      expect(result.results).toHaveLength(0);
    });

    it('throws when the API returns a non-ok response', async () => {
      mockFetch.mockReturnValue(mockErrorResponse(429, 'Too Many Requests'));

      await expect(searchGifs('cats')).rejects.toThrow('Tenor search failed');
    });

    it('falls back to mediumgif url when gif format is missing', async () => {
      const item = makeTenorItem({
        media_formats: {
          mediumgif: { url: 'https://media.tenor.com/cat-med.gif', dims: [160, 120] },
          tinygif: { url: 'https://media.tenor.com/cat-tiny.gif', dims: [80, 60] },
        },
      });
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse([item])));

      const result = await searchGifs('cats');

      expect(result.results[0]!.url).toBe('https://media.tenor.com/cat-med.gif');
    });

    it('falls back to tinygif url when both gif and mediumgif are missing', async () => {
      const item = makeTenorItem({
        media_formats: {
          tinygif: { url: 'https://media.tenor.com/cat-tiny.gif', dims: [80, 60] },
        },
      });
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse([item])));

      const result = await searchGifs('cats');

      expect(result.results[0]!.url).toBe('https://media.tenor.com/cat-tiny.gif');
    });

    it('uses nanogif as preview fallback when tinygif is missing', async () => {
      const item = makeTenorItem({
        media_formats: {
          gif: { url: 'https://media.tenor.com/cat.gif', dims: [200, 150] },
          nanogif: { url: 'https://media.tenor.com/cat-nano.gif', dims: [40, 30] },
        },
      });
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse([item])));

      const result = await searchGifs('cats');

      expect(result.results[0]!.previewUrl).toBe('https://media.tenor.com/cat-nano.gif');
    });

    it('uses default 200x200 dimensions when media_formats is empty', async () => {
      const item = makeTenorItem({ media_formats: {} });
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse([item])));

      const result = await searchGifs('cats');

      expect(result.results[0]!.width).toBe(200);
      expect(result.results[0]!.height).toBe(200);
    });

    it('maps multiple results correctly', async () => {
      const items = [
        makeTenorItem({ id: 'gif-1', title: 'cat one' }),
        makeTenorItem({ id: 'gif-2', title: 'cat two' }),
        makeTenorItem({ id: 'gif-3', title: 'cat three' }),
      ];
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse(items)));

      const result = await searchGifs('cats', 3);

      expect(result.results).toHaveLength(3);
      expect(result.results.map((g) => g.id)).toEqual(['gif-1', 'gif-2', 'gif-3']);
    });

    it('handles missing id and title gracefully with empty strings', async () => {
      const item = makeTenorItem({ id: undefined, title: undefined });
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse([item])));

      const result = await searchGifs('cats');

      expect(result.results[0]!.id).toBe('');
      expect(result.results[0]!.title).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // getTrending
  // -------------------------------------------------------------------------

  describe('getTrending', () => {
    it('calls the Tenor /v2/featured endpoint', async () => {
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse([makeTenorItem()])));

      await getTrending();

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('tenor.googleapis.com/v2/featured');
    });

    it('passes the limit param to the featured endpoint', async () => {
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse([])));

      await getTrending(15);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('limit=15');
    });

    it('includes the API key in the request', async () => {
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse([])));

      await getTrending();

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('key=test-api-key');
    });

    it('maps trending results to TenorGif shape', async () => {
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse([makeTenorItem()])));

      const result = await getTrending();

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.id).toBe('gif-1');
      expect(result.results[0]!.url).toBe('https://media.tenor.com/cat.gif');
    });

    it('throws when the API returns a non-ok response', async () => {
      mockFetch.mockReturnValue(mockErrorResponse(503, 'Service Unavailable'));

      await expect(getTrending()).rejects.toThrow('Tenor trending failed');
    });

    it('caps limit at 50', async () => {
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse([])));

      await getTrending(100);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('limit=50');
    });

    it('returns empty results array when no trending GIFs', async () => {
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse([])));

      const result = await getTrending();

      expect(result.results).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // searchCategory
  // -------------------------------------------------------------------------

  describe('searchCategory', () => {
    it('delegates to the search endpoint using category as query', async () => {
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse([makeTenorItem()])));

      await searchCategory('reactions', 12);

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('tenor.googleapis.com/v2/search');
      expect(url).toContain('q=reactions');
      expect(url).toContain('limit=12');
    });

    it('returns mapped GIF results for the category', async () => {
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse([makeTenorItem()])));

      const result = await searchCategory('memes');

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.id).toBe('gif-1');
    });

    it('uses default limit of 20 when not specified', async () => {
      mockFetch.mockReturnValue(mockOkResponse(makeApiResponse([])));

      await searchCategory('trending');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('limit=20');
    });

    it('propagates errors from the underlying searchGifs call', async () => {
      mockFetch.mockReturnValue(mockErrorResponse(500, 'Internal Server Error'));

      await expect(searchCategory('reactions')).rejects.toThrow('Tenor search failed');
    });
  });
});
