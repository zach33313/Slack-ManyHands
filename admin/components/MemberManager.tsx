'use client';

/**
 * admin/components/MemberManager.tsx
 *
 * Full member list with search, role management, and actions.
 * Admins can change roles, remove members, and invite new ones.
 */

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Search, Crown, Shield, User, UserMinus, ChevronDown,
  Mail, UserPlus, Loader2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { staggerContainer, staggerItem } from '@/shared/lib/animations';
import { MemberRole } from '@/shared/types';
import { cn } from '@/shared/lib/utils';

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

interface MemberManagerProps {
  workspaceId: string;
  members: MemberWithUser[];
  currentUserId: string;
  currentUserRole: MemberRole;
}

const ROLE_ICONS: Record<MemberRole, React.ReactNode> = {
  [MemberRole.OWNER]: <Crown className="w-3 h-3" />,
  [MemberRole.ADMIN]: <Shield className="w-3 h-3" />,
  [MemberRole.MEMBER]: <User className="w-3 h-3" />,
};

const ROLE_COLORS: Record<MemberRole, string> = {
  [MemberRole.OWNER]: 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30',
  [MemberRole.ADMIN]: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
  [MemberRole.MEMBER]: 'text-muted-foreground bg-muted',
};

async function changeRole(workspaceId: string, userId: string, role: MemberRole) {
  const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, role }),
  });
  if (!res.ok) throw new Error('Failed to change role');
}

async function removeMemberApi(workspaceId: string, userId: string) {
  const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error('Failed to remove member');
}

async function inviteMemberApi(workspaceId: string, email: string, role: MemberRole) {
  const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Failed to invite member');
  }
}

// ---------------------------------------------------------------------------
// Invite dialog
// ---------------------------------------------------------------------------

function InviteDialog({
  workspaceId,
  onClose,
  onSuccess,
}: {
  workspaceId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>(MemberRole.MEMBER);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    startTransition(async () => {
      try {
        await inviteMemberApi(workspaceId, email.trim(), role);
        toast.success(`Invited ${email} as ${role}`);
        onSuccess();
        onClose();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to invite';
        setError(msg);
        toast.error(msg);
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-background border rounded-xl p-6 w-full max-w-sm mx-4 shadow-xl"
      >
        <h3 className="font-semibold mb-4">Invite Member</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@example.com"
              className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as MemberRole)}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value={MemberRole.MEMBER}>Member</option>
              <option value={MemberRole.ADMIN}>Admin</option>
            </select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 text-sm border rounded-md hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Invite'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MemberManager({
  workspaceId,
  members: initialMembers,
  currentUserId,
  currentUserRole,
}: MemberManagerProps) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const isAdmin = currentUserRole === MemberRole.ADMIN || currentUserRole === MemberRole.OWNER;
  const isOwner = currentUserRole === MemberRole.OWNER;

  const filteredMembers = search
    ? members.filter(
        (m) =>
          m.user.name?.toLowerCase().includes(search.toLowerCase()) ||
          m.user.email.toLowerCase().includes(search.toLowerCase())
      )
    : members;

  const handleRoleChange = async (userId: string, newRole: MemberRole) => {
    if (!isAdmin) return;
    setPendingUserId(userId);
    try {
      await changeRole(workspaceId, userId, newRole);
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, role: newRole } : m))
      );
      toast.success('Role updated');
      router.refresh();
    } catch (err) {
      toast.error('Failed to change role');
    } finally {
      setPendingUserId(null);
    }
  };

  const handleRemove = async (userId: string, userName: string) => {
    if (!isAdmin) return;
    if (!confirm(`Remove ${userName} from the workspace?`)) return;
    setPendingUserId(userId);
    try {
      await removeMemberApi(workspaceId, userId);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
      toast.success(`${userName} removed`);
    } catch (err) {
      toast.error('Failed to remove member');
    } finally {
      setPendingUserId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search members…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Invite
          </button>
        )}
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground">
        {filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}
        {search && ` matching "${search}"`}
      </p>

      {/* Member list */}
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="space-y-1"
      >
        {filteredMembers.map((member) => {
          const isPending = pendingUserId === member.userId;
          const isSelf = member.userId === currentUserId;

          return (
            <motion.div
              key={member.id}
              variants={staggerItem}
              className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors"
            >
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full overflow-hidden bg-muted flex-shrink-0">
                {member.user.image ? (
                  <img
                    src={member.user.image}
                    alt={member.user.name ?? ''}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-medium text-muted-foreground">
                    {(member.user.name ?? '?').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Name + email */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium truncate">
                    {member.user.name ?? 'Unknown'}
                    {isSelf && <span className="text-muted-foreground font-normal ml-1">(you)</span>}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                  <Mail className="w-3 h-3 flex-shrink-0" />
                  {member.user.email}
                </p>
              </div>

              {/* Role badge */}
              <div
                className={cn(
                  'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                  ROLE_COLORS[member.role]
                )}
              >
                {ROLE_ICONS[member.role]}
                {member.role}
              </div>

              {/* Joined */}
              <span className="text-xs text-muted-foreground hidden lg:block whitespace-nowrap">
                Joined {formatDistanceToNow(new Date(member.joinedAt), { addSuffix: true })}
              </span>

              {/* Actions */}
              {isAdmin && !isSelf && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Role change dropdown */}
                  {isOwner && (
                    <div className="relative group">
                      <button
                        disabled={isPending}
                        className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-muted transition-colors"
                      >
                        Change Role
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      <div className="absolute right-0 top-full mt-1 bg-background border rounded-lg shadow-lg z-10 min-w-[130px] hidden group-hover:block">
                        {[MemberRole.MEMBER, MemberRole.ADMIN, MemberRole.OWNER].map((r) => (
                          <button
                            key={r}
                            onClick={() => handleRoleChange(member.userId, r)}
                            className={cn(
                              'flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-muted transition-colors text-left',
                              member.role === r && 'font-medium text-primary'
                            )}
                          >
                            {ROLE_ICONS[r]}
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Remove button */}
                  <button
                    onClick={() => handleRemove(member.userId, member.user.name ?? 'User')}
                    disabled={isPending}
                    className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="Remove from workspace"
                  >
                    {isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserMinus className="w-4 h-4" />
                    )}
                  </button>
                </div>
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {filteredMembers.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          {search ? `No members match "${search}"` : 'No members found'}
        </div>
      )}

      {/* Invite dialog */}
      {showInvite && (
        <InviteDialog
          workspaceId={workspaceId}
          onClose={() => setShowInvite(false)}
          onSuccess={() => router.refresh()}
        />
      )}
    </div>
  );
}
