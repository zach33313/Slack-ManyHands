'use client';

/**
 * channels/components/DirectMessageList.tsx
 *
 * Sidebar section for DM and group DM channels.
 *
 * Features:
 *   - Lists all DM/GROUP_DM channels the user is in
 *   - Shows other user's avatar + name (or group names)
 *   - Bold if unread, badge count
 *   - '+' button opens a user picker to start a new DM
 *   - Click navigates to the DM view
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  MessageSquare,
  X,
  Loader2,
  Search,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { DMChannelItem } from '@/channels/types';
import type { UserSummary } from '@/shared/types';
import { openDM } from '@/channels/actions';

interface DirectMessageListProps {
  dmChannels: DMChannelItem[];
  workspaceId: string;
  workspaceSlug: string;
  /** List of workspace members for the "new DM" user picker */
  workspaceMembers?: UserSummary[];
  currentUserId: string;
}

export default function DirectMessageList({
  dmChannels,
  workspaceId,
  workspaceSlug,
  workspaceMembers = [],
  currentUserId,
}: DirectMessageListProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingDM, setIsCreatingDM] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close picker on click outside
  useEffect(() => {
    if (!showUserPicker) return;
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowUserPicker(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showUserPicker]);

  // Focus search input when picker opens
  useEffect(() => {
    if (showUserPicker && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showUserPicker]);

  const handleOpenDM = useCallback(
    async (targetUserId: string) => {
      setIsCreatingDM(true);
      try {
        const channel = await openDM(workspaceId, targetUserId);
        setShowUserPicker(false);
        setSearchQuery('');
        router.push(`/${workspaceSlug}/dm/${targetUserId}`);
        router.refresh();
      } catch (err) {
        console.error('Failed to open DM:', err);
      } finally {
        setIsCreatingDM(false);
      }
    },
    [workspaceId, workspaceSlug, router]
  );

  const handleDMClick = useCallback(
    (dmChannel: DMChannelItem) => {
      // For 1:1 DMs, navigate to /dm/[userId]
      if (dmChannel.participants.length === 1) {
        router.push(
          `/${workspaceSlug}/dm/${dmChannel.participants[0].id}`
        );
      } else {
        // For group DMs, navigate to /channel/[channelId]
        router.push(
          `/${workspaceSlug}/channel/${dmChannel.id}`
        );
      }
    },
    [router, workspaceSlug]
  );

  // Filter workspace members for the user picker (exclude self and existing DM partners)
  const existingDMPartnerIds = new Set(
    dmChannels
      .filter((dm) => dm.participants.length === 1)
      .map((dm) => dm.participants[0].id)
  );

  const filteredMembers = workspaceMembers
    .filter((m) => m.id !== currentUserId)
    .filter((m) => {
      if (!searchQuery) return true;
      return m.name.toLowerCase().includes(searchQuery.toLowerCase());
    });

  return (
    <div className="relative flex flex-col">
      {/* Section header */}
      <div className="flex items-center justify-between px-3 py-1">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground hover:text-foreground"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          Direct Messages
        </button>
        <button
          onClick={() => setShowUserPicker(true)}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="New direct message"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* DM list */}
      {expanded && (
        <div className="mt-0.5">
          {dmChannels.map((dm) => (
            <DMItem
              key={dm.id}
              dm={dm}
              onClick={() => handleDMClick(dm)}
            />
          ))}

          {dmChannels.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No direct messages yet
            </div>
          )}
        </div>
      )}

      {/* User picker popup */}
      {showUserPicker && (
        <div
          ref={pickerRef}
          className="absolute left-2 right-2 top-8 z-50 rounded-md border bg-popover shadow-lg"
        >
          {/* Search input */}
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find a user..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              onClick={() => {
                setShowUserPicker(false);
                setSearchQuery('');
              }}
              className="rounded p-0.5 hover:bg-accent"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* User list */}
          <div className="max-h-60 overflow-y-auto py-1">
            {isCreatingDM && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!isCreatingDM && filteredMembers.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                {searchQuery ? 'No users found' : 'No workspace members'}
              </div>
            )}

            {!isCreatingDM &&
              filteredMembers.map((member) => {
                const hasExistingDM = existingDMPartnerIds.has(member.id);
                return (
                  <button
                    key={member.id}
                    onClick={() => handleOpenDM(member.id)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-accent"
                  >
                    {/* Avatar */}
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {member.image ? (
                        <img
                          src={member.image}
                          alt={member.name}
                          className="h-7 w-7 rounded-full object-cover"
                        />
                      ) : (
                        member.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <span className="truncate">{member.name}</span>
                    {hasExistingDM && (
                      <MessageSquare className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Individual DM channel item in the sidebar.
 */
function DMItem({
  dm,
  onClick,
}: {
  dm: DMChannelItem;
  onClick: () => void;
}) {
  const hasUnread = dm.unreadCount > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-3 py-1 text-sm',
        'hover:bg-accent/50',
        hasUnread && 'font-semibold text-foreground'
      )}
    >
      {/* Avatar */}
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
        {dm.displayImage ? (
          <img
            src={dm.displayImage}
            alt={dm.displayName}
            className="h-5 w-5 rounded-full object-cover"
          />
        ) : (
          dm.displayName.charAt(0).toUpperCase()
        )}
      </div>

      {/* Name */}
      <span className="truncate">{dm.displayName}</span>

      {/* Unread badge */}
      {hasUnread && (
        <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground">
          {dm.unreadCount > 99 ? '99+' : dm.unreadCount}
        </span>
      )}
    </button>
  );
}
