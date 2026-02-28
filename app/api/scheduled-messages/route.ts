/**
 * app/api/scheduled-messages/route.ts
 *
 * GET    /api/scheduled-messages?channelId=<id>  — List pending scheduled messages
 * POST   /api/scheduled-messages                  — Create a new scheduled message
 * DELETE /api/scheduled-messages?id=<id>          — Cancel a scheduled message
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth/auth';
import {
  getScheduledMessages,
  createScheduledMessage,
  cancelScheduledMessage,
} from '@/scheduling/actions';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const channelId = req.nextUrl.searchParams.get('channelId') ?? undefined;

  try {
    const messages = await getScheduledMessages(channelId);
    return NextResponse.json({ messages });
  } catch (err) {
    console.error('[api/scheduled-messages] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch scheduled messages' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { channelId, contentJson, contentPlain, scheduledFor } = body;

    if (!channelId || !contentJson || !scheduledFor) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const message = await createScheduledMessage(
      channelId,
      contentJson,
      contentPlain ?? '',
      new Date(scheduledFor)
    );

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create scheduled message';
    console.error('[api/scheduled-messages] POST error:', err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  try {
    await cancelScheduledMessage(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to cancel scheduled message';
    console.error('[api/scheduled-messages] DELETE error:', err);
    const status =
      message === 'Scheduled message not found' ? 404 :
      message === 'Not authorized to cancel this message' ? 403 :
      400;
    return NextResponse.json({ error: message }, { status });
  }
}
