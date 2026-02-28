'use client';

/**
 * bookmarks/components/BookmarksPanel.tsx
 *
 * Sidebar panel for saved messages (bookmarks).
 * Groups bookmarks by channel, sorted by save date.
 * Accessible from the bookmark icon in the sidebar header.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, Search, X, Hash, Loader2, Trash2 } from 'lucide-react';
import { useAppStore } from '@/store';
import { cn } from '@/shared/lib/utils';
import { getBookmarks, removeBookmark } from '../actions';
import type { BookmarkWithMessage } from '../types';
import {
  staggerContainer,
  staggerItem,
  panelSlideRight,
} from '@/shared/lib/animations';
import { formatDistanceToNow } from 'date-fns';

interface BookmarksPanelProps {
  workspaceId: string;
  workspaceSlug: string;
  onClose: () => void;
}

export function BookmarksPanel({
  workspaceId,
  workspaceSlug,
  onClose,
}: BookmarksPanelProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkWithMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Load bookmarks on mount
  useEffect(() => {
    let cancelled = false;
    async function loadBookmarks() {
      setLoading(true);
      try {
        const data = await getBookmarks(workspaceId);
        if (!cancelled) setBookmarks(data);
      } catch (err) {
        console.error('Failed to load bookmarks:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadBookmarks();
    return () => { cancelled = true; };
  }, [workspaceId]);

  const handleRemove = useCallback(async (bookmark: BookmarkWithMessage) => {
    setRemovingId(bookmark.id);
    try {
      await removeBookmark(bookmark.messageId);
      setBookmarks((prev) => prev.filter((b) => b.id !== bookmark.id));
    } catch (err) {
      console.error('Failed to remove bookmark:', err);
    } finally {
      setRemovingId(null);
    }
  }, []);

  // Filter by search query
  const filtered = searchQuery.trim()
    ? bookmarks.filter(
        (bm) =>
          bm.contentPreview.toLowerCase().includes(searchQuery.toLowerCase()) ||
          bm.channelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          bm.message.author.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : bookmarks;

  // Group by channel
  const grouped = filtered.reduce<Record<string, BookmarkWithMessage[]>>(
    (acc, bm) => {
      const key = bm.channelId;
      if (!acc[key]) acc[key] = [];
      acc[key].push(bm);
      return acc;
    },
    {}
  );

  const channelGroups = Object.entries(grouped).map(([channelId, items]) => ({
    channelId,
    channelName: items[0].channelName,
    items,
  }));

  return (
    <motion.div
      className="flex flex-col w-[320px] border-l bg-background h-full shrink-0"
      variants={panelSlideRight}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <Bookmark className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Saved Items</h3>
          {bookmarks.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({bookmarks.length})
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close saved items"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b shrink-0">
        <div className="flex items-center gap-2 rounded-md border px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search saved items..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Bookmark className="h-8 w-8 text-muted-foreground" />
            </div>
            {searchQuery ? (
              <>
                <p className="text-sm font-medium">No results found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Try different search terms
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">No saved items yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Hover over a message and click the bookmark icon to save it here
                </p>
              </>
            )}
          </div>
        )}

        {!loading && channelGroups.length > 0 && (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="py-2"
          >
            {channelGroups.map(({ channelId, channelName, items }) => (
              <motion.div key={channelId} variants={staggerItem} className="mb-4">
                {/* Channel header */}
                <div className="flex items-center gap-1.5 px-4 py-1.5">
                  <Hash className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {channelName}
                  </span>
                </div>

                {/* Bookmark items */}
                <div className="space-y-0.5 px-2">
                  {items.map((bm) => (
                    <BookmarkItem
                      key={bm.id}
                      bookmark={bm}
                      workspaceSlug={workspaceSlug}
                      isRemoving={removingId === bm.id}
                      onRemove={handleRemove}
                    />
                  ))}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// BookmarkItem sub-component
// ---------------------------------------------------------------------------

interface BookmarkItemProps {
  bookmark: BookmarkWithMessage;
  workspaceSlug: string;
  isRemoving: boolean;
  onRemove: (bookmark: BookmarkWithMessage) => void;
}

function BookmarkItem({
  bookmark,
  workspaceSlug,
  isRemoving,
  onRemove,
}: BookmarkItemProps) {
  const [hovered, setHovered] = useState(false);

  const savedDate = formatDistanceToNow(new Date(bookmark.createdAt), {
    addSuffix: true,
  });

  const messageDate = formatDistanceToNow(new Date(bookmark.message.createdAt), {
    addSuffix: true,
  });

  return (
    <div
      className="group relative flex flex-col rounded-md px-2 py-2 hover:bg-muted transition-colors"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Author + date */}
      <div className="flex items-center gap-1.5 mb-1">
        <div className="h-4 w-4 rounded-sm bg-muted-foreground/20 flex items-center justify-center text-[8px] font-medium shrink-0">
          {bookmark.message.author.image ? (
            <img
              src={bookmark.message.author.image}
              alt={bookmark.message.author.name}
              className="h-4 w-4 rounded-sm object-cover"
            />
          ) : (
            bookmark.message.author.name.charAt(0).toUpperCase()
          )}
        </div>
        <span className="text-xs font-medium truncate">
          {bookmark.message.author.name}
        </span>
        <span className="text-xs text-muted-foreground ml-auto shrink-0">
          {messageDate}
        </span>
      </div>

      {/* Message preview */}
      <p className="text-xs text-foreground/80 line-clamp-3 leading-relaxed">
        {bookmark.contentPreview || (
          <span className="text-muted-foreground italic">
            [No text content]
          </span>
        )}
      </p>

      {/* Saved timestamp */}
      <p className="text-[10px] text-muted-foreground mt-1">
        Saved {savedDate}
      </p>

      {/* Remove button (shown on hover) */}
      <AnimatePresence>
        {hovered && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.1 }}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(bookmark);
            }}
            disabled={isRemoving}
            className="absolute top-2 right-2 rounded-md p-1 bg-background border hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors text-muted-foreground"
            aria-label="Remove bookmark"
          >
            {isRemoving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
