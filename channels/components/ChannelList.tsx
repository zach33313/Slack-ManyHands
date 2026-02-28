'use client';

/**
 * channels/components/ChannelList.tsx
 *
 * Sidebar section showing workspace channels.
 * Grouped into 'Starred' and 'Channels' collapsible sections.
 *
 * Features:
 *   - # icon + channel name for each channel
 *   - Bold text and badge for unread channels
 *   - Mute icon for muted channels
 *   - Click navigates to channel
 *   - Right-click context menu: star/unstar, mute/unmute, leave channel
 *   - Starred channels stored in localStorage
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Hash,
  Lock,
  ChevronDown,
  ChevronRight,
  Star,
  BellOff,
  LogOut,
  Plus,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { ChannelType } from '@/shared/types';
import type { ChannelListItem } from '@/channels/types';
import { leaveChannel } from '@/channels/actions';

interface ChannelListProps {
  channels: ChannelListItem[];
  workspaceSlug: string;
  onCreateChannel?: () => void;
}

/** localStorage key for starred channels */
function starredKey(workspaceId: string): string {
  return `starred-channels-${workspaceId}`;
}

/** Get starred channel IDs from localStorage */
function getStarredChannels(workspaceId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(starredKey(workspaceId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

/** Save starred channel IDs to localStorage */
function saveStarredChannels(workspaceId: string, ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(starredKey(workspaceId), JSON.stringify([...ids]));
}

export default function ChannelList({
  channels,
  workspaceSlug,
  onCreateChannel,
}: ChannelListProps) {
  const router = useRouter();
  const params = useParams();
  const activeChannelId = params?.channelId as string | undefined;

  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [channelsExpanded, setChannelsExpanded] = useState(true);
  const [starredExpanded, setStarredExpanded] = useState(true);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    channelId: string;
  } | null>(null);

  // Load starred channels from localStorage on mount
  useEffect(() => {
    if (channels.length > 0) {
      setStarred(getStarredChannels(channels[0].workspaceId));
    }
  }, [channels]);

  // Close context menu on click anywhere
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu]);

  const toggleStar = useCallback(
    (channelId: string) => {
      setStarred((prev) => {
        const next = new Set(prev);
        if (next.has(channelId)) {
          next.delete(channelId);
        } else {
          next.add(channelId);
        }
        if (channels.length > 0) {
          saveStarredChannels(channels[0].workspaceId, next);
        }
        return next;
      });
    },
    [channels]
  );

  const handleLeave = useCallback(
    async (channelId: string) => {
      try {
        await leaveChannel(channelId);
        router.refresh();
      } catch (err) {
        console.error('Failed to leave channel:', err);
      }
    },
    [router]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, channelId: string) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, channelId });
    },
    []
  );

  const handleChannelClick = useCallback(
    (channelId: string) => {
      router.push(`/${workspaceSlug}/channel/${channelId}`);
    },
    [router, workspaceSlug]
  );

  // Partition channels
  const starredChannels = channels.filter((ch) => starred.has(ch.id));
  const regularChannels = channels.filter((ch) => !starred.has(ch.id));

  const contextChannel = contextMenu
    ? channels.find((ch) => ch.id === contextMenu.channelId)
    : null;

  return (
    <div className="flex flex-col">
      {/* Starred section */}
      {starredChannels.length > 0 && (
        <div className="mb-1">
          <button
            onClick={() => setStarredExpanded(!starredExpanded)}
            className="flex w-full items-center gap-1 px-3 py-1 text-xs font-semibold uppercase text-muted-foreground hover:text-foreground"
          >
            {starredExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Starred
          </button>

          {starredExpanded && (
            <div className="mt-0.5">
              {starredChannels.map((channel) => (
                <ChannelItem
                  key={channel.id}
                  channel={channel}
                  isActive={channel.id === activeChannelId}
                  isStarred={true}
                  onClick={() => handleChannelClick(channel.id)}
                  onContextMenu={(e) => handleContextMenu(e, channel.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Channels section */}
      <div>
        <div className="flex items-center justify-between px-3 py-1">
          <button
            onClick={() => setChannelsExpanded(!channelsExpanded)}
            className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground hover:text-foreground"
          >
            {channelsExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Channels
          </button>
          {onCreateChannel && (
            <button
              onClick={onCreateChannel}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Create channel"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {channelsExpanded && (
          <div className="mt-0.5">
            {regularChannels.map((channel) => (
              <ChannelItem
                key={channel.id}
                channel={channel}
                isActive={channel.id === activeChannelId}
                isStarred={false}
                onClick={() => handleChannelClick(channel.id)}
                onContextMenu={(e) => handleContextMenu(e, channel.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && contextChannel && (
        <div
          className="fixed z-50 min-w-[160px] rounded-md border bg-popover py-1 shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              toggleStar(contextMenu.channelId);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
          >
            <Star
              className={cn(
                'h-4 w-4',
                starred.has(contextMenu.channelId) && 'fill-yellow-500 text-yellow-500'
              )}
            />
            {starred.has(contextMenu.channelId) ? 'Unstar' : 'Star'} channel
          </button>

          <button
            onClick={() => {
              // Mute/unmute would update notifyPref via an API call
              // For now, this is a visual indicator
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
          >
            <BellOff className="h-4 w-4" />
            {contextChannel.isMuted ? 'Unmute' : 'Mute'} channel
          </button>

          <div className="my-1 border-t" />

          <button
            onClick={() => {
              handleLeave(contextMenu.channelId);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-accent"
          >
            <LogOut className="h-4 w-4" />
            Leave channel
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Individual channel item in the sidebar.
 */
function ChannelItem({
  channel,
  isActive,
  isStarred,
  onClick,
  onContextMenu,
}: {
  channel: ChannelListItem;
  isActive: boolean;
  isStarred: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const hasUnread = channel.unreadCount > 0;

  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-3 py-1 text-sm',
        'hover:bg-accent/50',
        isActive && 'bg-accent text-accent-foreground',
        hasUnread && !isActive && 'font-semibold text-foreground'
      )}
    >
      {/* Channel icon */}
      {channel.type === ChannelType.PRIVATE ? (
        <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
      ) : (
        <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}

      {/* Channel name */}
      <span className="truncate">{channel.name}</span>

      {/* Right side indicators */}
      <div className="ml-auto flex items-center gap-1">
        {channel.isMuted && (
          <BellOff className="h-3 w-3 text-muted-foreground" />
        )}
        {hasUnread && !channel.isMuted && (
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground">
            {channel.unreadCount > 99 ? '99+' : channel.unreadCount}
          </span>
        )}
      </div>
    </button>
  );
}
