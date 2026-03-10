/**
 * calls/components/HuddleBar.tsx
 *
 * Sticky bar shown at the bottom of a channel view when a huddle is active.
 * Shows participant avatars (max 6), AudioVisualizer, and Join/Leave button.
 * Clicking the bar joins the huddle.
 *
 * Uses useCallContext() for actions (joinHuddle/leaveHuddle) instead of
 * calling useHuddle() directly, to avoid creating a duplicate hook instance
 * (CallProviderInner already mounts useHuddle).
 *
 * Usage:
 *   <HuddleBar channelId={channelId} />
 */

'use client';

import { motion } from 'framer-motion';
import { Headphones, LogOut } from 'lucide-react';
import { useCallStore } from '@/calls/store';
import { useCallContext } from './CallProvider';
import { useAudioLevel } from '@/calls/hooks/useAudioLevel';
import { AudioVisualizer } from './AudioVisualizer';
import { springSnappy, tapScale } from '@/shared/lib/animations';
import { cn } from '@/shared/lib/utils';

interface HuddleBarProps {
  channelId: string;
}

function ParticipantAvatar({ name, image, isMuted }: { name: string; image: string | null; isMuted: boolean }) {
  return (
    <div className="relative">
      <div
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white',
          'ring-2',
          isMuted ? 'ring-zinc-600' : 'ring-green-500'
        )}
      >
        {image ? (
          <img src={image} alt={name} className="h-full w-full rounded-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full bg-zinc-600">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
    </div>
  );
}

export function HuddleBar({ channelId }: HuddleBarProps) {
  const { joinHuddle, leaveHuddle } = useCallContext();
  const localStream = useCallStore((s) => s.localStream);
  const huddleState = useCallStore((s) => s.huddlesByChannel[channelId]);
  const activeHuddleChannelId = useCallStore((s) => s.activeHuddleChannelId);
  const isInThisHuddle = activeHuddleChannelId === channelId;
  const localAudioLevel = useAudioLevel(isInThisHuddle ? localStream : null);

  // Show bar only when there is an active huddle in this channel
  if (!huddleState?.isActive && !isInThisHuddle) return null;

  const visibleParticipants = (huddleState?.participants ?? []).slice(0, 6);
  const overflowCount = (huddleState?.participants?.length ?? 0) - 6;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={springSnappy}
      className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/95 px-3 py-2 backdrop-blur-md"
    >
      {/* Left: Headphone icon + label */}
      <div className="flex items-center gap-2">
        <Headphones className="h-4 w-4 text-green-400" />
        <span className="text-xs font-medium text-zinc-300">Huddle</span>
      </div>

      {/* Center: participant avatars + audio viz */}
      <div className="flex flex-1 items-center gap-2">
        <div className="flex -space-x-1">
          {visibleParticipants.map((p) => (
            <ParticipantAvatar
              key={p.userId}
              name={p.user.name}
              image={p.user.image}
              isMuted={p.isMuted}
            />
          ))}
          {overflowCount > 0 && (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-700 text-xs font-semibold text-zinc-300 ring-2 ring-zinc-900">
              +{overflowCount}
            </div>
          )}
        </div>

        {isInThisHuddle && (
          <AudioVisualizer
            level={localAudioLevel}
            barCount={5}
            width={32}
            height={18}
            color="#22c55e"
          />
        )}
      </div>

      {/* Right: Join / Leave button */}
      <motion.button
        onClick={() => (isInThisHuddle ? leaveHuddle() : joinHuddle(channelId))}
        whileHover={{ scale: 1.04 }}
        whileTap={tapScale}
        transition={springSnappy}
        className={cn(
          'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold',
          isInThisHuddle
            ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
            : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
        )}
      >
        {isInThisHuddle ? (
          <>
            <LogOut className="h-3.5 w-3.5" />
            Leave
          </>
        ) : (
          <>
            <Headphones className="h-3.5 w-3.5" />
            Join
          </>
        )}
      </motion.button>
    </motion.div>
  );
}
