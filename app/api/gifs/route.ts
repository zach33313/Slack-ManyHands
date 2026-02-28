/**
 * app/api/gifs/route.ts
 *
 * Proxy endpoint for Tenor GIF search to keep the API key server-side.
 *
 * GET /api/gifs?q=cats&limit=20&pos=<cursor>  — Search GIFs
 * GET /api/gifs?trending=1&limit=20           — Trending GIFs
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth/auth';
import { searchGifs, getTrending } from '@/gifs/lib/tenor';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const q = searchParams.get('q') ?? '';
  const rawLimit = parseInt(searchParams.get('limit') ?? '20', 10);
  const limit = Math.min(Number.isNaN(rawLimit) ? 20 : rawLimit, 50);
  const pos = searchParams.get('pos') ?? undefined;
  const trending = searchParams.get('trending') === '1';

  try {
    let result;
    if (trending || !q.trim()) {
      result = await getTrending(limit);
    } else {
      result = await searchGifs(q.trim(), limit, pos ?? undefined);
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/gifs] Error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch GIFs' },
      { status: 502 }
    );
  }
}
