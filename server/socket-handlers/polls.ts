/**
 * server/socket-handlers/polls.ts
 *
 * Poll event handlers for Socket.IO.
 *
 * Handles all poll-related real-time operations:
 * - poll:vote    — Cast or update a vote on a poll option
 * - poll:unvote  — Remove a vote from a poll option
 * - poll:end     — End a poll early (creator only)
 *
 * After any vote change, aggregates current vote counts and emits
 * poll:updated to the channel room with a full snapshot.
 */

import type { Socket } from 'socket.io';
import { prisma } from '../../shared/lib/prisma';
import { channelRoom } from '../../shared/lib/constants';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  PollVoteGroup,
} from '../../shared/types/socket';

type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/**
 * Aggregates current votes for a poll into PollVoteGroup[].
 */
async function getPollVoteSnapshot(
  pollId: string,
  options: string[]
): Promise<{ votes: PollVoteGroup[]; totalVotes: number }> {
  const allVotes = await prisma.pollVote.findMany({
    where: { pollId },
    select: { option: true, userId: true },
  });

  const totalVotes = allVotes.length;

  // Build a map of option → userIds
  const votesByOption = new Map<string, string[]>();
  for (const opt of options) {
    votesByOption.set(opt, []);
  }
  for (const vote of allVotes) {
    const existing = votesByOption.get(vote.option) ?? [];
    existing.push(vote.userId);
    votesByOption.set(vote.option, existing);
  }

  const votes: PollVoteGroup[] = options.map((opt) => {
    const userIds = votesByOption.get(opt) ?? [];
    return {
      option: opt,
      count: userIds.length,
      userIds,
      percentage:
        totalVotes > 0 ? Math.round((userIds.length / totalVotes) * 100) : 0,
    };
  });

  return { votes, totalVotes };
}

/**
 * Registers poll event handlers on a connected socket.
 */
export function registerPollHandlers(socket: AppSocket): void {
  const userId = socket.data.userId;

  /**
   * poll:vote — Cast or update a vote on a poll option.
   *
   * Validates that the poll exists and is still active.
   * For single-choice semantics (default), removes any existing vote by this
   * user before creating the new one. Re-aggregates and emits poll:updated.
   */
  socket.on('poll:vote', async ({ pollId, option }) => {
    try {
      if (!pollId || !option) {
        console.warn(`[polls] poll:vote — missing pollId or option from user ${userId}`);
        return;
      }

      // Load poll with its parent message to get channelId
      const poll = await prisma.poll.findUnique({
        where: { id: pollId },
        include: {
          message: { select: { channelId: true, userId: true } },
        },
      });

      if (!poll) {
        console.warn(`[polls] poll:vote — poll ${pollId} not found`);
        return;
      }

      if (!poll.isActive) {
        console.warn(`[polls] poll:vote — poll ${pollId} is no longer active`);
        return;
      }

      if (new Date() > poll.endsAt) {
        console.warn(`[polls] poll:vote — poll ${pollId} has expired (endsAt=${poll.endsAt.toISOString()})`);
        // Auto-deactivate
        await prisma.poll.update({ where: { id: pollId }, data: { isActive: false } });
        return;
      }

      // Validate that the option exists in the poll
      let options: string[];
      try {
        options = JSON.parse(poll.options) as string[];
      } catch {
        console.error(`[polls] poll:vote — failed to parse options for poll ${pollId}`);
        return;
      }

      if (!options.includes(option)) {
        console.warn(`[polls] poll:vote — invalid option "${option}" for poll ${pollId}`);
        return;
      }

      if (poll.multiChoice) {
        // Multi-choice: add this vote without clearing others.
        // Upsert avoids a duplicate if the user somehow re-votes the same option.
        await prisma.pollVote.upsert({
          where: { pollId_userId_option: { pollId, userId, option } },
          create: { pollId, userId, option },
          update: {},
        });
      } else {
        // Single-choice: atomically remove all existing votes then insert the new one.
        // Transaction prevents a race condition leaving the user with two votes.
        await prisma.$transaction([
          prisma.pollVote.deleteMany({ where: { pollId, userId } }),
          prisma.pollVote.create({ data: { pollId, userId, option } }),
        ]);
      }

      const { votes, totalVotes } = await getPollVoteSnapshot(pollId, options);

      socket.nsp
        .to(channelRoom(poll.message.channelId))
        .emit('poll:updated', { pollId, votes, totalVotes });
    } catch (err) {
      console.error(`[polls] poll:vote error for user ${userId}:`, err);
    }
  });

  /**
   * poll:unvote — Remove a vote from a poll option.
   *
   * Deletes the PollVote record. Re-aggregates and emits poll:updated.
   */
  socket.on('poll:unvote', async ({ pollId, option }) => {
    try {
      if (!pollId || !option) {
        console.warn(`[polls] poll:unvote — missing pollId or option from user ${userId}`);
        return;
      }

      const poll = await prisma.poll.findUnique({
        where: { id: pollId },
        include: {
          message: { select: { channelId: true } },
        },
      });

      if (!poll) {
        console.warn(`[polls] poll:unvote — poll ${pollId} not found`);
        return;
      }

      if (!poll.isActive) {
        console.warn(`[polls] poll:unvote — poll ${pollId} is no longer active`);
        return;
      }

      if (new Date() > poll.endsAt) {
        console.warn(`[polls] poll:unvote — poll ${pollId} has expired (endsAt=${poll.endsAt.toISOString()})`);
        await prisma.poll.update({ where: { id: pollId }, data: { isActive: false } });
        return;
      }

      let options: string[];
      try {
        options = JSON.parse(poll.options) as string[];
      } catch {
        console.error(`[polls] poll:unvote — failed to parse options for poll ${pollId}`);
        return;
      }

      // Delete the specific vote (unique: pollId + userId + option)
      await prisma.pollVote.deleteMany({
        where: { pollId, userId, option },
      });

      const { votes, totalVotes } = await getPollVoteSnapshot(pollId, options);

      socket.nsp
        .to(channelRoom(poll.message.channelId))
        .emit('poll:updated', { pollId, votes, totalVotes });
    } catch (err) {
      console.error(`[polls] poll:unvote error for user ${userId}:`, err);
    }
  });

  /**
   * poll:end — End a poll early.
   *
   * Verifies the requester is the poll creator (message.userId).
   * Sets isActive=false and emits poll:ended to the channel room.
   */
  socket.on('poll:end', async ({ pollId }) => {
    try {
      if (!pollId) {
        console.warn(`[polls] poll:end — missing pollId from user ${userId}`);
        return;
      }

      const poll = await prisma.poll.findUnique({
        where: { id: pollId },
        include: {
          message: { select: { channelId: true, userId: true } },
        },
      });

      if (!poll) {
        console.warn(`[polls] poll:end — poll ${pollId} not found`);
        return;
      }

      // Only the message/poll creator can end the poll
      if (poll.message.userId !== userId) {
        console.warn(
          `[polls] poll:end — user ${userId} is not the creator of poll ${pollId} (creator: ${poll.message.userId})`
        );
        return;
      }

      await prisma.poll.update({
        where: { id: pollId },
        data: { isActive: false },
      });

      socket.nsp
        .to(channelRoom(poll.message.channelId))
        .emit('poll:ended', { pollId });
    } catch (err) {
      console.error(`[polls] poll:end error for user ${userId}:`, err);
    }
  });
}
