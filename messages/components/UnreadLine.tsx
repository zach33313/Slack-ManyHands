/**
 * messages/components/UnreadLine.tsx
 *
 * Red horizontal line with "New" label, inserted in the message list
 * at the position of the first unread message.
 */

'use client';

import React from 'react';

export function UnreadLine() {
  return (
    <div className="flex items-center gap-2 px-4 py-1" aria-label="New messages">
      <div className="h-px flex-1 bg-red-500" />
      <span className="shrink-0 text-xs font-semibold uppercase text-red-500">
        New
      </span>
      <div className="h-px flex-1 bg-red-500" />
    </div>
  );
}
