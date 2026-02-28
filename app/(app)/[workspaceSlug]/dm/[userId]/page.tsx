import { redirect, notFound } from 'next/navigation';
import { auth } from '@/auth/auth';
import { prisma } from '@/shared/lib/prisma';

interface DMPageProps {
  params: { workspaceSlug: string; userId: string };
}

/**
 * DM view page.
 * Finds or creates a DM channel between the current user and the target userId,
 * then redirects to the channel view page (same layout as a regular channel).
 */
export default async function DMPage({ params }: DMPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const { workspaceSlug, userId: targetUserId } = params;

  // Don't allow DM with yourself
  if (session.user.id === targetUserId) {
    redirect(`/${workspaceSlug}`);
  }

  // Fetch workspace
  const workspace = await prisma.workspace.findUnique({
    where: { slug: workspaceSlug },
  });
  if (!workspace) {
    notFound();
  }

  // Verify target user exists and is a workspace member
  const targetMembership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: targetUserId,
      },
    },
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  if (!targetMembership) {
    notFound();
  }

  // Look for existing DM channel between the two users
  let dmChannel = await prisma.channel.findFirst({
    where: {
      workspaceId: workspace.id,
      type: 'DM',
      AND: [
        { members: { some: { userId: session.user.id } } },
        { members: { some: { userId: targetUserId } } },
      ],
    },
  });

  // Create DM channel if it doesn't exist
  if (!dmChannel) {
    // Sort user IDs for consistent naming
    const sortedIds = [session.user.id, targetUserId].sort();
    dmChannel = await prisma.channel.create({
      data: {
        workspaceId: workspace.id,
        name: `dm-${sortedIds[0]}-${sortedIds[1]}`,
        type: 'DM',
        createdById: session.user.id,
        members: {
          create: [
            { userId: session.user.id },
            { userId: targetUserId },
          ],
        },
      },
    });
  }

  // Redirect to the channel view for this DM
  redirect(`/${workspaceSlug}/channel/${dmChannel.id}`);
}
