/**
 * messages/components/ReactionPicker.tsx
 *
 * Emoji picker popup using emoji-mart. Opens on click, renders the full
 * @emoji-mart/react Picker component, positioned via Radix Popover.
 * On select, calls the provided onSelect callback with the chosen emoji string.
 *
 * When workspaceId is provided, a "Standard / Custom" tab bar is shown so
 * users can pick from the workspace's custom emoji as well.
 */

'use client';

import React, { useState, useCallback } from 'react';
import * as Popover from '@radix-ui/react-popover';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { useTheme } from 'next-themes';
import { cn } from '@/shared/lib/utils';
import { CustomEmojiPicker } from '@/workspaces/components/CustomEmojiPicker';

interface ReactionPickerProps {
  /** Called with the emoji string when an emoji is selected */
  onSelect: (emoji: string) => void;
  /** Custom trigger element. If not provided, renders a "+" button */
  trigger?: React.ReactNode;
  /** Additional class names for the trigger button */
  triggerClassName?: string;
  /**
   * Workspace ID. When provided, a "Custom" tab is added alongside the
   * standard emoji picker so users can react with workspace custom emoji.
   */
  workspaceId?: string;
}

interface EmojiMartEmoji {
  id: string;
  name: string;
  native: string;
  unified: string;
  shortcodes: string;
}

type PickerTab = 'standard' | 'custom';

export function ReactionPicker({
  onSelect,
  trigger,
  triggerClassName,
  workspaceId,
}: ReactionPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PickerTab>('standard');
  const { resolvedTheme } = useTheme();

  const handleEmojiSelect = useCallback(
    (emoji: EmojiMartEmoji) => {
      onSelect(emoji.native);
      setOpen(false);
    },
    [onSelect]
  );

  const handleCustomSelect = useCallback(
    (emojiRef: string) => {
      onSelect(emojiRef);
      setOpen(false);
    },
    [onSelect]
  );

  const standardPicker = (
    <Picker
      data={data}
      onEmojiSelect={handleEmojiSelect}
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      previewPosition="none"
      skinTonePosition="none"
      maxFrequentRows={2}
      perLine={8}
    />
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
          {workspaceId ? (
            <div className="bg-background border rounded-lg shadow-lg overflow-hidden">
              {/* Tab bar */}
              <div className="flex border-b" role="tablist" aria-label="Emoji type">
                <button
                  role="tab"
                  aria-selected={activeTab === 'standard'}
                  onClick={() => setActiveTab('standard')}
                  className={cn(
                    'flex-1 px-3 py-2 text-xs font-medium transition-colors',
                    activeTab === 'standard'
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Standard
                </button>
                <button
                  role="tab"
                  aria-selected={activeTab === 'custom'}
                  onClick={() => setActiveTab('custom')}
                  className={cn(
                    'flex-1 px-3 py-2 text-xs font-medium transition-colors',
                    activeTab === 'custom'
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Custom
                </button>
              </div>

              {/* Tab content */}
              {activeTab === 'standard' ? (
                standardPicker
              ) : (
                <CustomEmojiPicker workspaceId={workspaceId} onSelect={handleCustomSelect} />
              )}
            </div>
          ) : (
            standardPicker
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
