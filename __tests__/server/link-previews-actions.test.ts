/**
 * Tests for link-previews/actions.ts
 *
 * Covers server actions:
 * - fetchLinkPreview: validates URL, uses DB cache (7-day TTL), falls back to OG scrape
 * - fetchLinkPreviewsForMessage: extracts URLs from text, saves previews to DB
 */

// ---------------------------------------------------------------------------
// Prisma mock — must be declared before jest.mock() call
// ---------------------------------------------------------------------------

const mockPrismaLinkPreview = {
  findFirst: jest.fn(),
  create: jest.fn(),
};

jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    linkPreview: mockPrismaLinkPreview,
  },
}));

// ---------------------------------------------------------------------------
// open-graph-scraper mock (used via dynamic import inside scrapeOG)
// ---------------------------------------------------------------------------

const mockOgsScraper = jest.fn();

jest.mock('open-graph-scraper', () => ({
  __esModule: true,
  default: mockOgsScraper,
}));

import {
  fetchLinkPreview,
  fetchLinkPreviewsForMessage,
} from '../../link-previews/actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A fresh cache record within the 7-day TTL window */
function makeCachedRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lp-1',
    messageId: null,
    url: 'https://example.com',
    title: 'Example Domain',
    description: 'An example site for illustrative use.',
    imageUrl: 'https://example.com/og.png',
    domain: 'example.com',
    createdAt: new Date(), // right now — well within 7-day window
    ...overrides,
  };
}

/** Build a successful OGS result object */
function makeOgsSuccess(overrides: Record<string, unknown> = {}) {
  return {
    result: {
      success: true,
      ogTitle: 'OG Title',
      ogDescription: 'OG description',
      ogImage: [{ url: 'https://example.com/og.jpg' }],
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Link Preview Actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // fetchLinkPreview
  // -------------------------------------------------------------------------

  describe('fetchLinkPreview', () => {
    it('returns null and skips DB for an invalid URL', async () => {
      const result = await fetchLinkPreview('not-a-url');

      expect(result).toBeNull();
      expect(mockPrismaLinkPreview.findFirst).not.toHaveBeenCalled();
      expect(mockOgsScraper).not.toHaveBeenCalled();
    });

    it('returns null for an empty string', async () => {
      const result = await fetchLinkPreview('');

      expect(result).toBeNull();
    });

    it('returns cached data when a fresh record exists in the DB', async () => {
      mockPrismaLinkPreview.findFirst.mockResolvedValue(makeCachedRecord());

      const result = await fetchLinkPreview('https://example.com');

      expect(result).not.toBeNull();
      expect(result!.url).toBe('https://example.com');
      expect(result!.title).toBe('Example Domain');
      expect(result!.domain).toBe('example.com');
      // OG scraper should NOT be called on cache hit
      expect(mockOgsScraper).not.toHaveBeenCalled();
    });

    it('derives favicon URL from Google S2 API using cached domain', async () => {
      mockPrismaLinkPreview.findFirst.mockResolvedValue(
        makeCachedRecord({ domain: 'github.com' })
      );

      const result = await fetchLinkPreview('https://github.com');

      expect(result!.favicon).toBe(
        'https://www.google.com/s2/favicons?domain=github.com&sz=32'
      );
    });

    it('queries DB with a 7-day cutoff timestamp', async () => {
      mockPrismaLinkPreview.findFirst.mockResolvedValue(null);
      mockOgsScraper.mockResolvedValue(makeOgsSuccess({ success: false }));

      const before = Date.now();
      await fetchLinkPreview('https://example.com');
      const after = Date.now();

      const [call] = mockPrismaLinkPreview.findFirst.mock.calls;
      const cutoff: Date = call[0].where.createdAt.gte;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - sevenDaysMs - 100);
      expect(cutoff.getTime()).toBeLessThanOrEqual(after - sevenDaysMs + 100);
    });

    it('scrapes OG data when cache miss (DB returns null)', async () => {
      mockPrismaLinkPreview.findFirst.mockResolvedValue(null);
      mockOgsScraper.mockResolvedValue(makeOgsSuccess());

      const result = await fetchLinkPreview('https://example.com');

      expect(mockOgsScraper).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result!.title).toBe('OG Title');
      expect(result!.description).toBe('OG description');
      expect(result!.imageUrl).toBe('https://example.com/og.jpg');
    });

    it('strips www from domain name', async () => {
      mockPrismaLinkPreview.findFirst.mockResolvedValue(null);
      mockOgsScraper.mockResolvedValue(makeOgsSuccess());

      const result = await fetchLinkPreview('https://www.example.com/page');

      expect(result!.domain).toBe('example.com');
    });

    it('returns null when OG scrape returns success: false', async () => {
      mockPrismaLinkPreview.findFirst.mockResolvedValue(null);
      mockOgsScraper.mockResolvedValue({ result: { success: false } });

      const result = await fetchLinkPreview('https://example.com');

      expect(result).toBeNull();
    });

    it('returns null when OG scraper throws', async () => {
      mockPrismaLinkPreview.findFirst.mockResolvedValue(null);
      mockOgsScraper.mockRejectedValue(new Error('Network timeout'));

      const result = await fetchLinkPreview('https://example.com');

      expect(result).toBeNull();
    });

    it('uses twitterImage as fallback when ogImage is missing', async () => {
      mockPrismaLinkPreview.findFirst.mockResolvedValue(null);
      mockOgsScraper.mockResolvedValue({
        result: {
          success: true,
          ogTitle: 'Twitter title',
          twitterImage: [{ url: 'https://example.com/twitter.jpg' }],
        },
      });

      const result = await fetchLinkPreview('https://example.com');

      expect(result!.imageUrl).toBe('https://example.com/twitter.jpg');
    });

    it('returns null imageUrl when no image metadata is available', async () => {
      mockPrismaLinkPreview.findFirst.mockResolvedValue(null);
      mockOgsScraper.mockResolvedValue({
        result: {
          success: true,
          ogTitle: 'No image',
        },
      });

      const result = await fetchLinkPreview('https://example.com');

      expect(result!.imageUrl).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // fetchLinkPreviewsForMessage
  // -------------------------------------------------------------------------

  describe('fetchLinkPreviewsForMessage', () => {
    it('returns empty array when no URLs found in text', async () => {
      const result = await fetchLinkPreviewsForMessage('msg-1', 'No links here at all');

      expect(result).toHaveLength(0);
      expect(mockPrismaLinkPreview.findFirst).not.toHaveBeenCalled();
    });

    it('returns empty array for empty text', async () => {
      const result = await fetchLinkPreviewsForMessage('msg-1', '');

      expect(result).toHaveLength(0);
    });

    it('extracts URLs from text and returns previews', async () => {
      // findFirst calls: cache check returns null, then duplicate check returns null
      mockPrismaLinkPreview.findFirst
        .mockResolvedValueOnce(null)  // cache check in fetchLinkPreview
        .mockResolvedValueOnce(null); // duplicate check in fetchLinkPreviewsForMessage

      mockOgsScraper.mockResolvedValue(makeOgsSuccess());
      mockPrismaLinkPreview.create.mockResolvedValue({});

      const result = await fetchLinkPreviewsForMessage(
        'msg-1',
        'Check out https://example.com for more info'
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.url).toBe('https://example.com');
      expect(result[0]!.title).toBe('OG Title');
    });

    it('saves preview to DB linked to messageId', async () => {
      mockPrismaLinkPreview.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      mockOgsScraper.mockResolvedValue(
        makeOgsSuccess({ ogTitle: 'Example', ogDescription: 'Desc' })
      );
      mockPrismaLinkPreview.create.mockResolvedValue({});

      await fetchLinkPreviewsForMessage('msg-42', 'https://example.com is great');

      expect(mockPrismaLinkPreview.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          messageId: 'msg-42',
          url: 'https://example.com',
          title: 'Example',
        }),
      });
    });

    it('deduplicates URLs — same URL appearing twice yields one preview', async () => {
      mockPrismaLinkPreview.findFirst.mockResolvedValue(makeCachedRecord());

      const result = await fetchLinkPreviewsForMessage(
        'msg-1',
        'https://example.com and again https://example.com'
      );

      expect(result).toHaveLength(1);
    });

    it('skips saving to DB when a record for messageId+url already exists', async () => {
      // Cache miss in fetchLinkPreview → scrape → standalone cache create (messageId: null)
      // Then duplicate guard finds existing message-linked record → skips message-linked create
      mockPrismaLinkPreview.findFirst
        .mockResolvedValueOnce(null)                      // fetchLinkPreview cache check
        .mockResolvedValueOnce({ id: 'existing-lp-1' }); // duplicate guard

      mockPrismaLinkPreview.create.mockResolvedValue({});
      mockOgsScraper.mockResolvedValue(makeOgsSuccess());

      await fetchLinkPreviewsForMessage('msg-1', 'https://example.com');

      // The standalone cache create (messageId: null) runs, but no message-linked create
      const calls = mockPrismaLinkPreview.create.mock.calls;
      const messageLinkedCreate = calls.find(
        (c: any[]) => c[0]?.data?.messageId === 'msg-1'
      );
      expect(messageLinkedCreate).toBeUndefined();
    });

    it('still returns preview data even when DB save fails', async () => {
      mockPrismaLinkPreview.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      mockOgsScraper.mockResolvedValue(makeOgsSuccess());
      mockPrismaLinkPreview.create.mockRejectedValue(new Error('DB error'));

      const result = await fetchLinkPreviewsForMessage('msg-1', 'https://example.com');

      // Data is returned even though caching failed
      expect(result).toHaveLength(1);
      expect(result[0]!.title).toBe('OG Title');
    });

    it('returns cached preview without re-saving to DB', async () => {
      // Both findFirst calls return a cached record — no scrape needed
      mockPrismaLinkPreview.findFirst
        .mockResolvedValueOnce(makeCachedRecord()) // cache hit in fetchLinkPreview
        .mockResolvedValueOnce({ id: 'existing' }); // duplicate in message save

      const result = await fetchLinkPreviewsForMessage(
        'msg-1',
        'https://example.com'
      );

      expect(mockOgsScraper).not.toHaveBeenCalled();
      expect(mockPrismaLinkPreview.create).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('handles up to 5 distinct URLs from a single message', async () => {
      // All hit cache
      mockPrismaLinkPreview.findFirst.mockResolvedValue(makeCachedRecord());

      const urls = [
        'https://one.com',
        'https://two.com',
        'https://three.com',
        'https://four.com',
        'https://five.com',
        'https://six.com', // 6th URL — should be ignored
      ];
      const text = urls.join(' ');

      const result = await fetchLinkPreviewsForMessage('msg-1', text);

      // Limited to 5
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('filters out null previews from scrape failures', async () => {
      mockPrismaLinkPreview.findFirst.mockResolvedValue(null);
      // First URL scrape succeeds, second fails
      mockOgsScraper
        .mockResolvedValueOnce(makeOgsSuccess())
        .mockResolvedValueOnce({ result: { success: false } });

      mockPrismaLinkPreview.create.mockResolvedValue({});
      // Two findFirst calls per URL (cache + duplicate), second URL's cache also misses
      mockPrismaLinkPreview.findFirst
        .mockResolvedValueOnce(null) // url1 cache
        .mockResolvedValueOnce(null) // url1 duplicate guard
        .mockResolvedValueOnce(null); // url2 cache (scrape will fail)

      const result = await fetchLinkPreviewsForMessage(
        'msg-1',
        'https://example.com and https://broken.com'
      );

      expect(result).toHaveLength(1);
    });
  });
});
