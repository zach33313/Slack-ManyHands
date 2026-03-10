'use client';

/**
 * channels/components/ChannelHeader.tsx
 *
 * Header bar displayed above the message list in a channel.
 *
 * Shows:
 *   - # + channel name
 *   - Topic text (editable inline for admins)
 *   - Member count (clickable to open member list in right panel)
 *   - Star button
 *   - Search icon
 *   - Settings gear icon
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Hash,
  Lock,
  Star,
  Search,
  Settings,
  Users,
  ChevronDown,
  Phone,
  Video,
  Headphones,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { ChannelType } from '@/shared/types';
import { updateChannel } from '@/channels/actions';
import { useCallContext } from '@/calls/components/CallProvider';
import { useCallStore } from '@/calls/store';
import { useAppStore } from '@/store';

interface ChannelHeaderProps {
  channelId: string;
  name: string;
  type: ChannelType;
  description: string | null;
  memberCount: number;
  isStarred: boolean;
  /** Whether the current user can edit the topic */
  canEdit?: boolean;
  onToggleStar: () => void;
  onOpenMembers?: () => void;
  onOpenSettings?: () => void;
  onOpenSearch?: () => void;
}

export default function ChannelHeader({
  channelId,
  name,
  type,
  description,
  memberCount,
  isStarred,
  canEdit = false,
  onToggleStar,
  onOpenMembers,
  onOpenSettings,
  onOpenSearch,
}: ChannelHeaderProps) {
  const [isEditingTopic, setIsEditingTopic] = useState(false);
  const [topicValue, setTopicValue] = useState(description ?? '');
  const topicInputRef = useRef<HTMLInputElement>(null);

  // Update local state when prop changes
  useEffect(() => {
    setTopicValue(description ?? '');
  }, [description]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditingTopic && topicInputRef.current) {
      topicInputRef.current.focus();
      topicInputRef.current.select();
    }
  }, [isEditingTopic]);

  const handleTopicSave = useCallback(async () => {
    setIsEditingTopic(false);
    const trimmed = topicValue.trim();
    if (trimmed === (description ?? '')) return;

    try {
      await updateChannel(channelId, { topic: trimmed });
    } catch (err) {
      console.error('Failed to update topic:', err);
      setTopicValue(description ?? '');
    }
  }, [channelId, topicValue, description]);

  const handleTopicKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleTopicSave();
      } else if (e.key === 'Escape') {
        setTopicValue(description ?? '');
        setIsEditingTopic(false);
      }
    },
    [handleTopicSave, description]
  );

  const ChannelIcon = type === ChannelType.PRIVATE ? Lock : Hash;

  return (
    <div className="flex h-12 items-center justify-between border-b px-4">
      {/* Left side: channel info */}
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex items-center gap-1">
          <ChannelIcon className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-lg font-bold">{name}</h1>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Topic */}
        <div className="hidden min-w-0 items-center gap-1 border-l pl-3 md:flex">
          {isEditingTopic ? (
            <input
              ref={topicInputRef}
              value={topicValue}
              onChange={(e) => setTopicValue(e.target.value)}
              onBlur={handleTopicSave}
              onKeyDown={handleTopicKeyDown}
              className="min-w-[200px] bg-transparent text-sm text-muted-foreground outline-none focus:text-foreground"
              placeholder="Add a topic"
              maxLength={250}
            />
          ) : (
            <button
              onClick={() => {
                if (canEdit) {
                  setIsEditingTopic(true);
                }
              }}
              className={cn(
                'truncate text-sm text-muted-foreground',
                canEdit && 'cursor-pointer hover:text-foreground'
              )}
              title={canEdit ? 'Click to edit topic' : description ?? undefined}
            >
              {description || (canEdit ? 'Add a topic' : '')}
            </button>
          )}
        </div>
      </div>

      {/* Right side: action buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleStar}
          className="rounded p-1.5 hover:bg-accent"
          title={isStarred ? 'Unstar channel' : 'Star channel'}
        >
          <Star
            className={cn(
              'h-4 w-4',
              isStarred
                ? 'fill-yellow-500 text-yellow-500'
                : 'text-muted-foreground'
            )}
          />
        </button>

        {onOpenMembers && (
          <button
            onClick={onOpenMembers}
            className="flex items-center gap-1 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            title="View members"
          >
            <Users className="h-4 w-4" />
            <span>{memberCount}</span>
          </button>
        )}

        {onOpenSearch && (
          <button
            onClick={onOpenSearch}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Search in channel"
          >
            <Search className="h-4 w-4" />
          </button>
        )}

        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Channel settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
