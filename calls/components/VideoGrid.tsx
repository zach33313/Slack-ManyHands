/**
 * calls/components/VideoGrid.tsx
 *
 * Adaptive CSS grid layout for call participants.
 * Layout rules:
 *   1 participant  → full size (1×1)
 *   2 participants → side by side (2×1)
 *   3–4            → 2×2 grid
 *   5–6            → 3×2 grid
 *
 * Usage:
 *   <VideoGrid participants={participants} localParticipant={localParticipant} />
 */

'use client';

import { cn } from '@/shared/lib/utils';
import { ParticipantTile } from './ParticipantTile';
import type { CallParticipant } from '@/calls/types';

interface VideoGridProps {
  /** Remote participants */
  participants: CallParticipant[];
  /** Local user's participant object */
  localParticipant?: CallParticipant;
  className?: string;
}

function getGridClass(count: number): string {
  if (count === 1) return 'grid-cols-1 grid-rows-1';
  if (count === 2) return 'grid-cols-2 grid-rows-1';
  if (count <= 4) return 'grid-cols-2 grid-rows-2';
  return 'grid-cols-3 grid-rows-2';
}

export function VideoGrid({ participants, localParticipant, className }: VideoGridProps) {
  const allParticipants = localParticipant
    ? [localParticipant, ...participants]
    : participants;

  const count = allParticipants.length;
  const gridClass = getGridClass(count);

  if (count === 0) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        Waiting for participants…
      </div>
    );
  }

  return (
    <div className={cn('grid h-full gap-1', gridClass, className)}>
      {allParticipants.map((participant) => (
        <ParticipantTile
          key={participant.userId}
          participant={participant}
          isLocal={participant.userId === localParticipant?.userId}
          className="h-full w-full"
        />
      ))}
    </div>
  );
}
