'use client';

/**
 * scheduling/components/ScheduleButton.tsx
 *
 * Clock icon button in the composer toolbar that opens the SchedulePicker popover.
 */

import { useState } from 'react';
import { Clock } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { SchedulePicker } from './SchedulePicker';
import type { TiptapJSON } from '@/shared/types';

interface ScheduleButtonProps {
  /** Channel to schedule the message in */
  channelId: string;
  /** Current composer content (Tiptap JSON) */
  contentJson: TiptapJSON | null;
  /** Plain text version of the current content */
  contentPlain: string;
  /** Called after a message is successfully scheduled (e.g. to clear the composer) */
  onScheduled?: () => void;
  /** Whether the button is disabled (e.g. composer is empty) */
  disabled?: boolean;
}

export function ScheduleButton({
  channelId,
  contentJson,
  contentPlain,
  onScheduled,
  disabled,
}: ScheduleButtonProps) {
  const [open, setOpen] = useState(false);

  function handleScheduled() {
    setOpen(false);
    onScheduled?.();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          disabled={disabled}
          title="Schedule message"
          aria-label="Schedule message"
        >
          <Clock className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        side="top"
        align="start"
        sideOffset={8}
      >
        {contentJson && (
          <SchedulePicker
            channelId={channelId}
            contentJson={contentJson}
            contentPlain={contentPlain}
            onScheduled={handleScheduled}
            onCancel={() => setOpen(false)}
          />
        )}
        {!contentJson && (
          <div className="p-4 text-sm text-muted-foreground text-center">
            Write a message first to schedule it.
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
