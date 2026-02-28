/**
 * app/api/workspaces/[workspaceId]/route.ts
 *
 * GET    /api/workspaces/:id  — Get workspace details (membership check)
 * PATCH  /api/workspaces/:id  — Update workspace (ADMIN+ role check)
 * DELETE /api/workspaces/:id  — Delete workspace (OWNER check)
 *
 * All responses use the standard ApiSuccess/ApiError envelopes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, AuthError } from '@/auth/middleware';
import { ok, err } from '@/shared/types/api';
import { getWorkspaceWithMembers } from '@/workspaces/queries';
import { getMemberRole } from '@/workspaces/queries';
import { updateWorkspace, deleteWorkspace } from '@/workspaces/actions';
import { hasPermission } from '@/shared/lib/constants';
import { MemberRole } from '@/shared/types';

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  slug: z.string().min(1).max(80).regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
    'Slug must be lowercase alphanumeric with hyphens'
  ).optional(),
  iconUrl: z.string().url().nullable().optional(),
  description: z.string().max(250).optional(),
});

type RouteParams = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/workspaces/:workspaceId
 * Returns workspace details with member list. Requires workspace membership.
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

    const workspace = await getWorkspaceWithMembers(workspaceId);
    if (!workspace) {
      return NextResponse.json(
        err('NOT_FOUND', 'Workspace not found'),
        { status: 404 }
      );
    }

    return NextResponse.json(ok(workspace));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        err('UNAUTHORIZED', error.message),
        { status: error.status }
      );
    }
    return NextResponse.json(
      err('INTERNAL_ERROR', 'Failed to fetch workspace'),
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/workspaces/:workspaceId
 * Updates workspace properties. Requires ADMIN+ role.
 */
export async function PATCH(
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
        err('FORBIDDEN', 'Only admins and owners can update workspace settings'),
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = updateWorkspaceSchema.safeParse(body);

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

    const workspace = await updateWorkspace(workspaceId, parsed.data);
    return NextResponse.json(ok(workspace));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        err('UNAUTHORIZED', error.message),
        { status: error.status }
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to update workspace';
    if (message.includes('already exists')) {
      return NextResponse.json(err('CONFLICT', message), { status: 409 });
    }
    return NextResponse.json(
      err('INTERNAL_ERROR', message),
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workspaces/:workspaceId
 * Deletes a workspace and all associated data. Requires OWNER role.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await requireAuth();
    const { workspaceId } = await params;

    // Check OWNER role
    const role = await getMemberRole(workspaceId, session.user.id);
    if (!role) {
      return NextResponse.json(
        err('FORBIDDEN', 'You are not a member of this workspace'),
        { status: 403 }
      );
    }
    if (role !== MemberRole.OWNER) {
      return NextResponse.json(
        err('FORBIDDEN', 'Only workspace owners can delete a workspace'),
        { status: 403 }
      );
    }

    await deleteWorkspace(workspaceId);
    return NextResponse.json(ok({ deleted: true }));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        err('UNAUTHORIZED', error.message),
        { status: error.status }
      );
    }
    return NextResponse.json(
      err('INTERNAL_ERROR', 'Failed to delete workspace'),
      { status: 500 }
    );
  }
}
