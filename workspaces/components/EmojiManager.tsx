'use client';

/**
 * workspaces/components/EmojiManager.tsx
 *
 * Grid of all workspace custom emoji.
 * Shows image, :shortcode:, uploader name, upload date, delete button (admin only).
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { Trash2, SmilePlus, Loader2 } from 'lucide-react';
import { staggerContainer, staggerItem } from '@/shared/lib/animations';
import { cn } from '@/shared/lib/utils';
import { toast } from 'sonner';

interface CustomEmojiItem {
  id: string;
  name: string;
  imageUrl: string;
  createdById: string;
  createdAt: Date | string;
  createdBy: {
    name: string | null;
    image: string | null;
  };
}

interface EmojiManagerProps {
  emojis: CustomEmojiItem[];
  workspaceId: string;
  isAdmin: boolean;
  currentUserId: string;
  maxCount?: number;
  onDelete: (emojiId: string) => void;
}

async function deleteCustomEmoji(workspaceId: string, emojiId: string): Promise<void> {
  const response = await fetch(`/api/workspaces/custom-emoji/${emojiId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Delete failed' }));
    throw new Error(data.error ?? 'Delete failed');
  }
}

function EmojiCard({
  emoji,
  isAdmin,
  onDelete,
}: {
  emoji: CustomEmojiItem;
  isAdmin: boolean;
  onDelete: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete :${emoji.name}:? This cannot be undone.`)) return;
    setIsDeleting(true);
    try {
      onDelete();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <motion.div
      variants={staggerItem}
      layout
      className="group relative flex flex-col items-center gap-2 p-3 border rounded-lg hover:border-primary/40 hover:bg-muted/30 transition-colors"
    >
      {/* Emoji image */}
      <div className="w-12 h-12 flex items-center justify-center rounded-md bg-muted">
        <img
          src={emoji.imageUrl}
          alt={`:${emoji.name}:`}
          className="w-10 h-10 object-contain"
          loading="lazy"
        />
      </div>

      {/* Shortcode */}
      <p className="text-xs font-mono text-center font-medium truncate w-full text-center">
        :{emoji.name}:
      </p>

      {/* Uploader info */}
      <p className="text-[10px] text-muted-foreground text-center">
        by {emoji.createdBy.name ?? 'Unknown'}
      </p>
      <p className="text-[10px] text-muted-foreground">
        {formatDistanceToNow(new Date(emoji.createdAt), { addSuffix: true })}
      </p>

      {/* Delete button (admin only) */}
      {isAdmin && (
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className={cn(
            'absolute top-1.5 right-1.5 p-1 rounded',
            'opacity-0 group-hover:opacity-100 transition-opacity',
            'text-muted-foreground hover:text-destructive hover:bg-destructive/10'
          )}
          title={`Delete :${emoji.name}:`}
        >
          {isDeleting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Trash2 className="w-3 h-3" />
          )}
        </button>
      )}
    </motion.div>
  );
}

export function EmojiManager({
  emojis,
  workspaceId,
  isAdmin,
  currentUserId,
  maxCount = 100,
  onDelete,
}: EmojiManagerProps) {
  const [localEmojis, setLocalEmojis] = useState<CustomEmojiItem[]>(emojis);
  const [filter, setFilter] = useState('');

  const filteredEmojis = filter
    ? localEmojis.filter((e) =>
        e.name.toLowerCase().includes(filter.toLowerCase())
      )
    : localEmojis;

  const handleDelete = async (emojiId: string, emojiName: string) => {
    try {
      await deleteCustomEmoji(workspaceId, emojiId);
      setLocalEmojis((prev) => prev.filter((e) => e.id !== emojiId));
      onDelete(emojiId);
      toast.success(`Deleted :${emojiName}:`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with count and search */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SmilePlus className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {localEmojis.length}/{maxCount} emoji
          </span>
          {localEmojis.length >= maxCount && (
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              Limit reached
            </span>
          )}
        </div>
        <input
          type="text"
          placeholder="Search emoji…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary w-48"
        />
      </div>

      {/* Emoji grid */}
      {filteredEmojis.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {filter ? (
            <p className="text-sm">No emoji match &quot;{filter}&quot;</p>
          ) : (
            <div className="space-y-2">
              <SmilePlus className="w-10 h-10 mx-auto opacity-30" />
              <p className="text-sm">No custom emoji yet.</p>
              <p className="text-xs">Upload your first emoji above.</p>
            </div>
          )}
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2"
        >
          <AnimatePresence mode="popLayout">
            {filteredEmojis.map((emoji) => (
              <EmojiCard
                key={emoji.id}
                emoji={emoji}
                isAdmin={isAdmin || emoji.createdById === currentUserId}
                onDelete={() => handleDelete(emoji.id, emoji.name)}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
