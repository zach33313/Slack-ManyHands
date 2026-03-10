'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store';
import { cn } from '@/shared/lib/utils';
import { getInitials } from '@/shared/lib/utils';
import { Plus } from 'lucide-react';
import { WorkspaceCreator } from '@/workspaces/components/WorkspaceCreator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Left-most vertical rail showing workspace icons as circular buttons.
 * Active workspace is highlighted. Unread badge on workspaces with unread messages.
 * '+' button at the bottom to create a new workspace.
 */
export function WorkspaceSidebar() {
  const [creatorOpen, setCreatorOpen] = useState(false);
  const router = useRouter();
  const workspaces = useAppStore((s) => s.workspaces);
  const currentWorkspace = useAppStore((s) => s.currentWorkspace);
  const unreadCounts = useAppStore((s) => s.unreadCounts);
  const channels = useAppStore((s) => s.channels);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  // Compute if a workspace has any unread messages
  // (only meaningful for the current workspace in this simple implementation)
  const getWorkspaceUnreadCount = (workspaceId: string): number => {
    if (workspaceId !== currentWorkspace?.id) return 0;
    return channels.reduce((sum, ch) => sum + (ch.unreadCount || 0), 0);
  };

  const handleWorkspaceClick = (slug: string) => {
    router.push(`/${slug}`);
    setSidebarOpen(false);
  };

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex flex-col items-center gap-2 bg-secondary/50 border-r py-3 px-2 w-[68px] shrink-0">
        {/* Workspace icons */}
        <div className="flex-1 flex flex-col items-center gap-2 overflow-y-auto">
          {workspaces.map((workspace) => {
            const isActive = currentWorkspace?.id === workspace.id;
            const unread = getWorkspaceUnreadCount(workspace.id);

            return (
              <Tooltip key={workspace.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleWorkspaceClick(workspace.slug)}
                    className={cn(
                      'relative flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold transition-all',
                      isActive
                        ? 'bg-primary text-primary-foreground rounded-lg shadow-sm'
                        : 'bg-muted hover:bg-muted/80 rounded-xl hover:rounded-lg text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {workspace.iconUrl ? (
                      <img
                        src={workspace.iconUrl}
                        alt={workspace.name}
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      getInitials(workspace.name)
                    )}

                    {/* Unread badge */}
                    {unread > 0 && !isActive && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}

                    {/* Active indicator bar */}
                    {isActive && (
                      <span className="absolute -left-2 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-primary" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {workspace.name}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Create workspace button — hidden in demo mode */}
        {process.env.NEXT_PUBLIC_DEMO_MODE !== 'true' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted hover:bg-muted/80 hover:rounded-lg text-muted-foreground hover:text-foreground transition-all"
                onClick={() => setCreatorOpen(true)}
              >
                <Plus className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Create workspace</TooltipContent>
          </Tooltip>
        )}
      </div>

      <WorkspaceCreator open={creatorOpen} onOpenChange={setCreatorOpen} />
    </TooltipProvider>
  );
}
