/**
 * messages/components/MessageList.tsx
 *
 * Virtualized message list using react-virtuoso GroupedVirtuoso.
 *
 * Features:
 * - Variable height message items (no fixed row height)
 * - followOutput: auto-scrolls to bottom when new messages arrive (only if at bottom)
 * - firstItemIndex trick for prepending older messages without scroll jump
 * - Loads older messages on scroll to top via GET /api/channels/[id]/messages?before=...
 * - Loading spinner at top while fetching history
 * - Date separators between messages from different days (sticky headers via GroupedVirtuoso)
 * - UnreadLine component inserted at the first unread message position
 * - Scroll-to-bottom floating button when scrolled up, with unread count badge
 * - Empty state for channels with no messages
 * - Subscribes to Zustand store messagesByChannel[channelId]
 * - Listens to Socket.IO message:new, message:updated, message:deleted, reaction:updated events
 * - Framer Motion: per-message entry animations, animated scroll button, badge bounce
 */

'use client';

import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { GroupedVirtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { m, AnimatePresence } from 'framer-motion';
import { Loader2, ArrowDown } from 'lucide-react';
import type { MessageWithMeta } from '@/shared/types';
import type { PaginatedResponse } from '@/shared/types/api';
import { cn, formatDaySeparator } from '@/shared/lib/utils';
import { MESSAGES_PER_PAGE } from '@/shared/lib/constants';
import { useSocket } from '@/shared/hooks/useSocket';
import { useMessagesStore } from '@/messages/store';
import { badgeBounce } from '@/shared/lib/animations';
import { AnimatedMessage } from './AnimatedMessage';
import { UnreadLine } from './UnreadLine';

const EMPTY_MESSAGES: MessageWithMeta[] = [];

interface MessageListProps {
  channelId: string;
  channelName?: string;
  currentUserId: string;
}

/** Virtual index offset — large enough that we never reach 0 during prepends */
const INITIAL_INDEX = 1_000_000;

/** Group messages by date for GroupedVirtuoso date separators */
function groupMessagesByDate(messages: MessageWithMeta[]): {
  dates: string[];
  groupCounts: number[];
} {
  if (messages.length === 0) return { dates: [], groupCounts: [] };

  const dates: string[] = [];
  const groupCounts: number[] = [];
  let currentDateLabel = '';

  for (const msg of messages) {
    const date = new Date(msg.createdAt);
    const dateLabel = formatDaySeparator(date);

    if (dateLabel !== currentDateLabel) {
      currentDateLabel = dateLabel;
      dates.push(dateLabel);
      groupCounts.push(1);
    } else {
      groupCounts[groupCounts.length - 1]++;
    }
  }

  return { dates, groupCounts };
}

export function MessageList({ channelId, channelName, currentUserId }: MessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Store selectors
  const messages = useMessagesStore((s) => s.messagesByChannel[channelId] ?? EMPTY_MESSAGES);
  const loading = useMessagesStore((s) => s.loadingByChannel[channelId] ?? false);
  const hasMore = useMessagesStore((s) => s.hasMoreByChannel[channelId] ?? true);
  const unreadIndex = useMessagesStore((s) => s.unreadIndexByChannel[channelId] ?? null);
  const isAtBottom = useMessagesStore((s) => s.isAtBottom);
  const unseenCount = useMessagesStore((s) => s.unseenCount);

  // Store actions
  const setMessages = useMessagesStore((s) => s.setMessages);
  const prependMessages = useMessagesStore((s) => s.prependMessages);
  const addMessage = useMessagesStore((s) => s.addMessage);
  const updateMessage = useMessagesStore((s) => s.updateMessage);
  const deleteMessage = useMessagesStore((s) => s.deleteMessage);
  const setReactions = useMessagesStore((s) => s.setReactions);
  const setLoading = useMessagesStore((s) => s.setLoading);
  const setHasMore = useMessagesStore((s) => s.setHasMore);
  const setIsAtBottom = useMessagesStore((s) => s.setIsAtBottom);
  const incrementUnseen = useMessagesStore((s) => s.incrementUnseen);
  const resetUnseen = useMessagesStore((s) => s.resetUnseen);
  const incrementReplyCount = useMessagesStore((s) => s.incrementReplyCount);

  const socket = useSocket();

  // Track firstItemIndex for prepend trick
  const [firstItemIndex, setFirstItemIndex] = useState(INITIAL_INDEX);

  // Group messages by date for GroupedVirtuoso
  const { dates, groupCounts } = useMemo(
    () => groupMessagesByDate(messages),
    [messages]
  );

  // --- Initial load ---
  useEffect(() => {
    let cancelled = false;

    async function loadInitialMessages() {
      setLoading(channelId, true);
      try {
        const res = await fetch(
          `/api/channels/${channelId}/messages?limit=${MESSAGES_PER_PAGE}`
        );
        if (!res.ok) throw new Error('Failed to load messages');
        const data: PaginatedResponse<MessageWithMeta> = await res.json();
        if (cancelled) return;

        // API returns newest-first, we want oldest-first
        const sorted = [...data.data].reverse();
        setMessages(channelId, sorted);
        setHasMore(channelId, data.pagination.hasMore);
        setFirstItemIndex(INITIAL_INDEX);
        setInitialLoadDone(true);
      } catch (err) {
        console.error('Failed to load messages:', err);
      } finally {
        if (!cancelled) setLoading(channelId, false);
      }
    }

    loadInitialMessages();

    return () => {
      cancelled = true;
    };
  }, [channelId, setMessages, setLoading, setHasMore]);

  // --- Socket.IO event listeners ---
  useEffect(() => {
    function handleNewMessage(message: MessageWithMeta) {
      if (message.channelId !== channelId) return;
      // Only add top-level messages (not thread replies)
      if (message.parentId) {
        // Increment the parent's reply count
        incrementReplyCount(channelId, message.parentId);
        return;
      }
      addMessage(channelId, message);
      if (!useMessagesStore.getState().isAtBottom) {
        incrementUnseen();
      }
    }

    function handleUpdatedMessage(message: MessageWithMeta) {
      if (message.channelId !== channelId) return;
      updateMessage(channelId, message);
    }

    function handleDeletedMessage(payload: { messageId: string; channelId: string }) {
      if (payload.channelId !== channelId) return;
      deleteMessage(channelId, payload.messageId);
    }

    function handleReactionsUpdated(payload: {
      messageId: string;
      reactions: MessageWithMeta['reactions'];
    }) {
      setReactions(channelId, payload.messageId, payload.reactions);
    }

    socket.on('message:new', handleNewMessage);
    socket.on('message:updated', handleUpdatedMessage);
    socket.on('message:deleted', handleDeletedMessage);
    socket.on('reaction:updated', handleReactionsUpdated);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:updated', handleUpdatedMessage);
      socket.off('message:deleted', handleDeletedMessage);
      socket.off('reaction:updated', handleReactionsUpdated);
    };
  }, [
    channelId,
    socket,
    addMessage,
    updateMessage,
    deleteMessage,
    setReactions,
    incrementUnseen,
    incrementReplyCount,
  ]);

  // --- Load older messages on scroll to top ---
  const loadOlderMessages = useCallback(async () => {
    if (loading || !hasMore || messages.length === 0) return;

    setLoading(channelId, true);
    try {
      const oldestMessage = messages[0];
      const res = await fetch(
        `/api/channels/${channelId}/messages?cursor=${oldestMessage.id}&limit=${MESSAGES_PER_PAGE}`
      );
      if (!res.ok) throw new Error('Failed to load older messages');
      const data: PaginatedResponse<MessageWithMeta> = await res.json();

      // API returns newest-first, reverse for oldest-first
      const olderMessages = [...data.data].reverse();

      if (olderMessages.length > 0) {
        setFirstItemIndex((prev) => prev - olderMessages.length);
        prependMessages(channelId, olderMessages);
      }
      setHasMore(channelId, data.pagination.hasMore);
    } catch (err) {
      console.error('Failed to load older messages:', err);
    } finally {
      setLoading(channelId, false);
    }
  }, [channelId, loading, hasMore, messages, setLoading, prependMessages, setHasMore]);

  // --- Scroll to bottom handler ---
  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: messages.length - 1,
      behavior: 'smooth',
    });
    resetUnseen();
  }, [messages.length, resetUnseen]);

  // --- Handle at-bottom state ---
  const handleAtBottomStateChange = useCallback(
    (atBottom: boolean) => {
      setIsAtBottom(atBottom);
    },
    [setIsAtBottom]
  );

  // --- Empty state ---
  if (initialLoadDone && messages.length === 0 && !loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <div className="rounded-xl bg-muted/50 px-8 py-12">
          <div className="mb-3 text-4xl">💬</div>
          <h3 className="text-lg font-semibold text-foreground">No messages yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Start the conversation!
          </p>
        </div>
      </div>
    );
  }

  // --- Loading state (initial) ---
  if (!initialLoadDone && loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <GroupedVirtuoso
        ref={virtuosoRef}
        style={{ height: '100%' }}
        firstItemIndex={firstItemIndex}
        initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
        groupCounts={groupCounts}
        followOutput={(atBottom) => (atBottom ? 'smooth' : false)}
        atBottomStateChange={handleAtBottomStateChange}
        atBottomThreshold={100}
        startReached={hasMore ? loadOlderMessages : undefined}
        overscan={200}
        components={{
          Header: () =>
            loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Loading older messages...
                </span>
              </div>
            ) : null,
        }}
        groupContent={(index) => (
          <div className="sticky top-0 z-10 flex items-center justify-center py-2">
            <div
              className={cn(
                'rounded-full border border-border bg-background px-3 py-1',
                'text-xs font-semibold text-muted-foreground shadow-sm'
              )}
            >
              {dates[index]}
            </div>
          </div>
        )}
        itemContent={(index) => {
          // Convert virtual index back to array index
          const arrayIndex = index - firstItemIndex;
          const message = messages[arrayIndex];
          if (!message) return null;

          const previousMessage = arrayIndex > 0 ? messages[arrayIndex - 1] : null;

          return (
            <div>
              {/* UnreadLine before the first unread message */}
              {unreadIndex !== null && arrayIndex === unreadIndex && <UnreadLine />}

              {/* AnimatedMessage wraps MessageItem with enter/edit/delete animations */}
              <AnimatedMessage
                message={message}
                previousMessage={previousMessage}
                currentUserId={currentUserId}
                channelName={channelName}
                isFirstMessage={arrayIndex === 0}
              />
            </div>
          );
        }}
      />

      {/* Animated scroll-to-bottom button with badge bounce */}
      <AnimatePresence>
        {!isAtBottom && (
          <m.button
            key="scroll-to-bottom"
            type="button"
            onClick={scrollToBottom}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className={cn(
              'absolute bottom-4 right-4 z-20',
              'flex h-10 w-10 items-center justify-center',
              'rounded-full border border-border bg-background shadow-lg',
              'hover:shadow-xl'
            )}
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="h-5 w-5 text-muted-foreground" />

            {/* Animated unread badge */}
            <AnimatePresence>
              {unseenCount > 0 && (
                <m.span
                  key={`badge-${unseenCount}`}
                  variants={badgeBounce}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className={cn(
                    'absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center',
                    'rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white'
                  )}
                >
                  {unseenCount > 99 ? '99+' : unseenCount}
                </m.span>
              )}
            </AnimatePresence>
          </m.button>
        )}
      </AnimatePresence>
    </div>
  );
}
