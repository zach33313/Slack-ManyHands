'use client';

/**
 * messages/components/AnimatedReactionBar.tsx
 *
 * Animated version of ReactionBar with:
 *
 * 1. Bar expand/collapse: AnimatePresence wraps the entire bar.
 *    When the first reaction appears, the bar expands from height 0 with a spring.
 *    When the last reaction is removed, the bar collapses to 0.
 *
 * 2. Reaction pop: Each emoji button uses reactionVariants (scale 0 → 1.4 → 1.0).
 *    AnimatePresence mode='popLayout' handles individual reaction add/remove.
 *
 * 3. Counter flip: Count changes animate with old number sliding up and out,
 *    new number sliding in from below (AnimatePresence mode='popLayout').
 *
 * Drop-in replacement for ReactionBar.
 *
 * Usage (in MessageItem):
 *   import { AnimatedReactionBar } from './AnimatedReactionBar';
 *   <AnimatedReactionBar messageId={message.id} reactions={message.reactions} currentUserId={currentUserId} />
 */

import React, { useCallback } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import type { ReactionGroup } from '@/shared/types';
import { cn } from '@/shared/lib/utils';
import { useSocket } from '@/shared/hooks/useSocket';
import { reactionVariants, springBouncy, springGentle } from '@/shared/lib/animations';
import { ReactionPicker } from './ReactionPicker';

interface AnimatedReactionBarProps {
  messageId: string;
  reactions: ReactionGroup[];
  currentUserId: string;
}

/** Counter that flips when the count changes */
function AnimatedCount({ count }: { count: number }) {
  return (
    <span
      className="relative inline-block overflow-hidden leading-none"
      style={{ minWidth: '1ch', height: '1em' }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={count}
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          style={{ display: 'inline-block', position: 'absolute', left: 0 }}
        >
          {count}
        </m.span>
      </AnimatePresence>
    </span>
  );
}

/** Individual animated reaction pill */
function AnimatedReactionPill({
  reaction,
  hasReacted,
  onToggle,
}: {
  reaction: ReactionGroup;
  hasReacted: boolean;
  onToggle: () => void;
}) {
  return (
    <m.button
      type="button"
      onClick={onToggle}
      variants={reactionVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      whileTap={{ scale: 0.92 }}
      data-reaction-emoji={reaction.emoji}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
        'text-xs transition-colors',
        hasReacted
          ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-600 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60'
          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:bg-gray-700'
      )}
      title={`${reaction.count} ${reaction.count === 1 ? 'reaction' : 'reactions'}`}
    >
      <span className="text-sm">{reaction.emoji}</span>
      <AnimatedCount count={reaction.count} />
    </m.button>
  );
}

export function AnimatedReactionBar({
  messageId,
  reactions,
  currentUserId,
}: AnimatedReactionBarProps) {
  const socket = useSocket();

  const toggleReaction = useCallback(
    (emoji: string) => {
      const group = reactions.find((r) => r.emoji === emoji);
      const hasReacted = group?.userIds.includes(currentUserId) ?? false;

      if (hasReacted) {
        socket.emit('message:unreact', { messageId, emoji });
      } else {
        socket.emit('message:react', { messageId, emoji });
      }
    },
    [messageId, reactions, currentUserId, socket]
  );

  const addReaction = useCallback(
    (emoji: string) => {
      socket.emit('message:react', { messageId, emoji });
    },
    [messageId, socket]
  );

  const hasReactions = reactions.length > 0;

  return (
    <AnimatePresence>
      {hasReactions && (
        <m.div
          key="reaction-bar"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={springGentle}
          style={{ overflow: 'hidden' }}
        >
          <div className="mt-1 flex flex-wrap items-center gap-1 pb-0.5">
            <AnimatePresence mode="popLayout">
              {reactions.map((reaction) => {
                const hasReacted = reaction.userIds.includes(currentUserId);
                return (
                  <AnimatedReactionPill
                    key={reaction.emoji}
                    reaction={reaction}
                    hasReacted={hasReacted}
                    onToggle={() => toggleReaction(reaction.emoji)}
                  />
                );
              })}
            </AnimatePresence>

            <m.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={springBouncy}
            >
              <ReactionPicker onSelect={addReaction} />
            </m.div>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
