/**
 * messages/components/ReactionPicker.tsx
 *
 * Emoji picker popup using emoji-mart. Opens on click, renders the full
 * @emoji-mart/react Picker component, positioned via Radix Popover.
 * On select, calls the provided onSelect callback with the chosen emoji string.
 */

'use client';

import React, { useState, useCallback } from 'react';
import * as Popover from '@radix-ui/react-popover';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { useTheme } from 'next-themes';
import { cn } from '@/shared/lib/utils';

interface ReactionPickerProps {
  /** Called with the native emoji character when an emoji is selected */
  onSelect: (emoji: string) => void;
  /** Custom trigger element. If not provided, renders a "+" button */
  trigger?: React.ReactNode;
  /** Additional class names for the trigger button */
  triggerClassName?: string;
}

interface EmojiMartEmoji {
  id: string;
  name: string;
  native: string;
  unified: string;
  shortcodes: string;
}

export function ReactionPicker({ onSelect, trigger, triggerClassName }: ReactionPickerProps) {
  const [open, setOpen] = useState(false);
  const { resolvedTheme } = useTheme();

  const handleEmojiSelect = useCallback(
    (emoji: EmojiMartEmoji) => {
      onSelect(emoji.native);
      setOpen(false);
    },
    [onSelect]
  );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {trigger ?? (
          <button
            type="button"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full',
              'border border-border bg-background text-sm text-muted-foreground',
              'transition-colors hover:border-border hover:bg-muted hover:text-foreground',
              triggerClassName
            )}
            aria-label="Add reaction"
          >
            +
          </button>
        )}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={4}
          className="z-50 animate-in fade-in-0 zoom-in-95"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Picker
            data={data}
            onEmojiSelect={handleEmojiSelect}
            theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
            previewPosition="none"
            skinTonePosition="none"
            maxFrequentRows={2}
            perLine={8}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
