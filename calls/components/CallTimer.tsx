/**
 * calls/components/CallTimer.tsx
 *
 * MM:SS elapsed timer starting from call connect time.
 * Uses setInterval for second-by-second updates.
 *
 * Usage:
 *   <CallTimer startedAt={call.startedAt} />
 */

'use client';

import { useState, useEffect } from 'react';

interface CallTimerProps {
  /** The Date when the call connected (not when it was initiated) */
  startedAt: Date;
  className?: string;
}

/**
 * Formats a duration in seconds as MM:SS (or H:MM:SS for calls over an hour).
 */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');

  if (h > 0) {
    return `${h}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function CallTimer({ startedAt, className }: CallTimerProps) {
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - startedAt.getTime()) / 1000)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <span className={className ?? 'font-mono text-sm tabular-nums text-white/80'}>
      {formatDuration(elapsed)}
    </span>
  );
}
