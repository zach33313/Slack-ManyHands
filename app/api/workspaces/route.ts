/**
 * app/api/workspaces/route.ts
 *
 * GET  /api/workspaces       — List all workspaces for the authenticated user
 * POST /api/workspaces       — Create a new workspace
 *
 * All responses use the standard ApiSuccess/ApiError envelopes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, AuthError } from '@/auth/middleware';
import { ok, err } from '@/shared/types/api';
import { listUserWorkspaces } from '@/workspaces/queries';
import { createWorkspace } from '@/workspaces/actions';
import { MAX_WORKSPACE_NAME_LENGTH } from '@/shared/lib/constants';
import { IS_DEMO, demoBlock } from '@/shared/lib/demo';

const createWorkspaceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(MAX_WORKSPACE_NAME_LENGTH),
  slug: z.string().min(1, 'Slug is required').max(80).regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
    'Slug must be lowercase alphanumeric with hyphens, cannot start or end with a hyphen'
  ),
});

/**
 * GET /api/workspaces
 * Returns all workspaces the authenticated user belongs to.
 */
export async function GET() {
  try {
    const session = await requireAuth();
    const workspaces = await listUserWorkspaces(session.user.id);
    return NextResponse.json(ok(workspaces));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        err('UNAUTHORIZED', error.message),
        { status: error.status }
      );
    }
    return NextResponse.json(
      err('INTERNAL_ERROR', 'Failed to fetch workspaces'),
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces
 * Creates a new workspace. Request body is validated with Zod.
 */
export async function POST(request: NextRequest) {
  if (IS_DEMO) return demoBlock('Workspace creation');
  try {
    await requireAuth();

    const body = await request.json();
    const parsed = createWorkspaceSchema.safeParse(body);

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

    const workspace = await createWorkspace(parsed.data.name, parsed.data.slug);
    return NextResponse.json(ok(workspace), { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        err('UNAUTHORIZED', error.message),
        { status: error.status }
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to create workspace';
    // Slug conflict or other business logic error
    if (message.includes('already exists')) {
      return NextResponse.json(err('CONFLICT', message), { status: 409 });
    }
    return NextResponse.json(
      err('INTERNAL_ERROR', message),
      { status: 500 }
    );
  }
}
