'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAppStore } from '@/store';
import { cn } from '@/shared/lib/utils';
import { getInitials } from '@/shared/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Hash,
  Lock,
  ChevronDown,
  ChevronRight,
  Plus,
  Star,
  VolumeX,
  MessageSquare,
  Search,
  X,
  Loader2,
  Settings,
  Check,
} from 'lucide-react';
import { ChannelType } from '@/shared/types';
import type { ChannelWithMeta, UserSummary } from '@/shared/types';
import { SearchModal } from '@/search/components/SearchModal';
import { NotificationBell } from '@/notifications/components/NotificationBell';
import ChannelCreator from '@/channels/components/ChannelCreator';
import { WorkspaceSettings } from '@/workspaces/components/WorkspaceSettings';
import { UserProfileBar } from './UserProfileBar';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { openDM, createGroupDM } from '@/channels/actions';
import type { WorkspaceMember, MemberRole } from '@/shared/types';

/**
 * Channel list sidebar.
 * Shows workspace name header, starred channels, regular channels,
 * and direct messages — each in a collapsible section.
 */
export function ChannelSidebar() {
  const router = useRouter();
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string;
  const channelId = params.channelId as string | undefined;

  const currentWorkspace = useAppStore((s) => s.currentWorkspace);
  const channels = useAppStore((s) => s.channels);
  const starredChannels = useAppStore((s) => s.starredChannels);
  const dmParticipants = useAppStore((s) => s.dmParticipants);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  // Section collapse state
  const [starredOpen, setStarredOpen] = useState(true);
  const [channelsOpen, setChannelsOpen] = useState(true);
  const [dmsOpen, setDmsOpen] = useState(true);

  // Channel creator modal
  const [channelCreatorOpen, setChannelCreatorOpen] = useState(false);

  // Workspace settings dialog
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsMembers, setSettingsMembers] = useState<WorkspaceMember[]>([]);
  const [settingsRole, setSettingsRole] = useState<MemberRole>('MEMBER' as MemberRole);

  // DM user picker
  const [dmPickerOpen, setDmPickerOpen] = useState(false);
  const [dmSearchQuery, setDmSearchQuery] = useState('');
  const [isCreatingDM, setIsCreatingDM] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const dmPickerRef = useRef<HTMLDivElement>(null);
  const dmSearchInputRef = useRef<HTMLInputElement>(null);

  // Separate channels by type
  const { regularChannels, dmChannels, starred } = useMemo(() => {
    const regular: ChannelWithMeta[] = [];
    const dms: ChannelWithMeta[] = [];
    const starredItems: ChannelWithMeta[] = [];

    for (const ch of channels) {
      if (ch.type === ChannelType.DM || ch.type === ChannelType.GROUP_DM) {
        dms.push(ch);
      } else {
        regular.push(ch);
      }

      if (starredChannels.includes(ch.id)) {
        starredItems.push(ch);
      }
    }

    // Sort alphabetically
    regular.sort((a, b) => a.name.localeCompare(b.name));
    dms.sort((a, b) => {
      // Sort DMs by participant name
      const aName = getDMDisplayName(a.id);
      const bName = getDMDisplayName(b.id);
      return aName.localeCompare(bName);
    });

    return { regularChannels: regular, dmChannels: dms, starred: starredItems };
  }, [channels, starredChannels, dmParticipants]);

  function getDMDisplayName(channelIdVal: string): string {
    const participants = dmParticipants[channelIdVal];
    if (participants && participants.length > 0) {
      return participants.map((p) => p.name).join(', ');
    }
    return 'Direct Message';
  }

  function getDMAvatar(channelIdVal: string): UserSummary | null {
    const participants = dmParticipants[channelIdVal];
    if (participants && participants.length === 1) {
      return participants[0];
    }
    return null;
  }

  const handleChannelClick = (ch: ChannelWithMeta) => {
    router.push(`/${workspaceSlug}/channel/${ch.id}`);
    // Close sidebar on mobile after navigation
    setSidebarOpen(false);
  };

  // Fetch workspace members when DM picker opens
  useEffect(() => {
    if (!dmPickerOpen || !currentWorkspace) return;
    let cancelled = false;

    async function fetchMembers() {
      try {
        const res = await fetch(`/api/workspaces/${currentWorkspace!.id}/members`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data.ok && !cancelled) {
          setWorkspaceMembers(data.data ?? []);
        }
      } catch {
        // Silently fail
      }
    }

    fetchMembers();
    return () => { cancelled = true; };
  }, [dmPickerOpen, currentWorkspace]);

  // Fetch workspace members + user role when settings opens
  useEffect(() => {
    if (!settingsOpen || !currentWorkspace) return;
    let cancelled = false;

    async function fetchSettingsData() {
      try {
        const res = await fetch(`/api/workspaces/${currentWorkspace!.id}/members`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data.ok && !cancelled) {
          setSettingsMembers(data.data ?? []);
          const user = useAppStore.getState().user;
          const me = (data.data ?? []).find((m: WorkspaceMember) => m.userId === user?.id);
          if (me) setSettingsRole(me.role);
        }
      } catch {
        // Silently fail
      }
    }

    fetchSettingsData();
    return () => { cancelled = true; };
  }, [settingsOpen, currentWorkspace]);

  // Focus DM search input when picker opens
  useEffect(() => {
    if (dmPickerOpen && dmSearchInputRef.current) {
      dmSearchInputRef.current.focus();
    }
  }, [dmPickerOpen]);

  // Close DM picker on outside click
  useEffect(() => {
    if (!dmPickerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dmPickerRef.current && !dmPickerRef.current.contains(e.target as Node)) {
        setDmPickerOpen(false);
        setDmSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dmPickerOpen]);

  const handleOpenDMPicker = useCallback(() => {
    setDmPickerOpen(true);
    setDmSearchQuery('');
    setSelectedUsers([]);
  }, []);

  const handleStartDM = useCallback(async (targetUserId: string) => {
    if (!currentWorkspace) return;
    setIsCreatingDM(true);
    try {
      await openDM(currentWorkspace.id, targetUserId);
      setDmPickerOpen(false);
      setDmSearchQuery('');
      setSelectedUsers([]);
      router.push(`/${workspaceSlug}/dm/${targetUserId}`);
      router.refresh();
    } catch (err) {
      console.error('Failed to open DM:', err);
    } finally {
      setIsCreatingDM(false);
    }
  }, [currentWorkspace, workspaceSlug, router]);

  const handleToggleUser = useCallback((userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  }, []);

  const handleStartSelectedDM = useCallback(async () => {
    if (!currentWorkspace || selectedUsers.length === 0) return;
    setIsCreatingDM(true);
    try {
      if (selectedUsers.length === 1) {
        // Single user → regular DM
        await openDM(currentWorkspace.id, selectedUsers[0]);
        router.push(`/${workspaceSlug}/dm/${selectedUsers[0]}`);
      } else {
        // Multiple users → group DM
        const channel = await createGroupDM(currentWorkspace.id, selectedUsers);
        router.push(`/${workspaceSlug}/channel/${channel.id}`);
      }
      setDmPickerOpen(false);
      setDmSearchQuery('');
      setSelectedUsers([]);
      router.refresh();
    } catch (err) {
      console.error('Failed to create DM:', err);
    } finally {
      setIsCreatingDM(false);
    }
  }, [currentWorkspace, selectedUsers, workspaceSlug, router]);

  const filteredDMMembers = workspaceMembers.filter((m) => {
    if (!dmSearchQuery) return true;
    const name = (m.user?.name ?? '').toLowerCase();
    return name.includes(dmSearchQuery.toLowerCase());
  });

  return (
    <div className="relative flex flex-col w-[260px] border-r bg-background shrink-0 h-full">
      {/* Workspace name header */}
      <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
        <h2 className="font-bold text-lg truncate">
          {currentWorkspace?.name ?? 'Workspace'}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Workspace settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <NotificationBell />
        </div>
      </div>

      {/* Search — Cmd+K global handler */}
      <div className="px-3 pt-3 pb-1 shrink-0">
        {currentWorkspace && (
          <SearchModal
            workspaceId={currentWorkspace.id}
            workspaceSlug={workspaceSlug}
          />
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2">
          {/* Starred channels section */}
          {starred.length > 0 && (
            <SidebarSection
              label="Starred"
              icon={<Star className="h-3 w-3" />}
              isOpen={starredOpen}
              onToggle={() => setStarredOpen(!starredOpen)}
            >
              {starred.map((ch) => (
                <ChannelItem
                  key={`starred-${ch.id}`}
                  channel={ch}
                  isActive={ch.id === channelId}
                  onClick={() => handleChannelClick(ch)}
                  dmDisplayName={
                    ch.type === ChannelType.DM
                      ? getDMDisplayName(ch.id)
                      : undefined
                  }
                />
              ))}
            </SidebarSection>
          )}

          {/* Channels section */}
          <SidebarSection
            label="Channels"
            isOpen={channelsOpen}
            onToggle={() => setChannelsOpen(!channelsOpen)}
            action={
              process.env.NEXT_PUBLIC_DEMO_MODE !== 'true' ? (
                <button
                  className="opacity-0 group-hover/section:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
                  title="Create channel"
                  onClick={() => setChannelCreatorOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              ) : undefined
            }
          >
            {regularChannels.map((ch) => (
              <ChannelItem
                key={ch.id}
                channel={ch}
                isActive={ch.id === channelId}
                onClick={() => handleChannelClick(ch)}
              />
            ))}
          </SidebarSection>

          <Separator className="my-2" />

          {/* Direct Messages section */}
          <SidebarSection
            label="Direct Messages"
            isOpen={dmsOpen}
            onToggle={() => setDmsOpen(!dmsOpen)}
            action={
              <button
                className="opacity-0 group-hover/section:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
                title="Create DM"
                onClick={handleOpenDMPicker}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            }
          >
            {dmChannels.map((ch) => {
              const participant = getDMAvatar(ch.id);
              const displayName = getDMDisplayName(ch.id);
              return (
                <DMItem
                  key={ch.id}
                  channel={ch}
                  participant={participant}
                  displayName={displayName}
                  isActive={ch.id === channelId}
                  onClick={() => handleChannelClick(ch)}
                />
              );
            })}
          </SidebarSection>
        </div>
      </ScrollArea>

      {/* User Profile Bar */}
      <UserProfileBar />

      {/* Channel Creator Modal */}
      {currentWorkspace && (
        <ChannelCreator
          workspaceId={currentWorkspace.id}
          workspaceSlug={workspaceSlug}
          isOpen={channelCreatorOpen}
          onClose={() => setChannelCreatorOpen(false)}
        />
      )}

      {/* DM Picker Dropdown (supports multi-select for group DMs) */}
      {dmPickerOpen && (
        <div
          ref={dmPickerRef}
          className="absolute left-2 right-2 bottom-14 z-50 rounded-lg border bg-background shadow-xl"
        >
          <div className="p-3">
            <div className="flex items-center gap-2 rounded-md border px-2 py-1.5 mb-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                ref={dmSearchInputRef}
                type="text"
                value={dmSearchQuery}
                onChange={(e) => setDmSearchQuery(e.target.value)}
                placeholder="Find people..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {dmSearchQuery && (
                <button onClick={() => setDmSearchQuery('')}>
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {isCreatingDM && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {!isCreatingDM && filteredDMMembers.length === 0 && (
                <p className="text-xs text-muted-foreground py-2 text-center">
                  No members found
                </p>
              )}
              {!isCreatingDM &&
                filteredDMMembers.map((member) => {
                  const isSelected = selectedUsers.includes(member.userId);
                  return (
                    <button
                      key={member.userId}
                      onClick={() => handleToggleUser(member.userId)}
                      className={cn(
                        'flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm hover:bg-muted text-left',
                        isSelected && 'bg-primary/10'
                      )}
                    >
                      <div className={cn(
                        'h-4 w-4 rounded border flex items-center justify-center shrink-0',
                        isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30'
                      )}>
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                      <div className="h-5 w-5 rounded-md bg-muted flex items-center justify-center text-[9px] font-medium shrink-0">
                        {member.user?.image ? (
                          <img
                            src={member.user.image}
                            alt={member.user?.name ?? ''}
                            className="h-5 w-5 rounded-md object-cover"
                          />
                        ) : (
                          getInitials(member.user?.name)
                        )}
                      </div>
                      <span className="truncate">{member.user?.name ?? 'Unknown'}</span>
                    </button>
                  );
                })}
            </div>
            {/* Action button */}
            {selectedUsers.length > 0 && (
              <div className="mt-2 pt-2 border-t">
                <button
                  onClick={handleStartSelectedDM}
                  disabled={isCreatingDM}
                  className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {selectedUsers.length === 1
                    ? 'Start DM'
                    : `Start Group DM (${selectedUsers.length} people)`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Workspace Settings Dialog */}
      {currentWorkspace && (
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
            <DialogTitle className="sr-only">Workspace Settings</DialogTitle>
            <WorkspaceSettings
              workspace={currentWorkspace}
              members={settingsMembers}
              currentUserRole={settingsRole}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// --- Sub-components ---

interface SidebarSectionProps {
  label: string;
  icon?: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}

function SidebarSection({
  label,
  icon,
  isOpen,
  onToggle,
  action,
  children,
}: SidebarSectionProps) {
  return (
    <div className="group/section">
      <div className="flex items-center justify-between px-4 py-1">
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wide"
        >
          {isOpen ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          {icon}
          {label}
        </button>
        {action}
      </div>
      {isOpen && <div className="mt-0.5">{children}</div>}
    </div>
  );
}

interface ChannelItemProps {
  channel: ChannelWithMeta;
  isActive: boolean;
  onClick: () => void;
  dmDisplayName?: string;
}

function ChannelItem({
  channel,
  isActive,
  onClick,
  dmDisplayName,
}: ChannelItemProps) {
  const hasUnread = channel.unreadCount > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 w-full rounded-md px-4 py-1.5 text-sm transition-colors',
        isActive
          ? 'bg-primary/10 text-primary font-semibold'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        hasUnread && !isActive && 'text-foreground font-semibold'
      )}
    >
      {channel.type === ChannelType.PRIVATE ? (
        <Lock className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <Hash className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="truncate">
        {dmDisplayName ?? channel.name}
      </span>

      {/* Unread count badge */}
      {hasUnread && (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1.5 text-[10px] font-bold text-primary">
          {channel.unreadCount > 99 ? '99+' : channel.unreadCount}
        </span>
      )}
    </button>
  );
}

interface DMItemProps {
  channel: ChannelWithMeta;
  participant: UserSummary | null;
  displayName: string;
  isActive: boolean;
  onClick: () => void;
}

function DMItem({
  channel,
  participant,
  displayName,
  isActive,
  onClick,
}: DMItemProps) {
  const hasUnread = channel.unreadCount > 0;
  const presenceMap = useAppStore((s) => s.presenceMap);
  const isOnline =
    participant && presenceMap[participant.id] === 'online';

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 w-full rounded-md px-4 py-1.5 text-sm transition-colors',
        isActive
          ? 'bg-primary/10 text-primary font-semibold'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        hasUnread && !isActive && 'text-foreground font-semibold'
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="h-5 w-5 rounded-md bg-muted flex items-center justify-center text-[9px] font-medium">
          {participant?.image ? (
            <img
              src={participant.image}
              alt={displayName}
              className="h-5 w-5 rounded-md object-cover"
            />
          ) : (
            getInitials(displayName)
          )}
        </div>
        {/* Presence dot */}
        {participant && (
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background',
              isOnline ? 'bg-green-500' : 'bg-muted-foreground/40'
            )}
          />
        )}
      </div>

      <span className="truncate">{displayName}</span>

      {/* Unread count badge */}
      {hasUnread && (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1.5 text-[10px] font-bold text-primary">
          {channel.unreadCount > 99 ? '99+' : channel.unreadCount}
        </span>
      )}
    </button>
  );
}
