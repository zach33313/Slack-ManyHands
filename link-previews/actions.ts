'use server';

/**
 * link-previews/actions.ts
 *
 * Server actions for fetching and caching Open Graph link previews.
 * Uses open-graph-scraper to extract OG metadata.
 * Results are cached in the LinkPreview database table (7-day TTL).
 */

import dns from 'node:dns';
import { prisma } from '@/shared/lib/prisma';
import type { LinkPreviewData } from './types';

// ---------------------------------------------------------------------------
// URL extraction
// ---------------------------------------------------------------------------

/** Regex to extract http/https URLs from text */
const URL_REGEX =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;

/** Extract up to `max` unique URLs from a plain text string */
function extractUrls(text: string, max = 5): string[] {
  const matches = text.match(URL_REGEX) ?? [];
  return [...new Set(matches)].slice(0, max);
}

// ---------------------------------------------------------------------------
// SSRF guard
// ---------------------------------------------------------------------------

/**
 * Returns true if the given IP address string falls within any private,
 * loopback, link-local, or otherwise non-routable range.
 */
function isPrivateIP(ip: string): boolean {
  // Strip surrounding IPv6 brackets if present (e.g. "[::1]" → "::1")
  const addr = ip.startsWith('[') && ip.endsWith(']') ? ip.slice(1, -1) : ip;

  // IPv4 range checks
  const v4 = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127) return true;                         // 127.0.0.0/8   loopback
    if (a === 10) return true;                          // 10.0.0.0/8    private
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true;            // 192.168.0.0/16 private
    if (a === 169 && b === 254) return true;            // 169.254.0.0/16 link-local / metadata
    if (a === 0) return true;                           // 0.0.0.0/8     "this" network
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 carrier-grade NAT
    return false;
  }

  // IPv6 range checks
  const lower = addr.toLowerCase();
  if (lower === '::1') return true;           // loopback
  if (/^fe80/i.test(lower)) return true;     // fe80::/10 link-local
  if (/^f[cd]/i.test(lower)) return true;    // fc00::/7  unique-local (fc** and fd**)

  return false;
}

/**
 * Returns true only for URLs that are safe to make outbound requests to.
 *
 * Protection layers:
 *  1. Scheme must be http or https.
 *  2. Hostname "localhost", "0.0.0.0", and any bare name without a dot are rejected.
 *  3. IPv4 and IPv6 literals are checked directly against private ranges.
 *  4. Regular hostnames are resolved via DNS (dns.promises.lookup) and every
 *     returned address is checked — this prevents DNS-rebinding attacks where
 *     an attacker controls DNS to point a public hostname at an internal IP.
 */
export async function isSafeUrl(rawUrl: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  // Only allow http and https — no file://, ftp://, data:, etc.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block explicit loopback/any hostnames
  if (hostname === 'localhost' || hostname === '0.0.0.0') {
    return false;
  }

  // Block bare hostnames with no dot (internal names like "db", "redis", "internal")
  if (!hostname.includes('.')) {
    return false;
  }

  // IPv6 literal: URL parser keeps brackets, e.g. "[::1]"
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return !isPrivateIP(hostname.slice(1, -1));
  }

  // IPv4 literal: check directly without DNS
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return !isPrivateIP(hostname);
  }

  // Regular hostname — resolve all DNS addresses and verify none are private.
  // Using { all: true } ensures we check every A/AAAA record returned, which
  // is essential for DNS-rebinding protection.
  try {
    const addresses = await dns.promises.lookup(hostname, { all: true });
    for (const { address } of addresses) {
      if (isPrivateIP(address)) return false;
    }
  } catch {
    // DNS resolution failed — treat as unsafe to avoid TOCTOU issues
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// OG fetch helper
// ---------------------------------------------------------------------------

async function scrapeOG(url: string): Promise<LinkPreviewData | null> {
  try {
    // Dynamic import so this is server-only and doesn't blow up the client bundle
    const ogs = (await import('open-graph-scraper')).default;
    const { result } = await ogs({
      url,
      timeout: 5000,
      fetchOptions: {
        headers: {
          'user-agent':
            'Mozilla/5.0 (compatible; SlackCloneBot/1.0; +https://example.com)',
        },
      },
    });

    if (!result.success) return null;

    const domain = new URL(url).hostname.replace(/^www\./, '');

    const imageUrl =
      (result.ogImage as any)?.[0]?.url ??
      (result.twitterImage as any)?.[0]?.url ??
      null;

    const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

    return {
      url,
      title: result.ogTitle ?? result.twitterTitle ?? result.dcTitle ?? null,
      description:
        result.ogDescription ??
        result.twitterDescription ??
        result.dcDescription ??
        null,
      imageUrl,
      domain,
      favicon,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public actions
// ---------------------------------------------------------------------------

/** 7-day cache TTL in milliseconds */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Fetch Open Graph metadata for a URL, using the database as a cache.
 * Cache is considered valid if the record was created within the last 7 days.
 */
export async function fetchLinkPreview(
  url: string
): Promise<LinkPreviewData | null> {
  // Validate URL and reject any that target private/internal networks (SSRF guard)
  if (!await isSafeUrl(url)) return null;

  // Check cache (messageId is optional — use a sentinel for URL-only cache)
  const cutoff = new Date(Date.now() - CACHE_TTL_MS);
  const cached = await prisma.linkPreview.findFirst({
    where: { url, createdAt: { gte: cutoff } },
    orderBy: { createdAt: 'desc' },
  });

  if (cached) {
    return {
      url: cached.url,
      title: cached.title,
      description: cached.description,
      imageUrl: cached.imageUrl,
      domain: cached.domain,
      favicon: `https://www.google.com/s2/favicons?domain=${cached.domain}&sz=32`,
    };
  }

  // Cache miss — scrape the OG data and persist for future calls
  const data = await scrapeOG(url);
  if (data) {
    try {
      await prisma.linkPreview.create({
        data: {
          messageId: null,
          url,
          title: data.title,
          description: data.description,
          imageUrl: data.imageUrl,
          domain: data.domain,
        },
      });
    } catch {
      // Non-fatal — still return the scraped data even if caching fails
    }
  }
  return data;
}

/**
 * Fetch link previews for all URLs found in a plain text message body.
 * Saves each preview to the LinkPreview table attached to the message.
 * Returns up to 5 previews.
 */
export async function fetchLinkPreviewsForMessage(
  messageId: string,
  contentPlain: string
): Promise<LinkPreviewData[]> {
  const urls = extractUrls(contentPlain, 5);
  if (urls.length === 0) return [];

  const previews = await Promise.all(
    urls.map(async (url) => {
      const data = await fetchLinkPreview(url);
      if (!data) return null;

      // Save to database for real-time display in message feed
      // Check if one already exists to avoid duplicates
      try {
        const existing = await prisma.linkPreview.findFirst({
          where: { messageId, url },
        });
        if (!existing) {
          await prisma.linkPreview.create({
            data: {
              messageId,
              url,
              title: data.title,
              description: data.description,
              imageUrl: data.imageUrl,
              domain: data.domain,
            },
          });
        }
      } catch {
        // Non-fatal — we still return the data even if caching fails
      }

      return data;
    })
  );

  return previews.filter((p): p is LinkPreviewData => p !== null);
}
