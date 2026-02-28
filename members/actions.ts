/**
 * members/actions.ts
 *
 * Server Actions for member and profile management.
 * These are the primary mutation path for profile updates and role changes.
 *
 * Usage:
 *   import { updateProfile, updateMemberRole } from '@/members/actions'
 */

'use server';

import { auth } from '@/auth/auth';
import { prisma } from '@/shared/lib/prisma';
import { MemberRole } from '@/shared/types';
import type { UpdateProfileInput, UserProfile } from './types';

/**
 * Update the current user's profile fields.
 * Only the authenticated user can update their own profile.
 *
 * @param data - Profile fields to update (all optional)
 * @returns The updated user profile
 * @throws If not authenticated
 */
export async function updateProfile(
  data: UpdateProfileInput
): Promise<UserProfile> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized: You must be signed in to update your profile');
  }

  const userId = session.user.id;

  // Build the update data, mapping displayName to the `name` field
  const updateData: Record<string, unknown> = {};
  if (data.displayName !== undefined) updateData.name = data.displayName;
  if (data.statusText !== undefined) updateData.statusText = data.statusText;
  if (data.statusEmoji !== undefined) updateData.statusEmoji = data.statusEmoji;
  if (data.timezone !== undefined) updateData.timezone = data.timezone;
  if (data.title !== undefined) updateData.title = data.title;

  // Skip update if nothing to change
  if (Object.keys(updateData).length === 0) {
    const current = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        title: true,
        statusText: true,
        statusEmoji: true,
        timezone: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return current;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      title: true,
      statusText: true,
      statusEmoji: true,
      timezone: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return updated;
}

/**
 * Set or clear Do Not Disturb mode for the current user.
 *
 * @param dndUntil - Expiration date for DND, or null to clear
 * @returns Updated user record with new dndUntil value
 * @throws If not authenticated
 */
export async function setDND(
  dndUntil: Date | null
): Promise<UserProfile> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized: You must be signed in to set Do Not Disturb');
  }

  const userId = session.user.id;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { dndUntil },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      title: true,
      statusText: true,
      statusEmoji: true,
      timezone: true,
      dndUntil: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return updated;
}

/**
 * Get the current user's DND status.
 * Returns null if DND is not active or has expired.
 */
export async function getDNDStatus(): Promise<Date | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { dndUntil: true },
  });

  if (!user?.dndUntil) return null;

  // Auto-expire: if dndUntil is in the past, clear it
  const now = new Date();
  if (user.dndUntil < now) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { dndUntil: null },
    });
    return null;
  }

  return user.dndUntil;
}

/**
 * Update a workspace member's role.
 * Only the workspace OWNER can change member roles.
 *
 * @param workspaceId - The workspace
 * @param userId - The user whose role to change
 * @param role - The new role to assign
 * @returns The updated workspace member record
 * @throws If not authenticated, not an owner, or member not found
 */
export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  role: MemberRole
): Promise<{ id: string; workspaceId: string; userId: string; role: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized: You must be signed in');
  }

  const currentUserId = session.user.id;

  // Verify the current user is the workspace owner
  const currentMember = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: currentUserId,
      },
    },
    select: { role: true },
  });

  if (!currentMember || currentMember.role !== MemberRole.OWNER) {
    throw new Error('Forbidden: Only workspace owners can change member roles');
  }

  // Cannot change your own role (owner)
  if (userId === currentUserId) {
    throw new Error('Cannot change your own role');
  }

  // Verify the target user is a member of this workspace
  const targetMember = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
  });

  if (!targetMember) {
    throw new Error('Member not found in this workspace');
  }

  // Cannot assign OWNER role (transfer ownership is a separate operation)
  if (role === MemberRole.OWNER) {
    throw new Error('Cannot assign OWNER role via updateMemberRole');
  }

  const updated = await prisma.workspaceMember.update({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
    data: { role },
    select: {
      id: true,
      workspaceId: true,
      userId: true,
      role: true,
    },
  });

  return updated;
}
