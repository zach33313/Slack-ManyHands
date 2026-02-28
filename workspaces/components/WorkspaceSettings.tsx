'use client';

/**
 * workspaces/components/WorkspaceSettings.tsx
 *
 * Settings panel for workspace management.
 * Three tabs:
 *   - General: edit name, icon URL, description
 *   - Members: list members with role badges, role change dropdown for OWNER, remove for ADMIN+
 *   - Invites: email input + role selector + invite button
 *
 * Only accessible to ADMIN+ roles.
 *
 * Usage:
 *   <WorkspaceSettings workspace={workspace} members={members} currentUserRole={role} />
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UserMinus, Shield, Crown, User } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EmojiUploader } from './EmojiUploader';
import { EmojiManager } from './EmojiManager';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getInitials } from '@/shared/lib/utils';
import { MemberRole } from '@/shared/types';
import type { Workspace, WorkspaceMember } from '@/shared/types';
import {
  updateWorkspace,
  inviteMember,
  removeMember,
  updateMemberRole,
} from '@/workspaces/actions';

interface CustomEmojiItem {
  id: string;
  name: string;
  imageUrl: string;
  createdById: string;
  createdAt: Date | string;
  createdBy: {
    name: string | null;
    image: string | null;
  };
}

interface WorkspaceSettingsProps {
  workspace: Workspace;
  members: WorkspaceMember[];
  currentUserRole: MemberRole;
  currentUserId?: string;
  initialEmojis?: CustomEmojiItem[];
}

const roleIcons: Record<MemberRole, React.ReactNode> = {
  [MemberRole.OWNER]: <Crown className="h-3 w-3" />,
  [MemberRole.ADMIN]: <Shield className="h-3 w-3" />,
  [MemberRole.MEMBER]: <User className="h-3 w-3" />,
};

const roleBadgeVariant: Record<MemberRole, 'default' | 'secondary' | 'outline'> = {
  [MemberRole.OWNER]: 'default',
  [MemberRole.ADMIN]: 'secondary',
  [MemberRole.MEMBER]: 'outline',
};

const MAX_EMOJI = 100;

export function WorkspaceSettings({
  workspace,
  members,
  currentUserRole,
  currentUserId = '',
  initialEmojis = [],
}: WorkspaceSettingsProps) {
  const [emojis, setEmojis] = useState<CustomEmojiItem[]>(initialEmojis);

  const isAdmin =
    currentUserRole === MemberRole.ADMIN || currentUserRole === MemberRole.OWNER;

  const handleEmojiUploaded = (emoji: { id: string; name: string; imageUrl: string }) => {
    setEmojis((prev) => [
      ...prev,
      {
        id: emoji.id,
        name: emoji.name,
        imageUrl: emoji.imageUrl,
        createdById: currentUserId,
        createdAt: new Date(),
        createdBy: { name: 'You', image: null },
      },
    ]);
  };

  const handleEmojiDeleted = (emojiId: string) => {
    setEmojis((prev) => prev.filter((e) => e.id !== emojiId));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Workspace Settings</h2>
        <p className="text-sm text-muted-foreground">
          Manage your workspace configuration and members.
        </p>
      </div>
      <Separator />
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="invites">Invites</TabsTrigger>
          <TabsTrigger value="emoji">Emoji</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralTab workspace={workspace} currentUserRole={currentUserRole} />
        </TabsContent>

        <TabsContent value="members">
          <MembersTab
            workspace={workspace}
            members={members}
            currentUserRole={currentUserRole}
          />
        </TabsContent>

        <TabsContent value="invites">
          <InvitesTab
            workspace={workspace}
            currentUserRole={currentUserRole}
          />
        </TabsContent>

        <TabsContent value="emoji" className="space-y-6 pt-4">
          <div>
            <h3 className="text-sm font-semibold mb-1">Custom Emoji</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Upload custom emoji to use in messages, reactions, and the emoji picker.
            </p>
            <EmojiUploader
              workspaceId={workspace.id}
              onSuccess={handleEmojiUploaded}
              usedCount={emojis.length}
              maxCount={MAX_EMOJI}
            />
          </div>
          <Separator />
          <EmojiManager
            emojis={emojis}
            workspaceId={workspace.id}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            maxCount={MAX_EMOJI}
            onDelete={handleEmojiDeleted}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// General Tab
// ---------------------------------------------------------------------------

function GeneralTab({
  workspace,
  currentUserRole,
}: {
  workspace: Workspace;
  currentUserRole: MemberRole;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(workspace.name);
  const [iconUrl, setIconUrl] = useState(workspace.iconUrl || '');
  const [description, setDescription] = useState('');

  const isOwnerOrAdmin =
    currentUserRole === MemberRole.OWNER || currentUserRole === MemberRole.ADMIN;

  function handleSave() {
    if (!isOwnerOrAdmin) return;

    startTransition(async () => {
      try {
        await updateWorkspace(workspace.id, {
          name: name.trim() || undefined,
          iconUrl: iconUrl.trim() || null,
          description: description.trim() || undefined,
        });
        toast.success('Workspace updated');
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update workspace';
        toast.error(message);
      }
    });
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="space-y-2">
        <Label htmlFor="settings-name">Workspace name</Label>
        <Input
          id="settings-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!isOwnerOrAdmin || isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="settings-icon">Icon URL</Label>
        <Input
          id="settings-icon"
          placeholder="https://example.com/icon.png"
          value={iconUrl}
          onChange={(e) => setIconUrl(e.target.value)}
          disabled={!isOwnerOrAdmin || isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="settings-desc">Description</Label>
        <Textarea
          id="settings-desc"
          placeholder="Describe your workspace..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!isOwnerOrAdmin || isPending}
          rows={3}
        />
      </div>

      {isOwnerOrAdmin && (
        <Button
          onClick={handleSave}
          disabled={isPending || !name.trim()}
        >
          {isPending ? 'Saving...' : 'Save changes'}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Members Tab
// ---------------------------------------------------------------------------

function MembersTab({
  workspace,
  members,
  currentUserRole,
}: {
  workspace: Workspace;
  members: WorkspaceMember[];
  currentUserRole: MemberRole;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [memberToRemove, setMemberToRemove] = useState<{ userId: string; name: string } | null>(null);

  const isOwner = currentUserRole === MemberRole.OWNER;
  const isAdmin =
    currentUserRole === MemberRole.ADMIN || currentUserRole === MemberRole.OWNER;

  function handleRoleChange(targetUserId: string, newRole: MemberRole) {
    startTransition(async () => {
      try {
        await updateMemberRole(workspace.id, targetUserId, newRole);
        toast.success('Role updated');
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update role';
        toast.error(message);
      }
    });
  }

  function handleConfirmRemove() {
    if (!memberToRemove) return;
    const { userId, name } = memberToRemove;
    setMemberToRemove(null);
    startTransition(async () => {
      try {
        await removeMember(workspace.id, userId);
        toast.success(`${name} removed from workspace`);
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to remove member';
        toast.error(message);
      }
    });
  }

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {members.length} member{members.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Remove member confirmation dialog */}
      <Dialog
        open={!!memberToRemove}
        onOpenChange={(open) => { if (!open) setMemberToRemove(null); }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{' '}
              <span className="font-semibold">{memberToRemove?.name}</span> from
              this workspace? They will lose access immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setMemberToRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmRemove}
              disabled={isPending}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScrollArea className="h-[400px]">
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Avatar className="h-8 w-8">
                  {member.user.image && (
                    <AvatarImage
                      src={member.user.image}
                      alt={member.user.name}
                    />
                  )}
                  <AvatarFallback className="text-xs">
                    {getInitials(member.user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {member.user.name}
                  </p>
                </div>
                <Badge variant={roleBadgeVariant[member.role]}>
                  <span className="flex items-center gap-1">
                    {roleIcons[member.role]}
                    {member.role}
                  </span>
                </Badge>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Role change dropdown - only visible to OWNER */}
                {isOwner && (
                  <Select
                    value={member.role}
                    onValueChange={(value) =>
                      handleRoleChange(member.userId, value as MemberRole)
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger className="w-[110px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={MemberRole.OWNER}>Owner</SelectItem>
                      <SelectItem value={MemberRole.ADMIN}>Admin</SelectItem>
                      <SelectItem value={MemberRole.MEMBER}>Member</SelectItem>
                    </SelectContent>
                  </Select>
                )}

                {/* Remove button - visible to ADMIN+ */}
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      setMemberToRemove({ userId: member.userId, name: member.user.name })
                    }
                    disabled={isPending}
                    title="Remove member"
                  >
                    <UserMinus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invites Tab
// ---------------------------------------------------------------------------

function InvitesTab({
  workspace,
  currentUserRole,
}: {
  workspace: Workspace;
  currentUserRole: MemberRole;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>(MemberRole.MEMBER);
  const [error, setError] = useState('');

  const isAdmin =
    currentUserRole === MemberRole.ADMIN || currentUserRole === MemberRole.OWNER;

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!isAdmin) {
      setError('You do not have permission to invite members');
      return;
    }

    startTransition(async () => {
      try {
        const member = await inviteMember(workspace.id, email.trim(), role);
        toast.success(`Invited ${member.user.name} as ${role}`);
        setEmail('');
        setRole(MemberRole.MEMBER);
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to invite member';
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <div className="pt-4">
      <div className="mb-4">
        <h3 className="text-sm font-medium">Invite a member</h3>
        <p className="text-xs text-muted-foreground">
          Enter the email address of the user you want to invite.
        </p>
      </div>

      <form onSubmit={handleInvite} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="invite-email">Email address</Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="colleague@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!isAdmin || isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="invite-role">Role</Label>
          <Select
            value={role}
            onValueChange={(value) => setRole(value as MemberRole)}
            disabled={!isAdmin || isPending}
          >
            <SelectTrigger id="invite-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={MemberRole.MEMBER}>Member</SelectItem>
              <SelectItem value={MemberRole.ADMIN}>Admin</SelectItem>
              {currentUserRole === MemberRole.OWNER && (
                <SelectItem value={MemberRole.OWNER}>Owner</SelectItem>
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Members can read and send messages. Admins can manage channels and invite members.
            Owners have full control.
          </p>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button type="submit" disabled={!isAdmin || isPending || !email.trim()}>
          {isPending ? 'Inviting...' : 'Send Invite'}
        </Button>
      </form>
    </div>
  );
}
