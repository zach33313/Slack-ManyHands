'use client';

/**
 * polls/components/PollResults.tsx
 *
 * Read-only poll results bar chart, shown when a poll has ended.
 * Displays each option with a horizontal bar proportional to its vote count.
 */

import { Trophy } from 'lucide-react';
import type { Poll, PollVoteGroup } from '../types';

interface PollResultsProps {
  poll: Poll;
}

export function PollResults({ poll }: PollResultsProps) {
  const winner =
    poll.votes.length > 0
      ? poll.votes.reduce((a, b) => (b.count > a.count ? b : a), poll.votes[0]!)
      : null;

  return (
    <div className="p-3 rounded-lg border bg-muted/20 max-w-sm space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{poll.question}</p>
        <span className="flex-shrink-0 text-xs text-muted-foreground">
          {poll.totalVotes} {poll.totalVotes === 1 ? 'vote' : 'votes'}
        </span>
      </div>

      <div className="space-y-2">
        {poll.votes.map((vg: PollVoteGroup) => {
          const isWinner =
            winner?.option === vg.option && vg.count > 0;
          return (
            <div key={vg.option} className="space-y-0.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1">
                  {isWinner && <Trophy className="h-3 w-3 text-yellow-500" />}
                  <span className={isWinner ? 'font-semibold' : ''}>{vg.option}</span>
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {vg.count} ({vg.percentage}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isWinner ? 'bg-primary' : 'bg-primary/40'
                  }`}
                  style={{ width: `${vg.percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
