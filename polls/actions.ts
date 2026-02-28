'use server';

/**
 * polls/actions.ts
 *
 * Server Actions for the polls/voting feature.
 * Polls are attached 1:1 to messages. Real-time updates via Socket.IO poll:vote/unvote events.
 */

import { prisma } from '@/shared/lib/prisma';
import { auth } from '@/auth/auth';
import type { Poll, PollVoteGroup } from './types';

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return userId;
}

// ---------------------------------------------------------------------------
// Aggregation helper
// ---------------------------------------------------------------------------

function aggregateVotes(
  votes: Array<{ option: string; userId: string }>,
  options: string[]
): { voteGroups: PollVoteGroup[]; total: number } {
  const total = votes.length;
  const byOption = new Map<string, string[]>();
  for (const opt of options) byOption.set(opt, []);
  for (const vote of votes) {
    const existing = byOption.get(vote.option) ?? [];
    existing.push(vote.userId);
    byOption.set(vote.option, existing);
  }
  const voteGroups: PollVoteGroup[] = options.map((opt) => {
    const userIds = byOption.get(opt) ?? [];
    return {
      option: opt,
      count: userIds.length,
      userIds,
      percentage: total > 0 ? Math.round((userIds.length / total) * 100) : 0,
    };
  });
  return { voteGroups, total };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Create a new poll attached to a message.
 * The message must already exist. endsAt defaults to 7 days from now if not provided.
 */
export async function createPoll(
  messageId: string,
  question: string,
  options: string[],
  multiChoice: boolean = false,
  endsAt?: Date
): Promise<Poll> {
  await requireUserId();

  if (!messageId) throw new Error('messageId is required');
  if (!question.trim()) throw new Error('Question is required');
  if (options.length < 2) throw new Error('At least 2 options required');
  if (options.length > 10) throw new Error('Maximum 10 options allowed');

  const deduped = [...new Set(options.map((o) => o.trim()).filter(Boolean))];
  if (deduped.length < 2) throw new Error('Options must be unique and non-empty');

  const pollEndsAt = endsAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const poll = await prisma.poll.create({
    data: {
      messageId,
      question: question.trim(),
      options: JSON.stringify(deduped),
      isActive: true,
      multiChoice,
      endsAt: pollEndsAt,
    },
  });

  return {
    id: poll.id,
    messageId: poll.messageId,
    question: poll.question,
    options: deduped,
    isActive: poll.isActive,
    multiChoice: poll.multiChoice,
    endsAt: poll.endsAt,
    votes: deduped.map((opt) => ({
      option: opt,
      count: 0,
      userIds: [],
      percentage: 0,
    })),
    totalVotes: 0,
    createdAt: poll.createdAt,
  };
}

/**
 * Get a poll with aggregated votes.
 */
export async function getPoll(pollId: string): Promise<Poll | null> {
  await requireUserId();

  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: {
      votes: { select: { option: true, userId: true } },
    },
  });

  if (!poll) return null;

  let options: string[];
  try {
    options = JSON.parse(poll.options) as string[];
  } catch {
    options = [];
  }

  const { voteGroups, total } = aggregateVotes(poll.votes, options);

  return {
    id: poll.id,
    messageId: poll.messageId,
    question: poll.question,
    options,
    isActive: poll.isActive,
    multiChoice: poll.multiChoice,
    endsAt: poll.endsAt,
    votes: voteGroups,
    totalVotes: total,
    createdAt: poll.createdAt,
  };
}

/**
 * End a poll early. Only the message creator can end their own poll.
 */
export async function endPoll(pollId: string): Promise<void> {
  const userId = await requireUserId();

  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: { message: { select: { userId: true } } },
  });

  if (!poll) throw new Error('Poll not found');
  if (poll.message.userId !== userId) {
    throw new Error('Only the poll creator can end the poll');
  }

  await prisma.poll.update({
    where: { id: pollId },
    data: { isActive: false },
  });
}
