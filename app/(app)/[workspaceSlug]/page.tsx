import { redirect, notFound } from 'next/navigation';
import { auth } from '@/auth/auth';
import { prisma } from '@/shared/lib/prisma';

interface WorkspacePageProps {
  params: { workspaceSlug: string };
}

/**
 * Workspace home page — redirects to the #general channel.
 * If #general doesn't exist, redirects to the first available channel.
 */
export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const { workspaceSlug } = params;

  const workspace = await prisma.workspace.findUnique({
    where: { slug: workspaceSlug },
  });

  if (!workspace) {
    notFound();
  }

  // Find #general channel
  let targetChannel = await prisma.channel.findFirst({
    where: {
      workspaceId: workspace.id,
      name: 'general',
      isArchived: false,
    },
  });

  // Fallback to first available channel user is a member of
  if (!targetChannel) {
    targetChannel = await prisma.channel.findFirst({
      where: {
        workspaceId: workspace.id,
        isArchived: false,
        members: {
          some: { userId: session.user.id },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  if (targetChannel) {
    redirect(`/${workspaceSlug}/channel/${targetChannel.id}`);
  }

  // No channels available
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold">No channels yet</h2>
        <p className="mt-2 text-muted-foreground">
          Create a channel to get started.
        </p>
      </div>
    </div>
  );
}
