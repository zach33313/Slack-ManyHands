'use client';

/**
 * shared/hooks/useCelebrationReactions.ts
 *
 * Listens to Socket.IO reaction:updated events and triggers confetti
 * when a celebration emoji reaction is added live (not on page load).
 *
 * Celebration emojis: 🎉 🎊 🥳 🏆 🚀 ✨
 *
 * Usage:
 *   useCelebrationReactions();  // call once at workspace layout level
 */

import { useEffect, useRef } from 'react';
import { getSocket } from '@/shared/lib/socket-client';
import { triggerCelebrationConfetti } from '@/shared/lib/animations';
import type { ReactionGroup } from '@/shared/types';

const CELEBRATION_EMOJIS = new Set(['🎉', '🎊', '🥳', '🏆', '🚀', '✨']);

interface ReactionsUpdatedPayload {
  messageId: string;
  reactions: ReactionGroup[];
}

/**
 * Track reaction state per message so we can diff live updates.
 * Key: messageId, Value: Map<emoji, count>
 */
const reactionSnapshotCache = new Map<string, Map<string, number>>();

/**
 * Stores a snapshot of reactions for a message (called on initial page load).
 * This establishes the baseline so we only confetti on NEW reactions, not existing ones.
 */
export function seedReactionSnapshot(messageId: string, reactions: ReactionGroup[]): void {
  const map = new Map<string, number>();
  for (const r of reactions) {
    map.set(r.emoji, r.count);
  }
  reactionSnapshotCache.set(messageId, map);
}

export function useCelebrationReactions(): void {
  // Track if this is the first mount so we don't trigger on SSR hydration
  const isHydratedRef = useRef(false);

  useEffect(() => {
    // Mark as hydrated after a brief delay to avoid false positives on page load
    const hydrateTimer = setTimeout(() => {
      isHydratedRef.current = true;
    }, 2000);

    return () => clearTimeout(hydrateTimer);
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const handleReactionUpdated = (payload: ReactionsUpdatedPayload) => {
      // Don't trigger on initial data load
      if (!isHydratedRef.current) return;

      const { messageId, reactions } = payload;

      // Get the previous snapshot for this message
      const prevSnapshot = reactionSnapshotCache.get(messageId);

      // Check if any celebration emoji was newly added or count increased
      let shouldCelebrate = false;
      for (const reaction of reactions) {
        if (!CELEBRATION_EMOJIS.has(reaction.emoji)) continue;

        const prevCount = prevSnapshot?.get(reaction.emoji) ?? 0;
        if (reaction.count > prevCount) {
          shouldCelebrate = true;
          break;
        }
      }

      // Update the snapshot
      const newSnapshot = new Map<string, number>();
      for (const r of reactions) {
        newSnapshot.set(r.emoji, r.count);
      }
      reactionSnapshotCache.set(messageId, newSnapshot);

      // Trigger confetti if a celebration reaction was added
      if (shouldCelebrate) {
        // Try to find the reaction button position on screen
        // Look for reaction buttons with the celebration emoji
        let origin = { x: 0.5, y: 0.6 };

        const buttons = document.querySelectorAll('[data-reaction-emoji]');
        for (const btn of buttons) {
          const emoji = btn.getAttribute('data-reaction-emoji');
          if (emoji && CELEBRATION_EMOJIS.has(emoji)) {
            const rect = btn.getBoundingClientRect();
            origin = {
              x: (rect.left + rect.width / 2) / window.innerWidth,
              y: (rect.top + rect.height / 2) / window.innerHeight,
            };
            break;
          }
        }

        triggerCelebrationConfetti(origin).catch(console.error);
      }
    };

    socket.on('reaction:updated', handleReactionUpdated);
    return () => {
      socket.off('reaction:updated', handleReactionUpdated);
    };
  }, []);
}
