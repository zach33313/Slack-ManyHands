/**
 * messages/components/ReactionBar.tsx
 *
 * Horizontal row of reaction pills below a message. Each pill shows emoji + count,
 * highlighted (filled background) if the current user has reacted. Click toggles
 * the user's reaction. A "+" button at the end opens the ReactionPicker to add new reactions.
 */

'use client';

import React, { useCallback } from 'react';
import type { ReactionGroup } from '@/shared/types';
import { cn } from '@/shared/lib/utils';
import { useSocket } from '@/shared/hooks/useSocket';
import { ReactionPicker } from './ReactionPicker';

interface ReactionBarProps {
  messageId: string;
  reactions: ReactionGroup[];
  currentUserId: string;
}

export function ReactionBar({ messageId, reactions, currentUserId }: ReactionBarProps) {
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

  if (reactions.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reactions.map((reaction) => {
        const hasReacted = reaction.userIds.includes(currentUserId);
        return (
          <button
            key={reaction.emoji}
            type="button"
            onClick={() => toggleReaction(reaction.emoji)}
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
            <span>{reaction.count}</span>
          </button>
        );
      })}

      <ReactionPicker onSelect={addReaction} />
    </div>
  );
}
