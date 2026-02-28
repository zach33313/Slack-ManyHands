'use client';

/**
 * search/components/SearchModal.tsx
 *
 * Global search modal opened via Cmd+K (Mac) / Ctrl+K (Windows/Linux).
 * Features:
 *   - Full-width modal with auto-focused search input
 *   - 300ms debounced search via the useSearch hook
 *   - Recent searches stored in localStorage (max 10)
 *   - Filter chips: in:#channel, from:@user, has:file
 *   - Keyboard navigation: up/down arrows, Enter to select, Escape to close
 *   - Click result to navigate to channel/message
 */

import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Hash, User, Paperclip, Clock, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/shared/lib/utils';
import { useSearch } from '@/shared/hooks/useSearch';
import { SearchResultItem } from './SearchResultItem';

const RECENT_SEARCHES_KEY = 'slack-clone-recent-searches';
const MAX_RECENT_SEARCHES = 10;

interface SearchModalProps {
  workspaceId: string;
  workspaceSlug: string;
}

function getRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  if (typeof window === 'undefined' || !query.trim()) return;
  try {
    const recent = getRecentSearches().filter((s) => s !== query);
    recent.unshift(query);
    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(recent.slice(0, MAX_RECENT_SEARCHES))
    );
  } catch {
    // Ignore localStorage errors
  }
}

function clearRecentSearches() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Ignore
  }
}

export function SearchModal({ workspaceId, workspaceSlug }: SearchModalProps) {
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const {
    query,
    setQuery,
    results,
    isLoading,
    error,
    total,
  } = useSearch(workspaceId);

  // Load recent searches when modal opens
  useEffect(() => {
    if (open) {
      setRecentSearches(getRecentSearches());
      setSelectedIndex(-1);
      // Focus input after dialog animation
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Global keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [results]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && resultsRef.current) {
      const items = resultsRef.current.querySelectorAll('[data-search-result]');
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery('');
    setSelectedIndex(-1);
  }, [setQuery]);

  const navigateToMessage = useCallback(
    (channelId: string, messageId: string) => {
      saveRecentSearch(query);
      handleClose();
      router.push(`/${workspaceSlug}/channel/${channelId}?scrollTo=${messageId}`);
    },
    [query, handleClose, router, workspaceSlug]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const resultCount = results.length;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < resultCount - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < resultCount) {
            const result = results[selectedIndex];
            navigateToMessage(result.message.channelId, result.message.id);
          }
          break;
        case 'Escape':
          handleClose();
          break;
      }
    },
    [results, selectedIndex, navigateToMessage, handleClose]
  );

  const addFilter = useCallback(
    (filter: string) => {
      const currentQuery = query.trim();
      const newQuery = currentQuery ? `${filter} ${currentQuery}` : filter;
      setQuery(newQuery);
      inputRef.current?.focus();
    },
    [query, setQuery]
  );

  const handleRecentSearchClick = useCallback(
    (search: string) => {
      setQuery(search);
      inputRef.current?.focus();
    },
    [setQuery]
  );

  const handleClearRecent = useCallback(() => {
    clearRecentSearches();
    setRecentSearches([]);
  }, []);

  const showResults = query.trim().length > 0;
  const showRecent = !showResults && recentSearches.length > 0;

  return (
    <>
      {/* Trigger button for sidebar */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-muted-foreground rounded-md hover:bg-accent transition-colors"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search</span>
        <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">&#8984;</span>K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-2xl p-0 gap-0 overflow-hidden"
          onKeyDown={handleKeyDown}
        >
          <DialogTitle className="sr-only">Search messages</DialogTitle>

          {/* Search input */}
          <div className="flex items-center border-b px-3">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search messages..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 h-12 px-3 text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground"
            />
            {isLoading && (
              <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />
            )}
            {query && !isLoading && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter chips */}
          <div className="flex items-center gap-1.5 px-3 py-2 border-b">
            <span className="text-xs text-muted-foreground">Filters:</span>
            <button
              type="button"
              onClick={() => addFilter('in:#')}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border hover:bg-accent transition-colors"
            >
              <Hash className="h-3 w-3" />
              in:channel
            </button>
            <button
              type="button"
              onClick={() => addFilter('from:@')}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border hover:bg-accent transition-colors"
            >
              <User className="h-3 w-3" />
              from:user
            </button>
            <button
              type="button"
              onClick={() => addFilter('has:file')}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border hover:bg-accent transition-colors"
            >
              <Paperclip className="h-3 w-3" />
              has:file
            </button>
          </div>

          {/* Results area */}
          <div
            ref={resultsRef}
            className="max-h-[400px] overflow-y-auto"
          >
            {/* Recent searches */}
            {showRecent && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Recent searches
                  </span>
                  <button
                    type="button"
                    onClick={handleClearRecent}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-0.5">
                  {recentSearches.map((search, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleRecentSearchClick(search)}
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors"
                    >
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate">{search}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Search results */}
            {showResults && !isLoading && results.length > 0 && (
              <div className="p-2">
                <div className="px-3 py-1.5">
                  <span className="text-xs text-muted-foreground">
                    {total} result{total !== 1 ? 's' : ''}
                  </span>
                </div>
                {results.map((result, index) => (
                  <div key={result.message.id} data-search-result>
                    <SearchResultItem
                      result={result}
                      query={query}
                      isSelected={index === selectedIndex}
                      onClick={() =>
                        navigateToMessage(
                          result.message.channelId,
                          result.message.id
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Loading state */}
            {showResults && isLoading && results.length === 0 && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                <span className="text-sm">Searching...</span>
              </div>
            )}

            {/* Empty state */}
            {showResults && !isLoading && results.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Search className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No results found for &ldquo;{query}&rdquo;</p>
                <p className="text-xs mt-1">
                  Try different keywords or filters
                </p>
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="flex flex-col items-center justify-center py-12 text-destructive">
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* Empty initial state */}
            {!showResults && !showRecent && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Search className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">Search for messages</p>
                <p className="text-xs mt-1">
                  Use filters like <code className="bg-muted px-1 rounded">in:#channel</code>{' '}
                  <code className="bg-muted px-1 rounded">from:@user</code>{' '}
                  <code className="bg-muted px-1 rounded">has:file</code>
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-3 py-2 border-t text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded border bg-muted font-mono text-[10px]">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded border bg-muted font-mono text-[10px]">↵</kbd>
              open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 rounded border bg-muted font-mono text-[10px]">esc</kbd>
              close
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
