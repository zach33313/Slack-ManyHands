'use server';

/**
 * workspaces/actions.ts
 *
 * Server Actions for workspace management.
 * These are the primary mutation path for workspace CRUD, membership, and role operations.
 *
 * All actions authenticate via NextAuth session and validate permissions
 * using the role hierarchy from shared/lib/constants.ts.
 *
 * Usage (client component):
 *   import { createWorkspace } from '@/workspaces/actions'
 *   const workspace = await createWorkspace('Acme Corp', 'acme-corp')
 */

import { prisma } from '@/shared/lib/prisma';
import { requireAuth } from '@/auth/middleware';
import { slugify } from '@/shared/lib/utils';
import { DEFAULT_CHANNELS, hasPermission } from '@/shared/lib/constants';
import { MemberRole, ChannelType } from '@/shared/types';
import type { Workspace, WorkspaceMember, UserSummary } from '@/shared/types';
import type { UpdateWorkspaceInput } from './types';
import { revalidatePath } from 'next/cache';

/**
 * Create a new workspace with the authenticated user as OWNER.
 * Automatically creates default #general and #random channels and adds the
 * owner as a member of both.
 *
 * @param name - Display name for the workspace
 * @param slug - URL-safe identifier (validated for uniqueness)
 * @returns The created workspace
 * @throws Error if slug is already taken or user is not authenticated
 */
export async function createWorkspace(name: string, slug: string): Promise<Workspace> {
  const session = await requireAuth();
  const userId = session.user.id;

  // Validate and normalize slug
  const normalizedSlug = slugify(slug);
  if (!normalizedSlug) {
    throw new Error('Invalid slug: must contain at least one alphanumeric character');
  }

  // Check slug uniqueness
  const existing = await prisma.workspace.findUnique({
    where: { slug: normalizedSlug },
    select: { id: true },
  });
  if (existing) {
    throw new Error('A workspace with this slug already exists');
  }

  // Create workspace + owner membership + default channels in a transaction
  const workspace = await prisma.$transaction(async (tx) => {
    // 1. Create the workspace
    const ws = await tx.workspace.create({
      data: {
        name: name.trim(),
        slug: normalizedSlug,
        ownerId: userId,
      },
    });

    // 2. Add creator as OWNER member
    await tx.workspaceMember.create({
      data: {
        workspaceId: ws.id,
        userId,
        role: MemberRole.OWNER,
      },
    });

    // 3. Create default channels and add owner to each
    for (const channelName of DEFAULT_CHANNELS) {
      const channel = await tx.channel.create({
        data: {
          workspaceId: ws.id,
          name: channelName,
          type: ChannelType.PUBLIC,
          createdById: userId,
        },
      });

      await tx.channelMember.create({
        data: {
          channelId: channel.id,
          userId,
        },
      });
    }

    return ws;
  });

  revalidatePath('/');

  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    iconUrl: workspace.iconUrl,
    ownerId: workspace.ownerId,
    createdAt: workspace.createdAt,
  };
}

/**
 * Update workspace properties.
 * Requires OWNER or ADMIN role.
 *
 * @param id - Workspace ID
 * @param data - Fields to update
 * @returns The updated workspace
 */
export async function updateWorkspace(
  id: string,
  data: UpdateWorkspaceInput
): Promise<Workspace> {
  const session = await requireAuth();
  const userId = session.user.id;

  // Check membership and role
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId } },
    select: { role: true },
  });

  if (!member) {
    throw new Error('You are not a member of this workspace');
  }

  if (!hasPermission(member.role as MemberRole, MemberRole.ADMIN)) {
    throw new Error('Only workspace owners and admins can update workspace settings');
  }

  // If updating slug, validate uniqueness
  if (data.slug) {
    const normalizedSlug = slugify(data.slug);
    const existing = await prisma.workspace.findFirst({
      where: { slug: normalizedSlug, id: { not: id } },
      select: { id: true },
    });
    if (existing) {
      throw new Error('A workspace with this slug already exists');
    }
    data.slug = normalizedSlug;
  }

  const workspace = await prisma.workspace.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.slug !== undefined && { slug: data.slug }),
      ...(data.iconUrl !== undefined && { iconUrl: data.iconUrl }),
    },
  });

  revalidatePath('/');

  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    iconUrl: workspace.iconUrl,
    ownerId: workspace.ownerId,
    createdAt: workspace.createdAt,
  };
}

/**
 * Delete a workspace and all associated data.
 * Requires OWNER role. Cascading deletes remove channels, messages, members, etc.
 *
 * @param id - Workspace ID to delete
 */
export async function deleteWorkspace(id: string): Promise<void> {
  const session = await requireAuth();
  const userId = session.user.id;

  // Check OWNER role specifically
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId } },
    select: { role: true },
  });

  if (!member) {
    throw new Error('You are not a member of this workspace');
  }

  if (member.role !== MemberRole.OWNER) {
    throw new Error('Only workspace owners can delete a workspace');
  }

  await prisma.workspace.delete({ where: { id } });

  revalidatePath('/');
}

/**
 * Invite a user to a workspace by email.
 * Finds the user by email, creates a WorkspaceMember record, and adds them
 * to all default channels (#general, #random).
 *
 * Requires ADMIN+ role.
 *
 * @param workspaceId - Workspace to invite to
 * @param email - Email address of the user to invite
 * @param role - Role to assign (defaults to MEMBER)
 * @returns The created workspace member record
 */
export async function inviteMember(
  workspaceId: string,
  email: string,
  role: MemberRole = MemberRole.MEMBER
): Promise<WorkspaceMember> {
  const session = await requireAuth();
  const userId = session.user.id;

  // Check inviter has ADMIN+ role
  const inviterMember = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });

  if (!inviterMember) {
    throw new Error('You are not a member of this workspace');
  }

  if (!hasPermission(inviterMember.role as MemberRole, MemberRole.ADMIN)) {
    throw new Error('Only workspace owners and admins can invite members');
  }

  // Cannot invite someone as OWNER unless you are OWNER
  if (role === MemberRole.OWNER && inviterMember.role !== MemberRole.OWNER) {
    throw new Error('Only workspace owners can invite new owners');
  }

  // Find the user by email
  const targetUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { id: true, name: true, image: true },
  });

  if (!targetUser) {
    throw new Error('No user found with that email address');
  }

  // Check if already a member
  const existingMember = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetUser.id } },
    select: { id: true },
  });

  if (existingMember) {
    throw new Error('This user is already a member of the workspace');
  }

  // Create membership and add to default channels in a transaction
  const member = await prisma.$transaction(async (tx) => {
    // Create workspace membership
    const newMember = await tx.workspaceMember.create({
      data: {
        workspaceId,
        userId: targetUser.id,
        role,
      },
    });

    // Find default channels in this workspace
    const defaultChannels = await tx.channel.findMany({
      where: {
        workspaceId,
        name: { in: [...DEFAULT_CHANNELS] },
        isArchived: false,
      },
      select: { id: true },
    });

    // Add user to each default channel
    for (const channel of defaultChannels) {
      await tx.channelMember.create({
        data: {
          channelId: channel.id,
          userId: targetUser.id,
        },
      });
    }

    return newMember;
  });

  revalidatePath('/');

  return {
    id: member.id,
    workspaceId: member.workspaceId,
    userId: member.userId,
    role: member.role as MemberRole,
    joinedAt: member.joinedAt,
    user: targetUser as UserSummary,
  };
}

/**
 * Remove a member from a workspace.
 * Requires ADMIN+ role. Cannot remove the last OWNER.
 *
 * @param workspaceId - Workspace ID
 * @param targetUserId - User ID to remove
 */
export async function removeMember(
  workspaceId: string,
  targetUserId: string
): Promise<void> {
  const session = await requireAuth();
  const userId = session.user.id;

  // Check remover has ADMIN+ role
  const removerMember = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });

  if (!removerMember) {
    throw new Error('You are not a member of this workspace');
  }

  if (!hasPermission(removerMember.role as MemberRole, MemberRole.ADMIN)) {
    throw new Error('Only workspace owners and admins can remove members');
  }

  // Get the target member
  const targetMember = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    select: { role: true },
  });

  if (!targetMember) {
    throw new Error('User is not a member of this workspace');
  }

  // Cannot remove an OWNER unless you are also OWNER
  if (
    targetMember.role === MemberRole.OWNER &&
    removerMember.role !== MemberRole.OWNER
  ) {
    throw new Error('Only workspace owners can remove other owners');
  }

  // Prevent removing the last OWNER
  if (targetMember.role === MemberRole.OWNER) {
    const ownerCount = await prisma.workspaceMember.count({
      where: { workspaceId, role: MemberRole.OWNER },
    });
    if (ownerCount <= 1) {
      throw new Error('Cannot remove the last owner of a workspace');
    }
  }

  // Remove from all workspace channels first, then from workspace
  await prisma.$transaction(async (tx) => {
    // Get all channels in the workspace
    const workspaceChannels = await tx.channel.findMany({
      where: { workspaceId },
      select: { id: true },
    });
    const channelIds = workspaceChannels.map((c) => c.id);

    // Remove from all channels in this workspace
    if (channelIds.length > 0) {
      await tx.channelMember.deleteMany({
        where: {
          userId: targetUserId,
          channelId: { in: channelIds },
        },
      });
    }

    // Remove workspace membership
    await tx.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
  });

  revalidatePath('/');
}

/**
 * Update a member's role in a workspace.
 * Requires OWNER role to change roles.
 *
 * @param workspaceId - Workspace ID
 * @param targetUserId - User whose role is being changed
 * @param newRole - New role to assign
 * @returns Updated workspace member
 */
export async function updateMemberRole(
  workspaceId: string,
  targetUserId: string,
  newRole: MemberRole
): Promise<WorkspaceMember> {
  const session = await requireAuth();
  const userId = session.user.id;

  // Only OWNER can change roles
  const changerMember = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });

  if (!changerMember) {
    throw new Error('You are not a member of this workspace');
  }

  if (changerMember.role !== MemberRole.OWNER) {
    throw new Error('Only workspace owners can change member roles');
  }

  // Get the target member
  const targetMember = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    select: { id: true, role: true },
  });

  if (!targetMember) {
    throw new Error('User is not a member of this workspace');
  }

  // Cannot demote yourself if you're the last OWNER
  if (
    userId === targetUserId &&
    targetMember.role === MemberRole.OWNER &&
    newRole !== MemberRole.OWNER
  ) {
    const ownerCount = await prisma.workspaceMember.count({
      where: { workspaceId, role: MemberRole.OWNER },
    });
    if (ownerCount <= 1) {
      throw new Error('Cannot demote the last owner. Transfer ownership first.');
    }
  }

  const updated = await prisma.workspaceMember.update({
    where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    data: { role: newRole },
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
  });

  revalidatePath('/');

  return {
    id: updated.id,
    workspaceId: updated.workspaceId,
    userId: updated.userId,
    role: updated.role as MemberRole,
    joinedAt: updated.joinedAt,
    user: updated.user as UserSummary,
  };
}
