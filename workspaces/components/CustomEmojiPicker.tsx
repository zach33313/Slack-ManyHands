'use client';

/**
 * workspaces/components/CustomEmojiPicker.tsx
 *
 * Displays a workspace's custom emoji as a scrollable grid.
 * Fetches emoji from GET /api/custom-emojis?workspaceId=<id>.
 * Calls onSelect("custom_<id>") when an emoji is clicked.
 */

import { useState, useEffect } from 'react';
import { Loader2, SmilePlus } from 'lucide-react';

interface CustomEmoji {
  id: string;
  name: string;
  imageUrl: string;
}

export interface CustomEmojiPickerProps {
  workspaceId: string;
  /** Called with "custom_<id>" when an emoji is selected */
  onSelect: (emojiRef: string) => void;
}

export function CustomEmojiPicker({ workspaceId, onSelect }: CustomEmojiPickerProps) {
  const [emojis, setEmojis] = useState<CustomEmoji[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/custom-emojis?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch custom emoji');
        return r.json();
      })
      .then((data) => {
        setEmojis(data.data ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load custom emoji');
        setLoading(false);
      });
  }, [workspaceId]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center gap-2 p-4 text-muted-foreground"
        data-testid="custom-emoji-loading"
      >
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-xs">Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-xs text-destructive" data-testid="custom-emoji-error">
        {error}
      </div>
    );
  }

  if (emojis.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-2 p-4 text-muted-foreground"
        data-testid="custom-emoji-empty"
      >
        <SmilePlus className="w-6 h-6 opacity-40" />
        <p className="text-xs">No custom emoji yet</p>
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-8 gap-1 p-2 max-h-48 overflow-y-auto"
      data-testid="custom-emoji-grid"
    >
      {emojis.map((emoji) => (
        <button
          key={emoji.id}
          type="button"
          title={`:${emoji.name}:`}
          onClick={() => onSelect(`custom_${emoji.id}`)}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-muted transition-colors"
          data-testid="custom-emoji-item"
          data-emoji-name={emoji.name}
        >
          <img
            src={emoji.imageUrl}
            alt={`:${emoji.name}:`}
            className="w-6 h-6 object-contain"
          />
        </button>
      ))}
    </div>
  );
}
