import { notFound } from 'next/navigation';
import { auth } from '@/auth/auth';
import { prisma } from '@/shared/lib/prisma';
import { ChannelView } from './channel-view';
import type { ChannelType } from '@/shared/types';

interface ChannelPageProps {
  params: { workspaceSlug: string; channelId: string };
}

/**
 * Channel view page (Server Component).
 * Fetches channel details and initial messages, then delegates
 * to ChannelView (Client Component) for interactive rendering.
 */
export default async function ChannelPage({ params }: ChannelPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    return notFound();
  }

  const { channelId } = params;

  // Fetch channel details
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      _count: { select: { members: true } },
    },
  });

  if (!channel) {
    notFound();
  }

  // Verify user is a member of this channel
  const membership = await prisma.channelMember.findUnique({
    where: {
      channelId_userId: {
        channelId: channel.id,
        userId: session.user.id,
      },
    },
  });

  if (!membership) {
    notFound();
  }

  // Fetch initial messages (last 50)
  const messagesRaw = await prisma.message.findMany({
    where: {
      channelId: channel.id,
      parentId: null,
      isDeleted: false,
    },
    include: {
      author: { select: { id: true, name: true, image: true } },
      reactions: true,
      files: true,
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  // Transform messages to match MessageWithMeta shape
  const initialMessages = messagesRaw.map((msg) => {
    // Group reactions by emoji
    const reactionMap = new Map<string, { count: number; userIds: string[] }>();
    for (const r of msg.reactions) {
      const existing = reactionMap.get(r.emoji);
      if (existing) {
        existing.count++;
        existing.userIds.push(r.userId);
      } else {
        reactionMap.set(r.emoji, { count: 1, userIds: [r.userId] });
      }
    }
    const reactions = Array.from(reactionMap.entries()).map(
      ([emoji, { count, userIds }]) => ({ emoji, count, userIds })
    );

    return {
      id: msg.id,
      channelId: msg.channelId,
      userId: msg.userId,
      content: JSON.parse(msg.contentJson),
      contentPlain: msg.contentPlain,
      parentId: msg.parentId,
      replyCount: msg.replyCount,
      isEdited: msg.isEdited,
      isDeleted: msg.isDeleted,
      editedAt: msg.editedAt,
      deletedAt: msg.deletedAt,
      createdAt: msg.createdAt,
      author: {
        id: msg.author.id,
        name: msg.author.name ?? 'Unknown',
        image: msg.author.image,
      },
      files: msg.files.map((f) => ({
        id: f.id,
        name: f.name,
        url: f.url,
        size: f.size,
        mimeType: f.mimeType,
        width: f.width,
        height: f.height,
      })),
      reactions,
    };
  });

  // Mark channel as read
  await prisma.channelMember.update({
    where: {
      channelId_userId: {
        channelId: channel.id,
        userId: session.user.id,
      },
    },
    data: { lastReadAt: new Date() },
  });

  // Serialize channel for client component
  const serializedChannel = {
    id: channel.id,
    workspaceId: channel.workspaceId,
    name: channel.name,
    description: channel.description,
    type: channel.type as ChannelType,
    isArchived: channel.isArchived,
    createdById: channel.createdById,
    createdAt: channel.createdAt,
    memberCount: channel._count.members,
  };

  // For DM channels, fetch participant info
  let dmParticipantName: string | null = null;
  let dmParticipantId: string | null = null;
  if (channel.type === 'DM') {
    const otherMember = await prisma.channelMember.findFirst({
      where: {
        channelId: channel.id,
        userId: { not: session.user.id },
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });
    dmParticipantName = otherMember?.user?.name ?? null;
    dmParticipantId = otherMember?.user?.id ?? null;
  }

  return (
    <ChannelView
      channel={serializedChannel}
      initialMessages={initialMessages}
      dmParticipantName={dmParticipantName}
      dmParticipantId={dmParticipantId}
      currentUserId={session.user.id}
    />
  );
}
