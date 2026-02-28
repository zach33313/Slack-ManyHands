'use client';

import React from 'react';
import { Hash, MessageSquare, Paperclip } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { formatRelativeTime } from '@/shared/lib/utils';
import type { SearchResult } from '@/search/types';

interface SearchResultItemProps {
  result: SearchResult;
  query: string;
  isSelected: boolean;
  onClick: () => void;
}

/**
 * Highlight matching text in a string.
 * Wraps matched portions in <mark> tags with a yellow background.
 */
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) {
    return <>{text}</>;
  }

  const words = query.trim().split(/\s+/).filter(Boolean);
  // Escape regex special characters
  const escapedWords = words.map((w) =>
    w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  const pattern = new RegExp(`(${escapedWords.join('|')})`, 'gi');
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = words.some(
          (w) => part.toLowerCase() === w.toLowerCase()
        );
        return isMatch ? (
          <mark
            key={i}
            className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5 dark:bg-yellow-800 dark:text-yellow-100"
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        );
      })}
    </>
  );
}

/**
 * Individual search result component.
 *
 * Displays channel name, author info, timestamp, and a highlighted
 * preview of the matching message text.
 */
export function SearchResultItem({
  result,
  query,
  isSelected,
  onClick,
}: SearchResultItemProps) {
  const { message, channelName, highlights } = result;
  const previewText = highlights[0] || message.contentPlain.slice(0, 150);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-md transition-colors cursor-pointer',
        'hover:bg-accent focus:outline-none focus:bg-accent',
        isSelected && 'bg-accent'
      )}
    >
      {/* Header: channel name + timestamp */}
      <div className="flex items-center gap-2 mb-0.5">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Hash className="h-3 w-3" />
          <span>{channelName}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatRelativeTime(new Date(message.createdAt))}
        </span>
      </div>

      {/* Author info */}
      <div className="flex items-center gap-2 mb-1">
        {message.author.image ? (
          <img
            src={message.author.image}
            alt={message.author.name}
            className="h-5 w-5 rounded-full"
          />
        ) : (
          <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-medium text-primary">
            {message.author.name.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-sm font-medium">{message.author.name}</span>

        {/* Indicators */}
        <div className="flex items-center gap-1 ml-auto">
          {message.fileCount > 0 && (
            <Paperclip className="h-3 w-3 text-muted-foreground" />
          )}
          {message.parentId && (
            <MessageSquare className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Message preview with highlights */}
      <p className="text-sm text-muted-foreground line-clamp-2">
        <HighlightedText text={previewText} query={query} />
      </p>
    </button>
  );
}
