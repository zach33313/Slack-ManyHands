import { redirect } from 'next/navigation';
import { auth } from '@/auth/auth';
import { prisma } from '@/shared/lib/prisma';
import { SocketProvider } from '@/components/providers/socket-provider';
import { CallProvider } from '@/calls/components/CallProvider';

/**
 * Authenticated app layout.
 * Checks auth session (redirects to /login if missing).
 * Wraps children in SocketProvider so Socket.IO connects on mount.
 * The flex layout structure is: WorkspaceSidebar + ChannelSidebar + main + RightPanel,
 * which is rendered by the nested [workspaceSlug]/layout.tsx.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  // After DB reseed, the cached JWT may reference a user that no longer exists
  const userExists = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });

  if (!userExists) {
    // Stale JWT — user was deleted (e.g. DB reseed). Redirect to login;
    // the old cookie is overwritten when they sign in again.
    redirect('/login');
  }

  return (
    <SocketProvider>
      <CallProvider>
        <div className="flex h-screen overflow-hidden bg-background">
          {children}
        </div>
      </CallProvider>
    </SocketProvider>
  );
}
