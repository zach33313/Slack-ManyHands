/**
 * app/api/notifications/[notificationId]/read/route.ts
 *
 * PATCH /api/notifications/:notificationId/read — Mark a single notification as read.
 *
 * Validates ownership (the notification must belong to the current user).
 *
 * Response:
 *   200: ApiSuccess<{ success: true }>
 *   401: Unauthorized
 *   404: Notification not found or not owned
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth/auth';
import { ok, err } from '@/shared/types/api';
import { markNotificationRead } from '@/notifications/queries';

export async function PATCH(
  _request: NextRequest,
  { params }: { params: { notificationId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        err('UNAUTHORIZED', 'Authentication required'),
        { status: 401 }
      );
    }

    const { notificationId } = params;

    if (!notificationId) {
      return NextResponse.json(
        err('VALIDATION_ERROR', 'Notification ID is required'),
        { status: 400 }
      );
    }

    const success = await markNotificationRead(notificationId, session.user.id);

    if (!success) {
      return NextResponse.json(
        err('NOT_FOUND', 'Notification not found'),
        { status: 404 }
      );
    }

    return NextResponse.json(ok({ success: true }));
  } catch (error) {
    console.error('[notifications] PATCH read error:', error);
    return NextResponse.json(
      err('INTERNAL_ERROR', 'Failed to mark notification as read'),
      { status: 500 }
    );
  }
}
