/**
 * messages/components/ThreadPanel.tsx
 *
 * Right-side thread panel for viewing and replying to message threads.
 *
 * Features:
 * - Header: "Thread" title + channel name + close button
 * - Parent message displayed at top (full MessageItem)
 * - Thread replies list below (simple scrollable, not virtualized)
 * - ThreadComposer at bottom
 * - Loads replies via GET /api/messages/[id]/threads
 * - Subscribes to Socket.IO thread:reply events for this parent
 */

'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { MessageWithMeta } from '@/shared/types';
import type { ApiSuccess } from '@/shared/types/api';
import { cn } from '@/shared/lib/utils';
import { useSocket } from '@/shared/hooks/useSocket';
import { useMessagesStore } from '@/messages/store';
import { MessageItem } from './MessageItem';
import { ThreadComposer } from './ThreadComposer';

interface ThreadPanelProps {
  /** Current authenticated user's ID */
  currentUserId: string;
  /** Channel name for display context */
  channelName?: string;
}

export function ThreadPanel({ currentUserId, channelName }: ThreadPanelProps) {
  const repliesEndRef = useRef<HTMLDivElement>(null);
  const socket = useSocket();

  // Store selectors
  const activeThreadId = useMessagesStore((s) => s.activeThreadId);
  const threadMessages = useMessagesStore((s) => s.threadMessages);
  const threadLoading = useMessagesStore((s) => s.threadLoading);
  const messagesByChannel = useMessagesStore((s) => s.messagesByChannel);

  // Store actions
  const setActiveThread = useMessagesStore((s) => s.setActiveThread);
  const setThreadMessages = useMessagesStore((s) => s.setThreadMessages);
  const addThreadMessage = useMessagesStore((s) => s.addThreadMessage);
  const setThreadLoading = useMessagesStore((s) => s.setThreadLoading);

  // Find the parent message across all channels
  const parentMessage = React.useMemo(() => {
    if (!activeThreadId) return null;
    for (const channelMessages of Object.values(messagesByChannel)) {
      const found = channelMessages.find((m) => m.id === activeThreadId);
      if (found) return found;
    }
    return null;
  }, [activeThreadId, messagesByChannel]);

  // Load thread replies when activeThreadId changes
  useEffect(() => {
    if (!activeThreadId) return;
    let cancelled = false;

    async function loadThreadReplies() {
      setThreadLoading(true);
      try {
        const res = await fetch(`/api/messages/${activeThreadId}/threads`);
        if (!res.ok) throw new Error('Failed to load thread');
        const data: ApiSuccess<MessageWithMeta[]> = await res.json();
        if (cancelled) return;
        setThreadMessages(data.data);
      } catch (err) {
        console.error('Failed to load thread replies:', err);
      } finally {
        if (!cancelled) setThreadLoading(false);
      }
    }

    loadThreadReplies();

    return () => {
      cancelled = true;
    };
  }, [activeThreadId, setThreadMessages, setThreadLoading]);

  // Subscribe to thread:reply events for this thread
  useEffect(() => {
    if (!activeThreadId) return;

    function handleThreadReply(message: MessageWithMeta) {
      if (message.parentId !== activeThreadId) return;
      addThreadMessage(message);
      // Note: replyCount increment is handled by MessageList's message:new handler
    }

    socket.on('thread:reply', handleThreadReply);

    return () => {
      socket.off('thread:reply', handleThreadReply);
    };
  }, [activeThreadId, parentMessage, socket, addThreadMessage]);

  // Auto-scroll to bottom when new replies arrive
  useEffect(() => {
    repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages.length]);

  const handleClose = useCallback(() => {
    setActiveThread(null);
  }, [setActiveThread]);

  // Don't render if no active thread
  if (!activeThreadId || !parentMessage) return null;

  return (
    <div className="flex h-full w-[400px] flex-col border-l border-border bg-background">
      {/* Header */}
      <div
        className={cn(
          'flex items-center justify-between border-b border-border px-4 py-3'
        )}
      >
        <div>
          <h2 className="text-base font-bold text-foreground">Thread</h2>
          {channelName && (
            <p className="text-xs text-muted-foreground">#{channelName}</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleClose}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md',
            'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
          )}
          aria-label="Close thread"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Thread content — scrollable area */}
      <div className="flex-1 overflow-y-auto">
        {/* Parent message */}
        <div className="border-b border-border pb-3">
          <MessageItem
            message={parentMessage}
            currentUserId={currentUserId}
            channelName={channelName}
            isThreadView
          />
        </div>

        {/* Reply count divider */}
        {parentMessage.replyCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-muted-foreground">
              {parentMessage.replyCount}{' '}
              {parentMessage.replyCount === 1 ? 'reply' : 'replies'}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
        )}

        {/* Thread replies */}
        {threadLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading replies...</span>
          </div>
        ) : (
          <div>
            {threadMessages.map((reply, index) => (
              <MessageItem
                key={reply.id}
                message={reply}
                previousMessage={index > 0 ? threadMessages[index - 1] : null}
                currentUserId={currentUserId}
                channelName={channelName}
                isThreadView
              />
            ))}
            <div ref={repliesEndRef} />
          </div>
        )}
      </div>

      {/* Thread composer */}
      <ThreadComposer
        parentId={activeThreadId}
        channelId={parentMessage.channelId}
        channelName={channelName}
      />
    </div>
  );
}
