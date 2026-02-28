'use client';

/**
 * admin/components/AdminDashboard.tsx
 *
 * Main admin page layout with tabs: Members, Analytics, Settings, Audit Log.
 * Only accessible to workspace owners/admins.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, BarChart2, Settings, ScrollText, Shield } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { MemberRole } from '@/shared/types';
import { AnalyticsCharts } from './AnalyticsCharts';
import { MemberManager } from './MemberManager';
import { AuditLogViewer } from './AuditLogViewer';
import type { AnalyticsData, AuditLogEntry } from '../types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemberWithUser {
  id: string;
  userId: string;
  role: MemberRole;
  joinedAt: Date | string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

interface AdminDashboardProps {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  currentUserId: string;
  currentUserRole: MemberRole;
  members: MemberWithUser[];
  analyticsData: AnalyticsData & {
    topUsers?: Array<{ userId: string; name: string; messageCount: number }>;
    totalFiles?: number;
  };
  auditLog: {
    entries: AuditLogEntry[];
    nextCursor: string | null;
  };
}

type AdminTab = 'analytics' | 'members' | 'audit-log' | 'settings';

interface Tab {
  id: AdminTab;
  label: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  { id: 'analytics', label: 'Analytics', icon: <BarChart2 className="w-4 h-4" /> },
  { id: 'members', label: 'Members', icon: <Users className="w-4 h-4" /> },
  { id: 'audit-log', label: 'Audit Log', icon: <ScrollText className="w-4 h-4" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AdminDashboard({
  workspaceId,
  workspaceSlug,
  workspaceName,
  currentUserId,
  currentUserRole,
  members,
  analyticsData,
  auditLog,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('analytics');
  const [deleteWorkspaceOpen, setDeleteWorkspaceOpen] = useState(false);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-lg">{workspaceName} — Admin</h1>
            <p className="text-xs text-muted-foreground">
              {currentUserRole === MemberRole.OWNER ? 'Owner' : 'Admin'} Dashboard
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 mt-4 -mb-4">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors rounded-t-md',
                  isActive
                    ? 'text-foreground bg-background border border-b-background -mb-px'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <AnimatePresence mode="wait">
          {activeTab === 'analytics' && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <AnalyticsCharts data={analyticsData} />
            </motion.div>
          )}

          {activeTab === 'members' && (
            <motion.div
              key="members"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <MemberManager
                workspaceId={workspaceId}
                members={members}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
              />
            </motion.div>
          )}

          {activeTab === 'audit-log' && (
            <motion.div
              key="audit-log"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <AuditLogViewer
                workspaceId={workspaceId}
                initialEntries={auditLog.entries}
                initialNextCursor={auditLog.nextCursor}
              />
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <div className="max-w-lg space-y-6">
                <div>
                  <h2 className="font-semibold mb-1">Workspace Settings</h2>
                  <p className="text-sm text-muted-foreground">
                    Manage workspace configuration.
                  </p>
                </div>

                <div className="border rounded-lg p-4 space-y-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Workspace Name</label>
                    <p className="text-sm text-muted-foreground">
                      Edit workspace name in the workspace settings panel.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium">Role</label>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'text-xs font-medium px-2 py-0.5 rounded-full',
                          currentUserRole === MemberRole.OWNER
                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        )}
                      >
                        {currentUserRole}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-destructive">Danger Zone</h3>
                  <p className="text-xs text-muted-foreground">
                    Destructive actions that cannot be easily undone.
                  </p>
                  {currentUserRole === MemberRole.OWNER && (
                    <>
                      <button
                        onClick={() => setDeleteWorkspaceOpen(true)}
                        className="px-4 py-2 text-sm font-medium text-destructive border border-destructive/30 rounded-md hover:bg-destructive/10 transition-colors"
                      >
                        Delete Workspace
                      </button>

                      {/* Delete workspace confirmation — replaces native confirm() */}
                      <Dialog open={deleteWorkspaceOpen} onOpenChange={setDeleteWorkspaceOpen}>
                        <DialogContent className="max-w-sm">
                          <DialogHeader>
                            <DialogTitle>Delete Workspace</DialogTitle>
                            <DialogDescription>
                              Are you sure you want to delete this workspace? This cannot be undone.
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <button
                              type="button"
                              onClick={() => setDeleteWorkspaceOpen(false)}
                              className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteWorkspaceOpen(false);
                                // Workspace deletion not implemented in this build
                              }}
                              className="inline-flex items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
                            >
                              Delete
                            </button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
