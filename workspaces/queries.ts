/**
 * workspaces/queries.ts
 *
 * Database query functions for the workspace domain.
 * All functions use the Prisma singleton and return domain types.
 *
 * Usage:
 *   import { getWorkspaceBySlug, listUserWorkspaces } from '@/workspaces/queries'
 */

import { prisma } from '@/shared/lib/prisma';
import type { Workspace, WorkspaceMember, MemberRole, UserSummary } from '@/shared/types';
import type { WorkspaceWithMembers } from './types';

/** Select fields for a user summary embedded in responses */
const userSummarySelect = {
  id: true,
  name: true,
  image: true,
} as const;

/**
 * Get a workspace by its URL slug.
 * Returns null if no workspace matches the slug.
 */
export async function getWorkspaceBySlug(slug: string): Promise<Workspace | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { slug },
  });

  if (!workspace) return null;

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
 * Get a workspace by its ID.
 * Returns null if no workspace matches the ID.
 */
export async function getWorkspaceById(id: string): Promise<Workspace | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id },
  });

  if (!workspace) return null;

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
 * Get a workspace by ID with full member list and counts.
 * Returns null if no workspace matches the ID.
 */
export async function getWorkspaceWithMembers(id: string): Promise<WorkspaceWithMembers | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: { select: userSummarySelect },
        },
        orderBy: { joinedAt: 'asc' },
      },
      _count: {
        select: {
          channels: true,
          members: true,
        },
      },
    },
  });

  if (!workspace) return null;

  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    iconUrl: workspace.iconUrl,
    ownerId: workspace.ownerId,
    createdAt: workspace.createdAt,
    members: workspace.members.map((m) => ({
      id: m.id,
      workspaceId: m.workspaceId,
      userId: m.userId,
      role: m.role as MemberRole,
      joinedAt: m.joinedAt,
      user: m.user as UserSummary,
    })),
    memberCount: workspace._count.members,
    channelCount: workspace._count.channels,
  };
}

/**
 * List all workspaces the given user belongs to.
 * Returns workspaces ordered by most recently joined.
 */
export async function listUserWorkspaces(userId: string): Promise<Workspace[]> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: true,
    },
    orderBy: { joinedAt: 'desc' },
  });

  return memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    iconUrl: m.workspace.iconUrl,
    ownerId: m.workspace.ownerId,
    createdAt: m.workspace.createdAt,
  }));
}

/**
 * Get all members of a workspace with their user details.
 * Returns members ordered by role (OWNER first) then by join date.
 */
export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: {
      user: { select: userSummarySelect },
    },
    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
  });

  return members.map((m) => ({
    id: m.id,
    workspaceId: m.workspaceId,
    userId: m.userId,
    role: m.role as MemberRole,
    joinedAt: m.joinedAt,
    user: m.user as UserSummary,
  }));
}

/**
 * Get the role of a specific user in a workspace.
 * Returns null if the user is not a member.
 */
export async function getMemberRole(
  workspaceId: string,
  userId: string
): Promise<MemberRole | null> {
  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId, userId },
    },
    select: { role: true },
  });

  if (!member) return null;

  return member.role as MemberRole;
}

/**
 * Check if a workspace slug is already taken.
 * Returns true if the slug is in use.
 */
export async function isSlugTaken(slug: string): Promise<boolean> {
  const existing = await prisma.workspace.findUnique({
    where: { slug },
    select: { id: true },
  });

  return existing !== null;
}
