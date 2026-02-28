'use client';

/**
 * gifs/components/GifSearchPanel.tsx
 *
 * 300px overlay above the composer. Allows searching Tenor GIFs and inserting
 * the selected GIF into the Tiptap editor as an image node.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GifGrid } from './GifGrid';
import type { TenorGif, GifSearchResult } from '../types';

type Tab = 'trending' | 'reactions' | 'memes';

const TAB_LABELS: Record<Tab, string> = {
  trending: 'Trending',
  reactions: 'Reactions',
  memes: 'Memes',
};

const TAB_QUERIES: Record<Tab, string> = {
  trending: '',
  reactions: 'reactions',
  memes: 'memes',
};

interface GifSearchPanelProps {
  /** Called when user clicks a GIF — insert into Tiptap */
  onSelect: (gif: TenorGif) => void;
  /** Close the panel */
  onClose: () => void;
}

export function GifSearchPanel({ onSelect, onClose }: GifSearchPanelProps) {
  const [tab, setTab] = useState<Tab>('trending');
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<TenorGif[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchGifs = useCallback(async (searchQuery: string, activeTab: Tab) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) {
        params.set('q', searchQuery.trim());
      } else if (activeTab !== 'trending') {
        params.set('q', TAB_QUERIES[activeTab]);
      }
      // For trending with no query, let server handle it as featured
      if (!searchQuery.trim() && activeTab === 'trending') {
        params.set('trending', '1');
      }

      const res = await fetch(`/api/gifs?${params.toString()}`);
      if (!res.ok) throw new Error('GIF fetch failed');
      const data: GifSearchResult = await res.json();
      setGifs(data.results);
    } catch {
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchGifs(query, tab);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, tab, fetchGifs]);

  function handleSelect(gif: TenorGif) {
    onSelect(gif);
    onClose();
  }

  return (
    <div className="absolute bottom-full left-0 mb-2 w-[320px] bg-popover border rounded-lg shadow-lg z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 p-2 border-b">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search GIFs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-7 h-7 text-sm"
            autoFocus
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          onClick={onClose}
          aria-label="Close GIF picker"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Tabs */}
      {!query.trim() && (
        <div className="flex border-b">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                tab === t
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      <ScrollArea className="h-[280px]">
        <GifGrid gifs={gifs} onSelect={handleSelect} loading={loading} />
      </ScrollArea>
    </div>
  );
}
