'use client';

/**
 * channels/components/ChannelSettings.tsx
 *
 * Settings drawer/modal for a channel.
 *
 * Features:
 *   - Edit channel name, description, topic
 *   - Member list with remove buttons (for channel creator/admins)
 *   - Archive channel button
 *   - Leave channel button
 */

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Hash,
  Lock,
  Loader2,
  UserMinus,
  Archive,
  LogOut,
  Users,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { channelSlug } from '@/shared/lib/utils';
import { ChannelType } from '@/shared/types';
import type { ChannelMemberWithUser } from '@/channels/types';
import {
  updateChannel,
  archiveChannel,
  leaveChannel,
  removeChannelMember,
} from '@/channels/actions';

interface ChannelSettingsProps {
  channelId: string;
  name: string;
  type: ChannelType;
  description: string | null;
  createdById: string;
  currentUserId: string;
  members: ChannelMemberWithUser[];
  isOpen: boolean;
  onClose: () => void;
}

export default function ChannelSettings({
  channelId,
  name,
  type,
  description,
  createdById,
  currentUserId,
  members,
  isOpen,
  onClose,
}: ChannelSettingsProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'about' | 'members'>('about');

  // Edit state
  const [editName, setEditName] = useState(name);
  const [editDescription, setEditDescription] = useState(description ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const isCreator = currentUserId === createdById;
  const isDM = type === ChannelType.DM;

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setEditName(name);
      setEditDescription(description ?? '');
      setError(null);
      setActiveTab('about');
    }
  }, [isOpen, name, description]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);

    try {
      const updates: Record<string, string | undefined> = {};
      const newSlug = channelSlug(editName);

      if (newSlug !== name) {
        updates.name = newSlug;
      }
      if (editDescription.trim() !== (description ?? '')) {
        updates.description = editDescription.trim();
      }

      if (Object.keys(updates).length > 0) {
        await updateChannel(channelId, updates);
        router.refresh();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update channel'
      );
    } finally {
      setIsSaving(false);
    }
  }, [channelId, editName, editDescription, name, description, router]);

  const handleArchive = useCallback(async () => {
    if (!confirm('Are you sure you want to archive this channel? Members will no longer be able to post messages.')) {
      return;
    }

    setIsArchiving(true);
    setError(null);

    try {
      await archiveChannel(channelId);
      onClose();
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to archive channel'
      );
    } finally {
      setIsArchiving(false);
    }
  }, [channelId, onClose, router]);

  const handleLeave = useCallback(async () => {
    if (!confirm('Are you sure you want to leave this channel?')) return;

    setIsLeaving(true);
    setError(null);

    try {
      await leaveChannel(channelId);
      onClose();
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to leave channel'
      );
    } finally {
      setIsLeaving(false);
    }
  }, [channelId, onClose, router]);

  const handleRemoveMember = useCallback(
    async (userId: string) => {
      if (!confirm('Remove this member from the channel?')) return;

      setRemovingUserId(userId);
      try {
        await removeChannelMember(channelId, userId);
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to remove member'
        );
      } finally {
        setRemovingUserId(null);
      }
    },
    [channelId, router]
  );

  if (!isOpen) return null;

  const ChannelIcon = type === ChannelType.PRIVATE ? Lock : Hash;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <ChannelIcon className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">{name}</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('about')}
            className={cn(
              'flex-1 px-4 py-2 text-sm font-medium',
              activeTab === 'about'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            About
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={cn(
              'flex-1 px-4 py-2 text-sm font-medium',
              activeTab === 'members'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Members ({members.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'about' && (
            <div className="space-y-4">
              {/* Channel name */}
              {!isDM && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Channel name
                  </label>
                  <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                    <ChannelIcon className="h-4 w-4 text-muted-foreground" />
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 bg-transparent text-sm outline-none"
                      maxLength={80}
                    />
                  </div>
                </div>
              )}

              {/* Description / topic */}
              {!isDM && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Description
                  </label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full resize-none rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    rows={3}
                    maxLength={250}
                    placeholder="What's this channel about?"
                  />
                </div>
              )}

              {/* Save button */}
              {!isDM && (
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Changes
                </button>
              )}

              {/* Error */}
              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* Divider */}
              <div className="border-t pt-4" />

              {/* Leave channel */}
              {!isDM && (
                <button
                  onClick={handleLeave}
                  disabled={isLeaving}
                  className="flex w-full items-center gap-2 rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {isLeaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  Leave channel
                </button>
              )}

              {/* Archive channel (creator/admin only) */}
              {!isDM && isCreator && (
                <button
                  onClick={handleArchive}
                  disabled={isArchiving}
                  className="flex w-full items-center gap-2 rounded-md border border-destructive/30 px-4 py-2 text-sm text-destructive hover:bg-destructive/10"
                >
                  {isArchiving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Archive className="h-4 w-4" />
                  )}
                  Archive channel
                </button>
              )}
            </div>
          )}

          {activeTab === 'members' && (
            <div className="space-y-1">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-accent/50"
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
                      {member.user.image ? (
                        <img
                          src={member.user.image}
                          alt={member.user.name}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        member.user.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium">
                        {member.user.name}
                        {member.userId === createdById && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (creator)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Remove button (only for creator, and not for themselves) */}
                  {isCreator && member.userId !== currentUserId && (
                    <button
                      onClick={() => handleRemoveMember(member.userId)}
                      disabled={removingUserId === member.userId}
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                      title="Remove member"
                    >
                      {removingUserId === member.userId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserMinus className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
              ))}

              {members.length === 0 && (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Users className="h-5 w-5" />
                  No members found
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
