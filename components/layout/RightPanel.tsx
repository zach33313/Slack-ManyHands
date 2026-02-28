'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { m, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { useMessagesStore } from '@/messages/store';
import { cn } from '@/shared/lib/utils';
import { X, Users, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MemberList } from '@/members/components/MemberList';
import { ThreadPanel } from '@/messages/components/ThreadPanel';
import { ChannelInviteDialog } from '@/channels/components/ChannelInviteDialog';
import { openDM } from '@/channels/actions';
import { panelSlideRight } from '@/shared/lib/animations';
import type { MemberWithUser } from '@/members/types';

/**
 * Right-side drawer panel that conditionally renders ThreadPanel,
 * MemberList, or ChannelInfo based on Zustand UI state.
 * Slides in from the right with Framer Motion panelSlideRight animation.
 * AnimatePresence handles the exit animation when the panel closes.
 */
export function RightPanel() {
  const rightPanelView = useAppStore((s) => s.rightPanelView);
  const currentUserId = useAppStore((s) => s.user?.id);
  const activeThreadId = useMessagesStore((s) => s.activeThreadId);
  const currentChannel = useAppStore((s) => s.currentChannel);

  // Show thread panel when a thread is activated from messages store
  const effectiveView = activeThreadId ? 'thread' : rightPanelView;

  return (
    <AnimatePresence mode="wait">
      {effectiveView && (
        <m.div
          key={effectiveView}
          variants={panelSlideRight}
          initial="initial"
          animate="animate"
          exit="exit"
          className={cn(
            'flex flex-col border-l bg-background shrink-0',
            'w-[380px] max-w-full'
          )}
        >
          {effectiveView === 'thread' && currentUserId && (
            <ThreadPanel
              currentUserId={currentUserId}
              channelName={currentChannel?.name}
            />
          )}
          {effectiveView === 'members' && <MemberListContent />}
          {effectiveView === 'channel-info' && <ChannelInfoContent />}
        </m.div>
      )}
    </AnimatePresence>
  );
}

// --- Member List ---

function MemberListContent() {
  const setRightPanelView = useAppStore((s) => s.setRightPanelView);
  const currentWorkspace = useAppStore((s) => s.currentWorkspace);
  const currentChannel = useAppStore((s) => s.currentChannel);
  const [members, setMembers] = useState<MemberWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const router = useRouter();

  const handleMessageClick = useCallback(async (targetUserId: string) => {
    if (!currentWorkspace) return;
    try {
      await openDM(currentWorkspace.id, targetUserId);
      router.push(`/${currentWorkspace.slug}/dm/${targetUserId}`);
      router.refresh();
    } catch (err) {
      console.error('Failed to open DM:', err);
    }
  }, [currentWorkspace, router]);

  useEffect(() => {
    if (!currentChannel || !currentWorkspace) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/channels/${currentChannel.id}/members`)
      .then((res) => {
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        return res.json();
      })
      .then((body) => {
        if (cancelled) return;
        if (!body.ok) throw new Error(body.error ?? 'Failed to load members');
        // Transform ChannelMemberWithUser[] to MemberWithUser[] shape
        const transformed: MemberWithUser[] = (body.data ?? []).map(
          (m: any) => ({
            id: m.id,
            workspaceId: currentWorkspace!.id,
            userId: m.userId,
            role: 'MEMBER' as const,
            joinedAt: m.joinedAt,
            user: {
              id: m.user.id,
              name: m.user.name ?? null,
              email: m.user.email ?? '',
              image: m.user.image ?? null,
              title: m.user.title ?? null,
              statusText: m.user.statusText ?? null,
              statusEmoji: m.user.statusEmoji ?? null,
              timezone: m.user.timezone ?? null,
            },
          })
        );
        setMembers(transformed);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load members:', err);
          setError('Could not load members. Please try again.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentChannel?.id, currentWorkspace, retryCount]);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          <h3 className="font-semibold text-sm">Members</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setRightPanelView(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={() => setRetryCount((c) => c + 1)}>
            Retry
          </Button>
        </div>
      ) : (
        <MemberList members={members} onMessageClick={handleMessageClick} className="flex-1" />
      )}
    </>
  );
}

// --- Channel Info ---

function ChannelInfoContent() {
  const setRightPanelView = useAppStore((s) => s.setRightPanelView);
  const currentChannel = useAppStore((s) => s.currentChannel);
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4" />
          <h3 className="font-semibold text-sm">Channel Details</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setRightPanelView(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {currentChannel && (
            <>
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Channel name
                </h4>
                <p className="text-sm font-medium">#{currentChannel.name}</p>
              </div>

              {currentChannel.description && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Description
                  </h4>
                  <p className="text-sm">{currentChannel.description}</p>
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Type
                </h4>
                <p className="text-sm capitalize">{currentChannel.type.toLowerCase()}</p>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Created
                </h4>
                <p className="text-sm">
                  {new Date(currentChannel.createdAt).toLocaleDateString()}
                </p>
              </div>

              {/* Add member by email */}
              {currentChannel.type !== 'DM' && (
                <div className="pt-2 border-t border-border">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setInviteOpen(true)}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Add Member by Email
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {currentChannel && currentChannel.type !== 'DM' && (
        <ChannelInviteDialog
          channelId={currentChannel.id}
          channelName={currentChannel.name}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
        />
      )}
    </>
  );
}
