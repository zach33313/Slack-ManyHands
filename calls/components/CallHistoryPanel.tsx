/**
 * calls/components/CallHistoryPanel.tsx
 *
 * Lists recent calls from the store's callHistory array.
 * Shows call type icon, participant names, duration, timestamp, and status badge.
 * Provides a "Call again" action for completed calls.
 *
 * Usage:
 *   <CallHistoryPanel onCallAgain={(channelId, type) => startCall(channelId, type)} />
 */

'use client';

import { formatDistanceToNow } from 'date-fns';
import { Phone, PhoneOff, PhoneMissed, Video, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCallStore } from '@/calls/store';
import { staggerContainer, staggerItem, tapScale, springSnappy } from '@/shared/lib/animations';
import { cn } from '@/shared/lib/utils';
import type { CallHistoryEntry, CallType } from '@/calls/types';

interface CallHistoryPanelProps {
  onCallAgain?: (channelId: string, type: CallType) => void;
  className?: string;
}

function StatusIcon({ status }: { status: CallHistoryEntry['status'] }) {
  if (status === 'completed') return <Phone className="h-4 w-4 text-green-400" />;
  if (status === 'missed') return <PhoneMissed className="h-4 w-4 text-yellow-400" />;
  return <PhoneOff className="h-4 w-4 text-red-400" />;
}

function StatusBadge({ status }: { status: CallHistoryEntry['status'] }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'completed' && 'bg-green-500/10 text-green-400',
        status === 'missed' && 'bg-yellow-500/10 text-yellow-400',
        status === 'declined' && 'bg-red-500/10 text-red-400'
      )}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

interface CallEntryProps {
  entry: CallHistoryEntry;
  onCallAgain?: () => void;
}

function CallEntry({ entry, onCallAgain }: CallEntryProps) {
  return (
    <motion.div
      variants={staggerItem}
      className="flex items-center gap-3 rounded-lg p-2 hover:bg-zinc-800/50"
    >
      {/* Type icon */}
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800">
        {entry.type === '1:1' ? (
          <Phone className="h-4 w-4 text-zinc-400" />
        ) : (
          <Video className="h-4 w-4 text-zinc-400" />
        )}
      </div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <StatusIcon status={entry.status} />
          <StatusBadge status={entry.status} />
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Clock className="h-3 w-3" />
          <span>{formatDuration(entry.duration)}</span>
          <span>·</span>
          <span>{formatDistanceToNow(entry.endedAt, { addSuffix: true })}</span>
        </div>
      </div>

      {/* Call again button (only for non-missed calls) */}
      {onCallAgain && entry.status === 'completed' && (
        <motion.button
          onClick={onCallAgain}
          whileHover={{ scale: 1.04 }}
          whileTap={tapScale}
          transition={springSnappy}
          className="flex-shrink-0 rounded-full bg-zinc-800 p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-white"
          aria-label="Call again"
        >
          <Phone className="h-3.5 w-3.5" />
        </motion.button>
      )}
    </motion.div>
  );
}

export function CallHistoryPanel({ onCallAgain, className }: CallHistoryPanelProps) {
  const callHistory = useCallStore((s) => s.callHistory);

  if (callHistory.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-2 py-12 text-center', className)}>
        <Phone className="h-8 w-8 text-zinc-600" />
        <p className="text-sm font-medium text-zinc-500">No recent calls</p>
        <p className="text-xs text-zinc-600">Your call history will appear here</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Recent Calls
      </p>
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="flex flex-col"
      >
        {callHistory.map((entry) => (
          <CallEntry
            key={`${entry.callId}-${entry.endedAt.getTime()}`}
            entry={entry}
            onCallAgain={
              onCallAgain && entry.status === 'completed'
                ? () => onCallAgain(entry.channelId, entry.type)
                : undefined
            }
          />
        ))}
      </motion.div>
    </div>
  );
}
