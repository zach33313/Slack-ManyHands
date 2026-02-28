/**
 * members/components/MemberList.tsx
 *
 * Right panel member list showing all channel or workspace members
 * grouped by online status (Online, Away, Offline).
 *
 * Features:
 *   - Search/filter input at the top
 *   - Members grouped by presence status
 *   - Each item shows UserAvatar + display name + role badge + status text
 *   - Click opens MemberProfileCard
 *
 * Usage:
 *   <MemberList members={members} />
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/shared/lib/utils';
import { PresenceStatus, MemberRole } from '@/shared/types';
import { usePresenceStore } from '@/presence/store';
import { UserAvatar } from './UserAvatar';
import { MemberProfileCard } from './MemberProfileCard';
import type { MemberWithUser } from '../types';

const ROLE_BADGE: Record<string, string | null> = {
  [MemberRole.OWNER]: 'Owner',
  [MemberRole.ADMIN]: 'Admin',
  [MemberRole.MEMBER]: null,
};

const STATUS_GROUP_ORDER: PresenceStatus[] = [
  PresenceStatus.ONLINE,
  PresenceStatus.AWAY,
  PresenceStatus.OFFLINE,
];

const STATUS_LABELS: Record<PresenceStatus, string> = {
  [PresenceStatus.ONLINE]: 'Online',
  [PresenceStatus.AWAY]: 'Away',
  [PresenceStatus.OFFLINE]: 'Offline',
};

interface MemberListProps {
  /** Members to display */
  members: MemberWithUser[];
  /** Optional callback when "Message" is clicked on a profile card */
  onMessageClick?: (userId: string) => void;
  /** Additional CSS classes */
  className?: string;
}

export function MemberList({
  members,
  onMessageClick,
  className,
}: MemberListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState<MemberWithUser | null>(
    null
  );
  const [profileOpen, setProfileOpen] = useState(false);

  const presenceMap = usePresenceStore((s) => s.presenceMap);

  // Filter members by search query
  const filteredMembers = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return members;

    return members.filter((m) => {
      const name = (m.user.name || '').toLowerCase();
      const email = m.user.email.toLowerCase();
      return name.includes(query) || email.includes(query);
    });
  }, [members, searchQuery]);

  // Group filtered members by presence status
  const groupedMembers = useMemo(() => {
    const groups: Record<PresenceStatus, MemberWithUser[]> = {
      [PresenceStatus.ONLINE]: [],
      [PresenceStatus.AWAY]: [],
      [PresenceStatus.OFFLINE]: [],
    };

    for (const member of filteredMembers) {
      const status =
        presenceMap[member.userId] ?? PresenceStatus.OFFLINE;
      groups[status].push(member);
    }

    return groups;
  }, [filteredMembers, presenceMap]);

  const handleMemberClick = useCallback((member: MemberWithUser) => {
    setSelectedMember(member);
    setProfileOpen(true);
  }, []);

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Search input */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Find members"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* Member groups */}
      <ScrollArea className="flex-1">
        <div className="px-2 pb-4">
          {STATUS_GROUP_ORDER.map((status) => {
            const groupMembers = groupedMembers[status];
            if (groupMembers.length === 0) return null;

            return (
              <div key={status} className="mt-3 first:mt-1">
                <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {STATUS_LABELS[status]} — {groupMembers.length}
                </h3>
                <ul className="space-y-0.5">
                  {groupMembers.map((member) => (
                    <MemberListItem
                      key={member.id}
                      member={member}
                      onClick={() => handleMemberClick(member)}
                    />
                  ))}
                </ul>
              </div>
            );
          })}

          {filteredMembers.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              No members found
            </p>
          )}
        </div>
      </ScrollArea>

      {/* Profile card dialog */}
      {selectedMember && (
        <MemberProfileCard
          member={selectedMember}
          open={profileOpen}
          onOpenChange={setProfileOpen}
          onMessageClick={onMessageClick}
        />
      )}
    </div>
  );
}

/**
 * Single member list item row.
 */
function MemberListItem({
  member,
  onClick,
}: {
  member: MemberWithUser;
  onClick: () => void;
}) {
  const displayName = member.user.name || member.user.email;
  const roleBadge = ROLE_BADGE[member.role];

  return (
    <li>
      <button
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent transition-colors"
        onClick={onClick}
      >
        <UserAvatar user={member.user} size="sm" showPresence />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{displayName}</span>
            {roleBadge && (
              <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
                {roleBadge}
              </span>
            )}
          </div>
          {(member.user.statusEmoji || member.user.statusText) && (
            <p className="truncate text-xs text-muted-foreground">
              {member.user.statusEmoji && (
                <span className="mr-1">{member.user.statusEmoji}</span>
              )}
              {member.user.statusText}
            </p>
          )}
        </div>
      </button>
    </li>
  );
}
