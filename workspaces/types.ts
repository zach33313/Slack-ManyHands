/**
 * workspaces/types.ts
 *
 * Workspace-specific types that extend the shared domain types.
 * These are used exclusively within the workspace domain and its components.
 *
 * For core types (Workspace, WorkspaceMember, CreateWorkspaceInput, MemberRole),
 * import from '@/shared/types'.
 */

import type { Workspace, WorkspaceMember, MemberRole } from '@/shared/types';

/** Workspace with hydrated member list and aggregate counts */
export interface WorkspaceWithMembers extends Workspace {
  members: WorkspaceMember[];
  memberCount: number;
  channelCount: number;
}

/** Input for updating an existing workspace */
export interface UpdateWorkspaceInput {
  name?: string;
  slug?: string;
  iconUrl?: string | null;
  description?: string;
}

/** Input for inviting a new member to a workspace */
export interface InviteInput {
  email: string;
  role: MemberRole;
}

/** Workspace list item shown in the workspace switcher */
export interface WorkspaceSwitcherItem {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
}
