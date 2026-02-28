'use client';

/**
 * polls/components/PollDisplay.tsx
 *
 * Interactive poll rendered inside a message. Shows options with animated bars,
 * vote counts, voter avatars. Emits poll:vote / poll:unvote via Socket.IO.
 * Listens for poll:updated to refresh in real-time. Ended polls show a badge + winner.
 *
 * Multi-choice polls (poll.multiChoice === true):
 *   - Renders checkbox-style selection
 *   - Allows toggling individual options independently
 *   - Emits poll:vote to add a single option, poll:unvote to remove one
 *
 * Single-choice polls (poll.multiChoice === false):
 *   - Renders radio-style selection
 *   - Clicking a new option replaces the previous vote
 *   - Clicking the same option removes the vote
 */

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Trophy, CheckCircle2, Circle } from 'lucide-react';
import { useSocket } from '@/shared/hooks/useSocket';
import type { Poll, PollVoteGroup } from '../types';
import type { PollUpdatedPayload } from '@/shared/types/socket';

interface PollDisplayProps {
  poll: Poll;
  /** The current user's ID to highlight their votes */
  currentUserId: string;
}

interface VoterAvatarsProps {
  userIds: string[];
  max?: number;
}

function VoterAvatars({ userIds, max = 3 }: VoterAvatarsProps) {
  const shown = userIds.slice(0, max);
  const extra = userIds.length - max;

  return (
    <div className="flex items-center -space-x-1">
      {shown.map((uid) => (
        <div
          key={uid}
          className="w-4 h-4 rounded-full bg-primary/20 border border-background flex items-center justify-center text-[8px] font-bold text-primary"
          title={uid}
        >
          {uid.charAt(0).toUpperCase()}
        </div>
      ))}
      {extra > 0 && (
        <div className="w-4 h-4 rounded-full bg-muted border border-background flex items-center justify-center text-[8px] text-muted-foreground">
          +{extra}
        </div>
      )}
    </div>
  );
}

export function PollDisplay({ poll: initialPoll, currentUserId }: PollDisplayProps) {
  const [poll, setPoll] = useState<Poll>(initialPoll);
  const [isVoting, setIsVoting] = useState(false);
  const socket = useSocket();

  // Listen for poll:updated events
  useEffect(() => {
    if (!socket) return;

    function onPollUpdated(payload: PollUpdatedPayload) {
      if (payload.pollId !== poll.id) return;

      setPoll((prev) => ({
        ...prev,
        votes: payload.votes.map((v) => ({
          option: v.option,
          count: v.count,
          userIds: v.userIds,
          percentage: v.percentage,
        })),
        totalVotes: payload.totalVotes,
      }));
    }

    function onPollEnded(payload: { pollId: string }) {
      if (payload.pollId !== poll.id) return;
      setPoll((prev) => ({ ...prev, isActive: false }));
    }

    socket.on('poll:updated', onPollUpdated);
    socket.on('poll:ended', onPollEnded);

    return () => {
      socket.off('poll:updated', onPollUpdated);
      socket.off('poll:ended', onPollEnded);
    };
  }, [socket, poll.id]);

  /**
   * Returns all options the current user has voted for.
   * For single-choice polls this will have at most 1 element.
   * For multi-choice polls it may have 0–N elements.
   */
  const getUserVotes = useCallback((): string[] => {
    return poll.votes
      .filter((vg) => vg.userIds.includes(currentUserId))
      .map((vg) => vg.option);
  }, [poll.votes, currentUserId]);

  /**
   * Handle vote toggle for a given option.
   *
   * Multi-choice: toggle the individual option independently.
   *   - Not yet voted → emit poll:vote for this option only
   *   - Already voted → emit poll:unvote for this option only
   *   Other votes are untouched.
   *
   * Single-choice: replace existing vote or unvote.
   *   - Same option as existing vote → emit poll:unvote
   *   - Different option → emit poll:unvote for old + poll:vote for new
   *   - No existing vote → emit poll:vote
   */
  async function handleVote(option: string) {
    if (!socket || !poll.isActive || isVoting) return;

    const userVotes = getUserVotes();
    setIsVoting(true);

    try {
      if (poll.multiChoice) {
        // Multi-choice: toggle this single option
        const alreadyVoted = userVotes.includes(option);

        if (alreadyVoted) {
          // Remove vote for this option
          socket.emit('poll:unvote', { pollId: poll.id, option });
          // Optimistic update
          setPoll((prev) => {
            const newTotal = Math.max(0, prev.totalVotes - 1);
            return {
              ...prev,
              votes: prev.votes.map((vg) => {
                if (vg.option === option) {
                  const newCount = Math.max(0, vg.count - 1);
                  return {
                    ...vg,
                    count: newCount,
                    userIds: vg.userIds.filter((id) => id !== currentUserId),
                    percentage: newTotal > 0 ? Math.round((newCount / newTotal) * 100) : 0,
                  };
                }
                return {
                  ...vg,
                  percentage: newTotal > 0 ? Math.round((vg.count / newTotal) * 100) : 0,
                };
              }),
              totalVotes: newTotal,
            };
          });
        } else {
          // Add vote for this option without clearing others
          socket.emit('poll:vote', { pollId: poll.id, option });
          // Optimistic update
          setPoll((prev) => {
            const newTotal = prev.totalVotes + 1;
            return {
              ...prev,
              votes: prev.votes.map((vg) => {
                if (vg.option === option) {
                  const newCount = vg.count + 1;
                  return {
                    ...vg,
                    count: newCount,
                    userIds: [...vg.userIds, currentUserId],
                    percentage: newTotal > 0 ? Math.round((newCount / newTotal) * 100) : 0,
                  };
                }
                return {
                  ...vg,
                  percentage: newTotal > 0 ? Math.round((vg.count / newTotal) * 100) : 0,
                };
              }),
              totalVotes: newTotal,
            };
          });
        }
      } else {
        // Single-choice: replace or unvote
        const currentVote = userVotes[0] ?? null;

        if (currentVote === option) {
          // Unvote same option
          socket.emit('poll:unvote', { pollId: poll.id, option });
          setPoll((prev) => ({
            ...prev,
            votes: prev.votes.map((vg) =>
              vg.option === option
                ? {
                    ...vg,
                    count: Math.max(0, vg.count - 1),
                    userIds: vg.userIds.filter((id) => id !== currentUserId),
                    percentage:
                      prev.totalVotes > 1
                        ? Math.round(((vg.count - 1) / (prev.totalVotes - 1)) * 100)
                        : 0,
                  }
                : vg
            ),
            totalVotes: Math.max(0, prev.totalVotes - 1),
          }));
        } else {
          // Switch to new option (remove old, add new)
          if (currentVote) {
            socket.emit('poll:unvote', { pollId: poll.id, option: currentVote });
          }
          socket.emit('poll:vote', { pollId: poll.id, option });
          // Optimistic update: total stays the same when switching votes
          setPoll((prev) => {
            const newTotal = currentVote ? prev.totalVotes : prev.totalVotes + 1;
            return {
              ...prev,
              votes: prev.votes.map((vg) => {
                if (vg.option === option) {
                  const newCount = vg.count + 1;
                  return {
                    ...vg,
                    count: newCount,
                    userIds: [...vg.userIds, currentUserId],
                    percentage: newTotal > 0 ? Math.round((newCount / newTotal) * 100) : 0,
                  };
                }
                if (vg.option === currentVote) {
                  const newCount = Math.max(0, vg.count - 1);
                  return {
                    ...vg,
                    count: newCount,
                    userIds: vg.userIds.filter((id) => id !== currentUserId),
                    percentage: newTotal > 0 ? Math.round((newCount / newTotal) * 100) : 0,
                  };
                }
                return {
                  ...vg,
                  percentage: newTotal > 0 ? Math.round((vg.count / newTotal) * 100) : 0,
                };
              }),
              totalVotes: newTotal,
            };
          });
        }
      }
    } finally {
      // Reset after a brief delay to prevent rapid double-clicks
      setTimeout(() => setIsVoting(false), 400);
    }
  }

  const userVotes = getUserVotes();
  const hasVoted = userVotes.length > 0;

  // Find winner option for ended poll
  const winnerOption =
    !poll.isActive && poll.votes.length > 0
      ? poll.votes.reduce((a, b) => (b.count > a.count ? b : a), poll.votes[0])
      : null;

  return (
    <div className="mt-2 p-3 rounded-lg border bg-muted/30 max-w-sm space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-foreground">{poll.question}</p>
          {poll.multiChoice && poll.isActive && (
            <p className="text-xs text-muted-foreground">Select all that apply</p>
          )}
        </div>
        {!poll.isActive && (
          <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs font-medium text-muted-foreground">
            Poll Ended
          </span>
        )}
      </div>

      {/* Options */}
      <div className="space-y-2">
        {poll.votes.map((vg: PollVoteGroup) => {
          const isMyVote = vg.userIds.includes(currentUserId);
          const isWinner = !poll.isActive && winnerOption?.option === vg.option && vg.count > 0;

          return (
            <button
              key={vg.option}
              className={`w-full text-left rounded-md overflow-hidden border transition-colors ${
                poll.isActive
                  ? 'hover:border-primary cursor-pointer'
                  : 'cursor-default'
              } ${isMyVote ? 'border-primary' : 'border-transparent'}`}
              onClick={() => handleVote(vg.option)}
              disabled={!poll.isActive || isVoting}
            >
              <div className="relative px-3 py-2 bg-background">
                {/* Progress bar */}
                <motion.div
                  className={`absolute inset-0 ${
                    isMyVote ? 'bg-primary/15' : 'bg-muted/50'
                  }`}
                  initial={false}
                  animate={{ width: `${vg.percentage}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />

                {/* Content row */}
                <div className="relative flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {isWinner && (
                      <Trophy className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
                    )}
                    {poll.isActive && poll.multiChoice && (
                      /* Checkbox-style indicator for multi-choice */
                      isMyVote ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      )
                    )}
                    {poll.isActive && !poll.multiChoice && isMyVote && (
                      /* Radio-style indicator for single-choice */
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                    )}
                    <span className="text-sm truncate">{vg.option}</span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {vg.userIds.length > 0 && (
                      <VoterAvatars userIds={vg.userIds} max={3} />
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {vg.count} · {vg.percentage}%
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <p className="text-xs text-muted-foreground">
        {poll.totalVotes} {poll.totalVotes === 1 ? 'vote' : 'votes'}
        {poll.isActive && !hasVoted && !poll.multiChoice && ' · Click to vote'}
        {poll.isActive && !hasVoted && poll.multiChoice && ' · Select your choices'}
        {poll.isActive && hasVoted && !poll.multiChoice && ' · Click to change your vote'}
        {poll.isActive && hasVoted && poll.multiChoice && ` · ${userVotes.length} option${userVotes.length === 1 ? '' : 's'} selected`}
      </p>
    </div>
  );
}
