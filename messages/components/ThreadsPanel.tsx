'use client';

/**
 * messages/components/ThreadsPanel.tsx
 *
 * Sidebar panel showing all threads the current user is following,
 * sorted by latest activity. Accessible from the sidebar threads icon.
 *
 * Features:
 *   - Shows followed threads with: parent message snippet, channel name,
 *     last reply preview, unread count badge
 *   - Follow/unfollow toggle on the ThreadPanel header
 *   - Thread resolution: thread starter can mark as Resolved
 *   - Stored in localStorage (keyed by userId + workspaceId)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, X, Loader2, Hash, CheckCircle2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { staggerContainer, staggerItem, panelSlideRight } from '@/shared/lib/animations';
import { formatDistanceToNow } from 'date-fns';
import { useAppStore } from '@/store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FollowedThread {
  parentMessageId: string;
  parentContentPreview: string;
  channelId: string;
  channelName: string;
  lastReplyPreview?: string;
  lastReplyAt?: string;
  replyCount: number;
  unreadCount: number;
  isResolved: boolean;
  followedAt: string;
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const FOLLOWED_THREADS_KEY = 'slack-clone-followed-threads';

export function getFollowedThreads(userId: string, workspaceId: string): FollowedThread[] {
  if (typeof window === 'undefined') return [];
  try {
    const key = `${FOLLOWED_THREADS_KEY}-${userId}-${workspaceId}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveFollowedThreads(
  userId: string,
  workspaceId: string,
  threads: FollowedThread[]
): void {
  if (typeof window === 'undefined') return;
  try {
    const key = `${FOLLOWED_THREADS_KEY}-${userId}-${workspaceId}`;
    localStorage.setItem(key, JSON.stringify(threads));
  } catch {}
}

export function addFollowedThread(
  userId: string,
  workspaceId: string,
  thread: FollowedThread
): void {
  const threads = getFollowedThreads(userId, workspaceId);
  const exists = threads.find((t) => t.parentMessageId === thread.parentMessageId);
  if (exists) return;
  threads.unshift(thread);
  saveFollowedThreads(userId, workspaceId, threads);
}

export function removeFollowedThread(
  userId: string,
  workspaceId: string,
  parentMessageId: string
): void {
  const threads = getFollowedThreads(userId, workspaceId).filter(
    (t) => t.parentMessageId !== parentMessageId
  );
  saveFollowedThreads(userId, workspaceId, threads);
}

export function isFollowingThread(
  userId: string,
  workspaceId: string,
  parentMessageId: string
): boolean {
  return getFollowedThreads(userId, workspaceId).some(
    (t) => t.parentMessageId === parentMessageId
  );
}

export function markThreadResolved(
  userId: string,
  workspaceId: string,
  parentMessageId: string,
  resolved: boolean
): void {
  const threads = getFollowedThreads(userId, workspaceId).map((t) =>
    t.parentMessageId === parentMessageId ? { ...t, isResolved: resolved } : t
  );
  saveFollowedThreads(userId, workspaceId, threads);
}

// ---------------------------------------------------------------------------
// ThreadsPanel component
// ---------------------------------------------------------------------------

interface ThreadsPanelProps {
  workspaceId: string;
  workspaceSlug: string;
  onClose: () => void;
  onOpenThread?: (parentMessageId: string, channelId: string) => void;
}

export function ThreadsPanel({
  workspaceId,
  workspaceSlug,
  onClose,
  onOpenThread,
}: ThreadsPanelProps) {
  const user = useAppStore((s) => s.user);
  const [threads, setThreads] = useState<FollowedThread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const data = getFollowedThreads(user.id, workspaceId);
    // Sort by latest activity
    data.sort((a, b) => {
      const aTime = a.lastReplyAt ?? a.followedAt;
      const bTime = b.lastReplyAt ?? b.followedAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
    setThreads(data);
    setLoading(false);
  }, [user?.id, workspaceId]);

  const handleUnfollow = useCallback(
    (parentMessageId: string) => {
      if (!user) return;
      removeFollowedThread(user.id, workspaceId, parentMessageId);
      setThreads((prev) => prev.filter((t) => t.parentMessageId !== parentMessageId));
    },
    [user?.id, workspaceId]
  );

  const handleToggleResolved = useCallback(
    (thread: FollowedThread) => {
      if (!user) return;
      const newResolved = !thread.isResolved;
      markThreadResolved(user.id, workspaceId, thread.parentMessageId, newResolved);
      setThreads((prev) =>
        prev.map((t) =>
          t.parentMessageId === thread.parentMessageId
            ? { ...t, isResolved: newResolved }
            : t
        )
      );
    },
    [user?.id, workspaceId]
  );

  const activeThreads = threads.filter((t) => !t.isResolved);
  const resolvedThreads = threads.filter((t) => t.isResolved);

  return (
    <motion.div
      className="flex flex-col w-[320px] border-l bg-background h-full shrink-0"
      variants={panelSlideRight}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Threads</h3>
          {threads.length > 0 && (
            <span className="text-xs text-muted-foreground">({threads.length})</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && threads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <MessageSquare className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No followed threads</p>
            <p className="text-xs text-muted-foreground mt-1">
              You&apos;ll automatically follow threads you reply to. You can also manually
              follow threads from the thread panel header.
            </p>
          </div>
        )}

        {!loading && activeThreads.length > 0 && (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="py-2"
          >
            <div className="px-4 py-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Active Threads
              </span>
            </div>
            {activeThreads.map((thread) => (
              <ThreadItem
                key={thread.parentMessageId}
                thread={thread}
                onOpen={() => onOpenThread?.(thread.parentMessageId, thread.channelId)}
                onUnfollow={() => handleUnfollow(thread.parentMessageId)}
                onToggleResolved={() => handleToggleResolved(thread)}
              />
            ))}
          </motion.div>
        )}

        {!loading && resolvedThreads.length > 0 && (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="py-2 border-t"
          >
            <div className="px-4 py-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Resolved
              </span>
            </div>
            {resolvedThreads.map((thread) => (
              <ThreadItem
                key={thread.parentMessageId}
                thread={thread}
                onOpen={() => onOpenThread?.(thread.parentMessageId, thread.channelId)}
                onUnfollow={() => handleUnfollow(thread.parentMessageId)}
                onToggleResolved={() => handleToggleResolved(thread)}
              />
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ThreadItem sub-component
// ---------------------------------------------------------------------------

interface ThreadItemProps {
  thread: FollowedThread;
  onOpen: () => void;
  onUnfollow: () => void;
  onToggleResolved: () => void;
}

function ThreadItem({ thread, onOpen, onUnfollow, onToggleResolved }: ThreadItemProps) {
  const [hovered, setHovered] = useState(false);

  const timeAgo = thread.lastReplyAt
    ? formatDistanceToNow(new Date(thread.lastReplyAt), { addSuffix: true })
    : formatDistanceToNow(new Date(thread.followedAt), { addSuffix: true });

  return (
    <motion.div
      variants={staggerItem}
      className={cn(
        'group relative px-3 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer',
        thread.isResolved && 'opacity-60'
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onOpen}
    >
      {/* Channel name */}
      <div className="flex items-center gap-1 mb-1">
        <Hash className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{thread.channelName}</span>
        {thread.isResolved && (
          <span className="ml-1 text-xs text-green-500 flex items-center gap-0.5">
            <CheckCircle2 className="h-3 w-3" />
            Resolved
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{timeAgo}</span>
      </div>

      {/* Parent message preview */}
      <p className="text-sm text-foreground/80 line-clamp-2 mb-1">
        {thread.parentContentPreview}
      </p>

      {/* Last reply + count */}
      {thread.lastReplyPreview && (
        <p className="text-xs text-muted-foreground line-clamp-1">
          <span className="font-medium">Latest: </span>
          {thread.lastReplyPreview}
        </p>
      )}

      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-muted-foreground">
          {thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'}
        </span>
        {thread.unreadCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/20 px-1 text-[9px] font-bold text-primary">
            {thread.unreadCount}
          </span>
        )}
      </div>

      {/* Hover actions */}
      {hovered && (
        <div
          className="absolute top-2 right-2 flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onToggleResolved}
            className={cn(
              'rounded p-1 text-xs transition-colors',
              thread.isResolved
                ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-950/30 dark:text-green-400'
                : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
            title={thread.isResolved ? 'Mark as unresolved' : 'Resolve thread'}
          >
            <CheckCircle2 className="h-3 w-3" />
          </button>
          <button
            onClick={onUnfollow}
            className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
            title="Unfollow thread"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </motion.div>
  );
}
