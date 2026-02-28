/**
 * app/api/users/[userId]/profile/route.ts
 *
 * GET  /api/users/:userId/profile — Get a user's public profile
 * PATCH /api/users/:userId/profile — Update own profile
 *
 * The PATCH endpoint only allows updating your own profile.
 * Returns ApiSuccess<UserProfile> on success.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth/auth';
import { ok, err } from '@/shared/types/api';
import { getUserProfile } from '@/members/queries';
import { updateProfile } from '@/members/actions';

interface RouteParams {
  params: { userId: string };
}

/**
 * GET /api/users/:userId/profile
 *
 * Returns the public profile for a user.
 * Any authenticated user can view any other user's profile.
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        err('UNAUTHORIZED', 'Authentication required'),
        { status: 401 }
      );
    }

    const { userId } = params;

    const profile = await getUserProfile(userId);
    if (!profile) {
      return NextResponse.json(
        err('NOT_FOUND', 'User not found'),
        { status: 404 }
      );
    }

    return NextResponse.json(ok(profile));
  } catch (error) {
    console.error('[GET /api/users/:userId/profile] Error:', error);
    return NextResponse.json(
      err('INTERNAL_ERROR', 'Failed to get user profile'),
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/users/:userId/profile
 *
 * Update profile fields for the authenticated user.
 * Only the user themselves can update their own profile.
 *
 * Body (all optional):
 *   displayName?: string
 *   statusText?: string
 *   statusEmoji?: string
 *   timezone?: string
 *   title?: string
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        err('UNAUTHORIZED', 'Authentication required'),
        { status: 401 }
      );
    }

    const { userId } = params;

    // Only allow updating own profile
    if (userId !== session.user.id) {
      return NextResponse.json(
        err('FORBIDDEN', 'You can only update your own profile'),
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate input fields
    const validFields = [
      'displayName',
      'statusText',
      'statusEmoji',
      'timezone',
      'title',
    ];
    const data: Record<string, string | undefined> = {};
    for (const field of validFields) {
      if (field in body) {
        const value = body[field];
        if (value !== undefined && value !== null && typeof value !== 'string') {
          return NextResponse.json(
            err('VALIDATION_ERROR', `${field} must be a string`),
            { status: 400 }
          );
        }
        data[field] = value ?? undefined;
      }
    }

    // Validate displayName length
    if (data.displayName !== undefined && data.displayName.trim().length === 0) {
      return NextResponse.json(
        err('VALIDATION_ERROR', 'displayName cannot be empty'),
        { status: 400 }
      );
    }

    // Validate statusEmoji is a single emoji (basic check)
    if (
      data.statusEmoji !== undefined &&
      data.statusEmoji.length > 0 &&
      data.statusEmoji.length > 4
    ) {
      return NextResponse.json(
        err('VALIDATION_ERROR', 'statusEmoji must be a single emoji'),
        { status: 400 }
      );
    }

    const updated = await updateProfile(data);

    return NextResponse.json(ok(updated));
  } catch (error) {
    console.error('[PATCH /api/users/:userId/profile] Error:', error);
    return NextResponse.json(
      err('INTERNAL_ERROR', 'Failed to update profile'),
      { status: 500 }
    );
  }
}
