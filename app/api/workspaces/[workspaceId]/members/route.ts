/**
 * app/api/workspaces/[workspaceId]/members/route.ts
 *
 * GET    /api/workspaces/:id/members         — List workspace members
 * POST   /api/workspaces/:id/members         — Invite a member (email + role)
 * DELETE /api/workspaces/:id/members?userId=  — Remove a member
 *
 * All responses use the standard ApiSuccess/ApiError envelopes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, AuthError } from '@/auth/middleware';
import { ok, err } from '@/shared/types/api';
import { getWorkspaceMembers, getMemberRole } from '@/workspaces/queries';
import { inviteMember, removeMember } from '@/workspaces/actions';
import { hasPermission } from '@/shared/lib/constants';
import { MemberRole } from '@/shared/types';

const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']).default('MEMBER'),
});

type RouteParams = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/:workspaceId/members
 * Returns all members of the workspace with user details.
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await requireAuth();
    const { workspaceId } = await params;

    // Check membership
    const role = await getMemberRole(workspaceId, session.user.id);
    if (!role) {
      return NextResponse.json(
        err('FORBIDDEN', 'You are not a member of this workspace'),
        { status: 403 }
      );
    }

    const members = await getWorkspaceMembers(workspaceId);
    return NextResponse.json(ok(members));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        err('UNAUTHORIZED', error.message),
        { status: error.status }
      );
    }
    return NextResponse.json(
      err('INTERNAL_ERROR', 'Failed to fetch members'),
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces/:workspaceId/members
 * Invite a new member to the workspace by email.
 * Requires ADMIN+ role.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await requireAuth();
    const { workspaceId } = await params;

    // Check ADMIN+ role
    const role = await getMemberRole(workspaceId, session.user.id);
    if (!role) {
      return NextResponse.json(
        err('FORBIDDEN', 'You are not a member of this workspace'),
        { status: 403 }
      );
    }
    if (!hasPermission(role, MemberRole.ADMIN)) {
      return NextResponse.json(
        err('FORBIDDEN', 'Only admins and owners can invite members'),
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = inviteMemberSchema.safeParse(body);

    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path.join('.');
        if (!fieldErrors[field]) fieldErrors[field] = [];
        fieldErrors[field].push(issue.message);
      }
      return NextResponse.json(
        err('VALIDATION_ERROR', 'Invalid input', fieldErrors),
        { status: 400 }
      );
    }

    const member = await inviteMember(
      workspaceId,
      parsed.data.email,
      parsed.data.role as MemberRole
    );

    return NextResponse.json(ok(member), { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        err('UNAUTHORIZED', error.message),
        { status: error.status }
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to invite member';
    if (message.includes('already a member')) {
      return NextResponse.json(err('CONFLICT', message), { status: 409 });
    }
    if (message.includes('No user found')) {
      return NextResponse.json(err('NOT_FOUND', message), { status: 404 });
    }
    return NextResponse.json(
      err('INTERNAL_ERROR', message),
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workspaces/:workspaceId/members?userId=<userId>
 * Remove a member from the workspace.
 * Requires ADMIN+ role. Cannot remove the last OWNER.
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await requireAuth();
    const { workspaceId } = await params;

    const url = new URL(request.url);
    const targetUserId = url.searchParams.get('userId');

    if (!targetUserId) {
      return NextResponse.json(
        err('VALIDATION_ERROR', 'userId query parameter is required'),
        { status: 400 }
      );
    }

    // Check ADMIN+ role
    const role = await getMemberRole(workspaceId, session.user.id);
    if (!role) {
      return NextResponse.json(
        err('FORBIDDEN', 'You are not a member of this workspace'),
        { status: 403 }
      );
    }
    if (!hasPermission(role, MemberRole.ADMIN)) {
      return NextResponse.json(
        err('FORBIDDEN', 'Only admins and owners can remove members'),
        { status: 403 }
      );
    }

    await removeMember(workspaceId, targetUserId);
    return NextResponse.json(ok({ removed: true }));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        err('UNAUTHORIZED', error.message),
        { status: error.status }
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to remove member';
    if (message.includes('last owner')) {
      return NextResponse.json(err('FORBIDDEN', message), { status: 403 });
    }
    return NextResponse.json(
      err('INTERNAL_ERROR', message),
      { status: 500 }
    );
  }
}
