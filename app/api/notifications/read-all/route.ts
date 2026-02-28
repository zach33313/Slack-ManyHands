/**
 * app/api/notifications/read-all/route.ts
 *
 * POST /api/notifications/read-all — Mark all notifications as read for the current user.
 *
 * Response:
 *   200: ApiSuccess<{ count: number }> — number of notifications marked as read
 *   401: Unauthorized
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth/auth';
import { ok, err } from '@/shared/types/api';
import { markAllRead } from '@/notifications/queries';

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        err('UNAUTHORIZED', 'Authentication required'),
        { status: 401 }
      );
    }

    const count = await markAllRead(session.user.id);

    return NextResponse.json(ok({ count }));
  } catch (error) {
    console.error('[notifications] POST read-all error:', error);
    return NextResponse.json(
      err('INTERNAL_ERROR', 'Failed to mark all notifications as read'),
      { status: 500 }
    );
  }
}
