/**
 * app/api/link-preview/route.ts
 *
 * GET /api/link-preview?url=<url>
 * Returns Open Graph metadata for the given URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth/auth';
import { fetchLinkPreview, isSafeUrl } from '@/link-previews/actions';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  // Validate URL structure and reject non-http(s) schemes up front so the
  // caller receives a clear 400 rather than a confusing 404.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return NextResponse.json(
      { error: 'Only http and https URLs are supported' },
      { status: 400 }
    );
  }

  // SSRF guard: resolve hostname via DNS and reject private/internal addresses.
  // This must run before any outbound fetch to prevent server-side request forgery.
  if (!await isSafeUrl(url)) {
    return NextResponse.json(
      { error: 'URL targets a private or disallowed address' },
      { status: 400 }
    );
  }

  try {
    const preview = await fetchLinkPreview(url);
    if (!preview) {
      return NextResponse.json({ error: 'No preview available' }, { status: 404 });
    }
    return NextResponse.json(preview);
  } catch (err) {
    console.error('[api/link-preview] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch preview' }, { status: 502 });
  }
}
