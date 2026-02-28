/**
 * polls/types.ts
 *
 * Types for the polls/voting feature.
 * Polls are attached 1:1 to messages. Options stored as JSON string in DB.
 * Votes broadcast in real-time via poll:vote / poll:updated socket events.
 *
 * Core shared types live in shared/types/index.ts.
 */

// ---------------------------------------------------------------------------
// Domain Types
// ---------------------------------------------------------------------------

/** A poll attached to a message */
export interface Poll {
  id: string;
  messageId: string;
  question: string;
  /** Stored as JSON string in DB, parsed at read boundary */
  options: string[];
  isActive: boolean;
  /** When true, voters may select more than one option */
  multiChoice: boolean;
  endsAt: Date;
  /** Aggregated vote groups for display */
  votes: PollVoteGroup[];
  totalVotes: number;
  createdAt: Date;
}

/** Aggregated votes for a single poll option */
export interface PollVoteGroup {
  option: string;
  count: number;
  userIds: string[];
  /** Computed client-side: count / totalVotes * 100 */
  percentage: number;
}

/** Input for creating a new poll */
export interface CreatePollInput {
  channelId: string;
  question: string;
  /** Min 2, max 10 options */
  options: string[];
  endsAt: Date;
}

/** Raw vote record from the database */
export interface PollVote {
  id: string;
  pollId: string;
  userId: string;
  option: string;
  votedAt: Date;
}
