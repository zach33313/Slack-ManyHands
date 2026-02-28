'use client';

/**
 * custom-emojis/components/CustomEmojiPicker.tsx
 *
 * Renders the workspace's custom emoji as a scrollable button grid.
 * Fetches GET /api/custom-emojis?workspaceId=<id> on mount.
 * Calls onSelect(':name:') when an emoji is clicked.
 *
 * Designed to be embedded as a section inside ReactionPicker and
 * EmojiPickerButton — renders nothing when no custom emojis exist.
 */

import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CustomEmojiItem {
  id: string;
  name: string;
  imageUrl: string;
}

interface CustomEmojiPickerProps {
  /** Workspace to fetch emojis for */
  workspaceId: string;
  /**
   * Called with the emoji shortcode string `:name:` when the user selects
   * a custom emoji. Matches the onSelect(emoji: string) contract of
   * ReactionPicker and EmojiPickerButton.
   */
  onSelect: (emojiCode: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CustomEmojiPicker({ workspaceId, onSelect }: CustomEmojiPickerProps) {
  const [emojis, setEmojis] = useState<CustomEmojiItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch workspace custom emojis from the API
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `/api/custom-emojis?workspaceId=${encodeURIComponent(workspaceId)}`
        );
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) {
          setEmojis(body.data ?? []);
        }
      } catch {
        // Non-fatal: silently hide the section on network error
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const handleClick = useCallback(
    (name: string) => {
      onSelect(`:${name}:`);
    },
    [onSelect]
  );

  // Show a minimal spinner while loading
  if (loading) {
    return (
      <div className="flex items-center justify-center py-2 px-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Render nothing when the workspace has no custom emojis
  if (emojis.length === 0) return null;

  return (
    <div className="border-b border-border pb-2">
      {/* Section heading */}
      <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Custom
      </p>

      {/* Emoji grid — scrollable if there are many */}
      <div className="flex flex-wrap gap-0.5 px-2 max-h-20 overflow-y-auto">
        {emojis.map((emoji) => (
          <button
            key={emoji.id}
            type="button"
            title={`:${emoji.name}:`}
            aria-label={`:${emoji.name}:`}
            onClick={() => handleClick(emoji.name)}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded hover:bg-muted transition-colors"
          >
            <img
              src={emoji.imageUrl}
              alt={`:${emoji.name}:`}
              className="h-6 w-6 object-contain"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
