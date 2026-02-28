'use client';

/**
 * messages/components/AnimatedMessage.tsx
 *
 * Animation wrapper for MessageItem. Handles:
 *
 * 1. Enter animation:
 *    - Own messages slide in from right (ownMessageVariants)
 *    - Others' messages slide up from bottom (messageVariants)
 *
 * 2. Edit flash:
 *    - When message.updatedAt changes (and isEdited is true), applies the
 *      'message-just-edited' CSS class which triggers a yellow background
 *      keyframe animation (defined in globals.css).
 *
 * 3. Delete transition:
 *    - When message.isDeleted becomes true, animates opacity → 0.4 and
 *      scale → 0.98 over 150ms before the MessageItem renders the
 *      "[deleted]" state.
 *
 * NOTE: Do NOT wrap the GroupedVirtuoso list with AnimatePresence.
 *       Place this component INSIDE itemContent renderer instead.
 *
 * Usage (in MessageList itemContent renderer):
 *   <AnimatedMessage
 *     message={message}
 *     previousMessage={previousMessage}
 *     currentUserId={currentUserId}
 *     channelName={channelName}
 *   />
 */

import React, { useEffect, useRef, useState } from 'react';
import { m } from 'framer-motion';
import type { MessageWithMeta } from '@/shared/types';
import { messageVariants, ownMessageVariants } from '@/shared/lib/animations';
import { MessageItem } from './MessageItem';

interface AnimatedMessageProps {
  message: MessageWithMeta;
  previousMessage?: MessageWithMeta | null;
  currentUserId: string;
  channelName?: string;
  isThreadView?: boolean;
  isFirstMessage?: boolean;
}

export function AnimatedMessage({
  message,
  previousMessage,
  currentUserId,
  channelName,
  isThreadView = false,
  isFirstMessage = false,
}: AnimatedMessageProps) {
  const isOwnMessage = message.userId === currentUserId;

  // Track edit flash: fires when editedAt changes (message was just edited)
  const prevEditedAt = useRef<Date | string | null>(null);
  const [justEdited, setJustEdited] = useState(false);

  useEffect(() => {
    // Skip on first render (initial mount) — don't flash on page load
    if (prevEditedAt.current === null) {
      prevEditedAt.current = message.editedAt;
      return;
    }

    // Check if the message was edited (editedAt changed to a new value)
    const edited = message.editedAt?.toString() ?? null;
    const prev = prevEditedAt.current?.toString() ?? null;
    if (edited !== prev && message.isEdited) {
      setJustEdited(true);
      // Remove class after animation completes (600ms gives time for 500ms keyframe)
      const timer = setTimeout(() => setJustEdited(false), 650);
      prevEditedAt.current = message.editedAt;
      return () => clearTimeout(timer);
    }
    prevEditedAt.current = message.editedAt;
  }, [message.editedAt, message.isEdited]);

  // Delete transition: animate to muted state when message is deleted
  const prevIsDeleted = useRef(message.isDeleted);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!prevIsDeleted.current && message.isDeleted) {
      setIsDeleting(true);
      const timer = setTimeout(() => setIsDeleting(false), 200);
      prevIsDeleted.current = message.isDeleted;
      return () => clearTimeout(timer);
    }
    prevIsDeleted.current = message.isDeleted;
  }, [message.isDeleted]);

  const variants = isOwnMessage ? ownMessageVariants : messageVariants;

  return (
    <m.div
      // Use message.id as part of the key so each message gets its own animation instance
      layoutId={undefined} // Don't use layoutId — virtuoso remounts items
      variants={variants}
      initial="initial"
      animate={
        isDeleting
          ? { opacity: 0.4, scale: 0.98, transition: { duration: 0.15 } }
          : 'animate'
      }
      className={justEdited ? 'message-just-edited' : undefined}
    >
      <MessageItem
        message={message}
        previousMessage={previousMessage}
        currentUserId={currentUserId}
        channelName={channelName}
        isThreadView={isThreadView}
        isFirstMessage={isFirstMessage}
      />
    </m.div>
  );
}
