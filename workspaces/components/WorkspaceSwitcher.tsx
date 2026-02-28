'use client';

/**
 * workspaces/components/WorkspaceSwitcher.tsx
 *
 * Dropdown component at the top of the channel sidebar for switching workspaces.
 * Shows the current workspace name + chevron. Dropdown lists all user workspaces
 * with icons. Click switches workspace. 'Create workspace' option at bottom
 * opens the WorkspaceCreator modal.
 *
 * Usage:
 *   <WorkspaceSwitcher workspaces={workspaces} currentWorkspace={currentWorkspace} />
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Plus, Settings } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/shared/lib/utils';
import type { Workspace } from '@/shared/types';
import { WorkspaceCreator } from './WorkspaceCreator';

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  currentWorkspace: Workspace;
  onSettingsClick?: () => void;
}

export function WorkspaceSwitcher({
  workspaces,
  currentWorkspace,
  onSettingsClick,
}: WorkspaceSwitcherProps) {
  const router = useRouter();
  const [creatorOpen, setCreatorOpen] = useState(false);

  function handleWorkspaceSelect(workspace: Workspace) {
    if (workspace.id !== currentWorkspace.id) {
      router.push(`/${workspace.slug}`);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between px-2 py-6"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="h-8 w-8 rounded-md">
                {currentWorkspace.iconUrl && (
                  <AvatarImage
                    src={currentWorkspace.iconUrl}
                    alt={currentWorkspace.name}
                  />
                )}
                <AvatarFallback className="rounded-md text-xs font-semibold">
                  {getInitials(currentWorkspace.name)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate font-semibold text-sm">
                {currentWorkspace.name}
              </span>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-64" align="start" sideOffset={4}>
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Workspaces
          </DropdownMenuLabel>

          {workspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              onSelect={() => handleWorkspaceSelect(workspace)}
              className="cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Avatar className="h-6 w-6 rounded-md">
                  {workspace.iconUrl && (
                    <AvatarImage
                      src={workspace.iconUrl}
                      alt={workspace.name}
                    />
                  )}
                  <AvatarFallback className="rounded-md text-xs">
                    {getInitials(workspace.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-sm">{workspace.name}</span>
              </div>
              {workspace.id === currentWorkspace.id && (
                <span className="ml-auto text-xs text-muted-foreground">
                  Current
                </span>
              )}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          {onSettingsClick && (
            <DropdownMenuItem
              onSelect={onSettingsClick}
              className="cursor-pointer"
            >
              <Settings className="mr-2 h-4 w-4" />
              <span>Workspace settings</span>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onSelect={() => setCreatorOpen(true)}
            className="cursor-pointer"
          >
            <Plus className="mr-2 h-4 w-4" />
            <span>Create workspace</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <WorkspaceCreator open={creatorOpen} onOpenChange={setCreatorOpen} />
    </>
  );
}
