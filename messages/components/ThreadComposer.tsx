/**
 * messages/components/ThreadComposer.tsx
 *
 * Simplified message input for thread replies.
 * Uses a textarea with send button. On submit, emits message:send via Socket.IO
 * with the parentId set to the thread's parent message ID.
 *
 * Also supports "Also send to #channel" checkbox which sends the reply
 * to both the thread and the main channel.
 */

'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Send } from 'lucide-react';
import type { TiptapJSON } from '@/shared/types';
import { cn } from '@/shared/lib/utils';
import { useSocket } from '@/shared/hooks/useSocket';

interface ThreadComposerProps {
  /** ID of the parent message this thread belongs to */
  parentId: string;
  /** Channel ID where the parent message lives */
  channelId: string;
  /** Channel name for the "Also send to #channel" label */
  channelName?: string;
}

export function ThreadComposer({
  parentId,
  channelId,
  channelName,
}: ThreadComposerProps) {
  const [text, setText] = useState('');
  const [alsoSendToChannel, setAlsoSendToChannel] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const socket = useSocket();

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Build Tiptap JSON content from plain text
    const content: TiptapJSON = {
      type: 'doc',
      content: trimmed.split('\n').map((line) => ({
        type: 'paragraph',
        content: line ? [{ type: 'text', text: line }] : [],
      })),
    };

    const contentPayload = content as unknown as Record<string, unknown>;

    // Send as thread reply
    socket.emit('message:send', {
      channelId,
      content: contentPayload,
      parentId,
    });

    // If "Also send to #channel" is checked, send a copy to the main channel
    if (alsoSendToChannel) {
      socket.emit('message:send', {
        channelId,
        content: contentPayload,
      });
    }

    setText('');
    textareaRef.current?.focus();
  }, [text, parentId, channelId, alsoSendToChannel, socket]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  // Auto-resize textarea
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      const textarea = e.target;
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    },
    []
  );

  return (
    <div className="border-t border-border p-3">
      <div
        className={cn(
          'flex items-end gap-2 rounded-lg border border-border bg-background px-3 py-2',
          'focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400'
        )}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Reply..."
          rows={1}
          className={cn(
            'flex-1 resize-none bg-transparent text-sm outline-none',
            'placeholder:text-muted-foreground'
          )}
          style={{ maxHeight: 160 }}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim()}
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
            'transition-colors',
            text.trim()
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-muted text-muted-foreground'
          )}
          aria-label="Send reply"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      {/* Also send to channel checkbox */}
      <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={alsoSendToChannel}
          onChange={(e) => setAlsoSendToChannel(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-border text-blue-600 focus:ring-blue-500"
        />
        Also send to #{channelName ?? 'channel'}
      </label>
    </div>
  );
}
