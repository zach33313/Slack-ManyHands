/**
 * app/api/polls/route.ts
 *
 * POST /api/polls          — Create a new poll
 * GET  /api/polls/:pollId  — Get a poll with votes
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth/auth';
import { createPoll, getPoll, endPoll } from '@/polls/actions';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { messageId, question, options, multiChoice, endsAt } = body;

    if (!messageId || !question || !options) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const poll = await createPoll(
      messageId,
      question,
      options,
      !!multiChoice,
      endsAt ? new Date(endsAt) : undefined
    );

    return NextResponse.json({ poll }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create poll';
    console.error('[api/polls] POST error:', err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pollId = req.nextUrl.searchParams.get('pollId');
  if (!pollId) {
    return NextResponse.json({ error: 'pollId is required' }, { status: 400 });
  }

  try {
    const poll = await getPoll(pollId);
    if (!poll) {
      return NextResponse.json({ error: 'Poll not found' }, { status: 404 });
    }
    return NextResponse.json({ poll });
  } catch (err) {
    console.error('[api/polls] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch poll' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { pollId, action } = body;

    if (!pollId || action !== 'end') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    await endPoll(pollId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update poll';
    console.error('[api/polls] PATCH error:', err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
