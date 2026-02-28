/**
 * app/api/notifications/route.ts
 *
 * GET /api/notifications — Fetch paginated notifications for the current user.
 *
 * Query params:
 *   unreadOnly?: 'true' | 'false' — filter to unread only (default: false)
 *   cursor?: string — notification ID for cursor-based pagination
 *   limit?: number — items per page (default: 20, max: 100)
 *
 * Response: PaginatedResponse<NotificationWithDetails>
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth/auth';
import { err, paginated } from '@/shared/types/api';
import { getNotifications, getUnreadCount } from '@/notifications/queries';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        err('UNAUTHORIZED', 'Authentication required'),
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const searchParams = request.nextUrl.searchParams;

    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const cursor = searchParams.get('cursor') ?? undefined;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 100) : 20;

    const { notifications, hasMore } = await getNotifications(userId, {
      unreadOnly,
      cursor,
      limit,
    });

    // Get total unread count for the badge
    const totalUnread = await getUnreadCount(userId);

    const lastNotification = notifications[notifications.length - 1];
    const nextCursor = hasMore && lastNotification ? lastNotification.id : null;

    const response = paginated(notifications, nextCursor, hasMore);
    // Add total unread to pagination metadata
    response.pagination.total = totalUnread;

    return NextResponse.json(response);
  } catch (error) {
    console.error('[notifications] GET error:', error);
    return NextResponse.json(
      err('INTERNAL_ERROR', 'Failed to fetch notifications'),
      { status: 500 }
    );
  }
}
