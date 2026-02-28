/**
 * messages/components/MessageActions.tsx
 *
 * Hover toolbar that appears above-right of a message on hover.
 * Provides quick actions: emoji react, reply in thread, edit (own messages),
 * pin/unpin toggle, and a "more" dropdown menu with delete, copy link, mark unread.
 */

'use client';

import React, { useState, useCallback } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  SmilePlus,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  MoreHorizontal,
  Trash2,
  Link2,
  BookmarkMinus,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useSocket } from '@/shared/hooks/useSocket';
import { ReactionPicker } from './ReactionPicker';
import { useMessagesStore } from '@/messages/store';

interface MessageActionsProps {
  messageId: string;
  channelId: string;
  /** Whether the current user authored this message */
  isOwnMessage: boolean;
  isPinned: boolean;
  /** Callback when the user clicks "Edit" — parent should switch to edit mode */
  onEdit?: () => void;
  /** Callback when the user clicks "Reply in thread" */
  onReply?: () => void;
}

const ActionButton = React.forwardRef<
  HTMLButtonElement,
  {
    onClick?: () => void;
    label: string;
    children: React.ReactNode;
    className?: string;
  }
>(function ActionButton({ onClick, label, children, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded text-gray-500 dark:text-gray-400',
        'transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-700 dark:hover:text-gray-100',
        className
      )}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
});

export function MessageActions({
  messageId,
  channelId,
  isOwnMessage,
  isPinned,
  onEdit,
  onReply,
}: MessageActionsProps) {
  const socket = useSocket();
  const setActiveThread = useMessagesStore((s) => s.setActiveThread);

  const handleReply = useCallback(() => {
    setActiveThread(messageId);
    onReply?.();
  }, [messageId, setActiveThread, onReply]);

  const handleAddReaction = useCallback(
    (emoji: string) => {
      socket.emit('message:react', { messageId, emoji });
    },
    [messageId, socket]
  );

  const handlePin = useCallback(() => {
    // Pin/unpin is done via REST API (POST/DELETE /api/messages/[id]/pin)
    const method = isPinned ? 'DELETE' : 'POST';
    fetch(`/api/messages/${messageId}/pin`, { method }).catch(console.error);
  }, [messageId, isPinned]);

  const handleDelete = useCallback(() => {
    if (!window.confirm('Are you sure you want to delete this message? This cannot be undone.')) {
      return;
    }
    socket.emit('message:delete', { messageId });
  }, [messageId, socket]);

  const handleCopyLink = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}?message=${messageId}`;
    navigator.clipboard.writeText(url).catch(console.error);
  }, [messageId]);

  const handleMarkUnread = useCallback(() => {
    // Mark unread from this message position
    const store = useMessagesStore.getState();
    const messages = store.messagesByChannel[channelId] ?? [];
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx >= 0) {
      store.setUnreadIndex(channelId, idx);
    }
  }, [channelId, messageId]);

  return (
    <div
      className={cn(
        'absolute -top-4 right-2 z-10 flex items-center gap-0.5',
        'rounded-md border border-gray-200 bg-white px-0.5 py-0.5 shadow-sm dark:border-gray-700 dark:bg-gray-800'
      )}
    >
      {/* Emoji reaction picker */}
      <ReactionPicker
        onSelect={handleAddReaction}
        trigger={
          <ActionButton label="Add reaction">
            <SmilePlus className="h-4 w-4" />
          </ActionButton>
        }
      />

      {/* Reply in thread */}
      <ActionButton label="Reply in thread" onClick={handleReply}>
        <MessageSquare className="h-4 w-4" />
      </ActionButton>

      {/* Edit (own messages only) */}
      {isOwnMessage && onEdit && (
        <ActionButton label="Edit message" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </ActionButton>
      )}

      {/* Pin/Unpin */}
      <ActionButton
        label={isPinned ? 'Unpin message' : 'Pin message'}
        onClick={handlePin}
      >
        {isPinned ? (
          <PinOff className="h-4 w-4" />
        ) : (
          <Pin className="h-4 w-4" />
        )}
      </ActionButton>

      {/* More menu */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <ActionButton label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </ActionButton>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className={cn(
              'z-50 min-w-[160px] rounded-md border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800',
              'animate-in fade-in-0 zoom-in-95'
            )}
          >
            {isOwnMessage && (
              <DropdownMenu.Item
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-red-600 dark:text-red-400',
                  'outline-none hover:bg-red-50 focus:bg-red-50 dark:hover:bg-red-900/30 dark:focus:bg-red-900/30'
                )}
                onSelect={handleDelete}
              >
                <Trash2 className="h-4 w-4" />
                Delete message
              </DropdownMenu.Item>
            )}

            <DropdownMenu.Item
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300',
                'outline-none hover:bg-gray-100 focus:bg-gray-100 dark:hover:bg-gray-700 dark:focus:bg-gray-700'
              )}
              onSelect={handleCopyLink}
            >
              <Link2 className="h-4 w-4" />
              Copy link
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300',
                'outline-none hover:bg-gray-100 focus:bg-gray-100 dark:hover:bg-gray-700 dark:focus:bg-gray-700'
              )}
              onSelect={handleMarkUnread}
            >
              <BookmarkMinus className="h-4 w-4" />
              Mark unread
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
