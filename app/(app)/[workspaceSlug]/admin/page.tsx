import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth/auth';
import { prisma } from '@/shared/lib/prisma';
import { AdminDashboard } from '@/admin/components/AdminDashboard';
import { getAnalyticsData, getAuditLog, getTopUsers, getTotalStats } from '@/admin/queries';
import { MemberRole } from '@/shared/types';

interface AdminPageProps {
  params: { workspaceSlug: string };
}

/**
 * Admin page (Server Component).
 * Checks auth and workspace ADMIN+ role before rendering AdminDashboard.
 * Fetches all analytics, members, and audit log data server-side.
 */
export default async function AdminPage({ params }: AdminPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const { workspaceSlug } = params;

  // Fetch workspace
  const workspace = await prisma.workspace.findUnique({
    where: { slug: workspaceSlug },
  });

  if (!workspace) {
    notFound();
  }

  // Check membership and role
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: session.user.id,
      },
    },
  });

  if (!membership) {
    notFound();
  }

  // Only ADMIN and OWNER can access the admin dashboard
  if (membership.role === MemberRole.MEMBER) {
    redirect(`/${workspaceSlug}`);
  }

  const currentUserRole = membership.role as MemberRole;

  // Fetch all admin data in parallel
  const [members, analyticsBase, topUsers, totalStats, auditLog] = await Promise.all([
    // All workspace members with user info
    prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    }),
    // Analytics data
    getAnalyticsData(workspace.id, 30),
    // Top users
    getTopUsers(workspace.id, 10),
    // Total stats including files
    getTotalStats(workspace.id),
    // Audit log
    getAuditLog(workspace.id, undefined, 50),
  ]);

  // Combine analytics data with top users and total files
  const analyticsData = {
    ...analyticsBase,
    topUsers,
    totalFiles: totalStats.totalFiles,
  };

  // Serialize dates for client components
  const serializedMembers = members.map((m) => ({
    id: m.id,
    userId: m.userId,
    role: m.role as MemberRole,
    joinedAt: m.joinedAt,
    user: {
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
    },
  }));

  return (
    <div className="h-full flex flex-col">
      <AdminDashboard
        workspaceId={workspace.id}
        workspaceSlug={workspaceSlug}
        workspaceName={workspace.name}
        currentUserId={session.user.id}
        currentUserRole={currentUserRole}
        members={serializedMembers}
        analyticsData={analyticsData}
        auditLog={auditLog}
      />
    </div>
  );
}

// Metadata
export async function generateMetadata({ params }: AdminPageProps) {
  const workspace = await prisma.workspace.findUnique({
    where: { slug: params.workspaceSlug },
    select: { name: true },
  });
  return {
    title: workspace ? `${workspace.name} Admin` : 'Admin',
  };
}
