import { redirect } from 'next/navigation';
import { auth } from '@/auth/auth';
import { prisma } from '@/shared/lib/prisma';

/**
 * Root page — redirects authenticated users to their first workspace,
 * or to /login if not authenticated.
 */
export default async function RootPage() {
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

  // Find the user's first workspace membership
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id },
    include: { workspace: true },
    orderBy: { joinedAt: 'asc' },
  });

  if (membership) {
    redirect(`/${membership.workspace.slug}`);
  }

  // User has no workspaces — for now redirect to a placeholder
  // The workspace creation flow will be implemented by the workspaces worker
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Welcome to Slack Clone</h1>
        <p className="mt-2 text-muted-foreground">
          You are signed in as {session.user.email}.
        </p>
        <p className="mt-1 text-muted-foreground">
          No workspaces yet — one will be created for you soon.
        </p>
      </div>
    </div>
  );
}
