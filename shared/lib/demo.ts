/**
 * shared/lib/demo.ts
 *
 * Demo mode utilities. When DEMO_MODE=true, destructive mutations
 * (registration, workspace/channel creation, file uploads) are blocked.
 * Messaging, reactions, and calls remain enabled.
 */

import { NextResponse } from 'next/server';
import { err } from '@/shared/types/api';

export const IS_DEMO = process.env.DEMO_MODE === 'true';

export function demoBlock(action: string = 'This action') {
  return NextResponse.json(
    err('DEMO_MODE', `${action} is disabled in demo mode.`),
    { status: 403 }
  );
}
