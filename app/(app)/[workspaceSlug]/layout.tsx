import { redirect, notFound } from 'next/navigation';
import { auth } from '@/auth/auth';
import { prisma } from '@/shared/lib/prisma';
import { Sidebar } from '@/components/layout/Sidebar';
import { RightPanel } from '@/components/layout/RightPanel';
import { WorkspaceHydrator } from '@/components/layout/WorkspaceHydrator';
import { KeyboardShortcutsOverlay } from '@/components/layout/KeyboardShortcutsOverlay';
import type { ChannelType } from '@/shared/types';

interface WorkspaceLayoutProps {
  children: React.ReactNode;
  params: { workspaceSlug: string };
}

/**
 * Per-workspace layout.
 * Fetches workspace by slug, validates user membership.
 * Provides workspace data to the Zustand store via WorkspaceHydrator.
 * Renders Sidebar (WorkspaceSidebar + ChannelSidebar) + main content + RightPanel.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: WorkspaceLayoutProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const { workspaceSlug } = params;

  // Fetch workspace by slug
  const workspace = await prisma.workspace.findUnique({
    where: { slug: workspaceSlug },
  });

  if (!workspace) {
    notFound();
  }

  // Validate user is a member of this workspace
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: session.user.id,
      },
    },
  });

  if (!membership) {
    redirect('/');
  }

  // Fetch all channels for this workspace where user is a member
  const userChannelMemberships = await prisma.channelMember.findMany({
    where: { userId: session.user.id },
    select: { channelId: true, lastReadAt: true },
  });
  const memberChannelIds = new Set(userChannelMemberships.map((m) => m.channelId));
  const lastReadMap = new Map(
    userChannelMemberships.map((m) => [m.channelId, m.lastReadAt])
  );

  const channelsRaw = await prisma.channel.findMany({
    where: {
      workspaceId: workspace.id,
      isArchived: false,
      id: { in: Array.from(memberChannelIds) },
    },
    include: {
      _count: { select: { members: true } },
    },
    orderBy: { name: 'asc' },
  });

  // Compute unread counts per channel
  const channels = await Promise.all(
    channelsRaw.map(async (ch) => {
      const lastRead = lastReadMap.get(ch.id);
      let unreadCount = 0;

      if (lastRead) {
        unreadCount = await prisma.message.count({
          where: {
            channelId: ch.id,
            createdAt: { gt: lastRead },
            parentId: null,
            isDeleted: false,
          },
        });
      } else {
        // Never read — count all messages
        unreadCount = await prisma.message.count({
          where: {
            channelId: ch.id,
            parentId: null,
            isDeleted: false,
          },
        });
      }

      return {
        id: ch.id,
        workspaceId: ch.workspaceId,
        name: ch.name,
        description: ch.description,
        type: ch.type as ChannelType,
        isArchived: ch.isArchived,
        createdById: ch.createdById,
        createdAt: ch.createdAt,
        memberCount: ch._count.members,
        unreadCount,
      };
    })
  );

  // Fetch DM channels with participant info (includes GROUP_DM)
  const dmChannelsRaw = await prisma.channel.findMany({
    where: {
      workspaceId: workspace.id,
      type: { in: ['DM', 'GROUP_DM'] },
      members: { some: { userId: session.user.id } },
      isArchived: false,
    },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      },
      _count: { select: { members: true } },
    },
  });

  // Build DM participants map: channelId → other user(s)
  const dmParticipants: Record<string, Array<{ id: string; name: string; image: string | null }>> = {};
  for (const dm of dmChannelsRaw) {
    dmParticipants[dm.id] = dm.members
      .map((m) => ({
        id: m.user.id,
        name: m.user.name ?? 'Unknown',
        image: m.user.image,
      }))
      .filter((u) => u.id !== session.user.id);
  }

  // Merge DM channels into the channels array (if not already there)
  const existingChannelIds = new Set(channels.map((c) => c.id));
  const newDmChannels = dmChannelsRaw.filter((dm) => !existingChannelIds.has(dm.id));
  const dmResults = await Promise.all(
    newDmChannels.map(async (dm) => {
      const lastRead = lastReadMap.get(dm.id);
      let unreadCount = 0;
      if (lastRead) {
        unreadCount = await prisma.message.count({
          where: {
            channelId: dm.id,
            createdAt: { gt: lastRead },
            parentId: null,
            isDeleted: false,
          },
        });
      }
      return {
        id: dm.id,
        workspaceId: dm.workspaceId,
        name: dm.name,
        description: null,
        type: dm.type as ChannelType,
        isArchived: dm.isArchived,
        createdById: dm.createdById,
        createdAt: dm.createdAt,
        memberCount: dm._count.members,
        unreadCount,
      };
    })
  );
  channels.push(...dmResults);

  // Fetch all workspaces user belongs to (for workspace switcher)
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: session.user.id },
    include: { workspace: true },
    orderBy: { joinedAt: 'asc' },
  });
  const workspaces = memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    iconUrl: m.workspace.iconUrl,
    ownerId: m.workspace.ownerId,
    createdAt: m.workspace.createdAt,
  }));

  // Serialize workspace for client component props
  const serializedWorkspace = {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    iconUrl: workspace.iconUrl,
    ownerId: workspace.ownerId,
    createdAt: workspace.createdAt,
  };

  return (
    <>
      <WorkspaceHydrator
        workspace={serializedWorkspace}
        channels={channels}
        workspaces={workspaces}
        dmParticipants={dmParticipants}
        userId={session.user.id}
      />
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        {children}
      </div>
      <RightPanel />
      {/* Global keyboard shortcuts overlay — renders its own portal, triggered by ? or Cmd+/ */}
      <KeyboardShortcutsOverlay />
    </>
  );
}
