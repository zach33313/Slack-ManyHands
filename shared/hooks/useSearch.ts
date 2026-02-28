'use client';

/**
 * shared/hooks/useSearch.ts
 *
 * React hook for searching messages within a workspace.
 * Debounces the query input by 300ms before calling the search API.
 * Manages loading, error, and result states.
 *
 * Usage:
 *   const { query, setQuery, results, isLoading, filters, setFilters } = useSearch('workspace-id')
 */

import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from '@/shared/hooks/useDebounce';
import type { SearchResult, SearchFilters } from '@/search/types';

interface UseSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  results: SearchResult[];
  isLoading: boolean;
  error: string | null;
  filters: SearchFilters;
  setFilters: (f: SearchFilters) => void;
  hasMore: boolean;
  total: number;
  loadMore: () => void;
}

export function useSearch(workspaceId: string): UseSearchReturn {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<SearchFilters>({ query: '' });
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const debouncedQuery = useDebounce(query, 300);

  // Fetch search results when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim() || !workspaceId) {
      setResults([]);
      setError(null);
      setHasMore(false);
      setTotal(0);
      setCursor(null);
      return;
    }

    let cancelled = false;

    async function fetchResults() {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ q: debouncedQuery });
        const res = await fetch(
          `/api/workspaces/${workspaceId}/search?${params.toString()}`
        );

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || `Search failed (${res.status})`);
        }

        const data = await res.json();
        if (!cancelled) {
          if (data.ok) {
            setResults(data.data.results);
            setCursor(data.data.cursor);
            setHasMore(data.data.hasMore);
            setTotal(data.data.total);
          } else {
            setError(data.error || 'Search failed');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Search failed');
          setResults([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchResults();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, workspaceId]);

  // Load more results (pagination)
  const loadMore = useCallback(async () => {
    if (!cursor || isLoading || !debouncedQuery.trim()) return;

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        q: debouncedQuery,
        cursor,
      });
      const res = await fetch(
        `/api/workspaces/${workspaceId}/search?${params.toString()}`
      );

      if (!res.ok) throw new Error('Failed to load more results');

      const data = await res.json();
      if (data.ok) {
        setResults((prev) => [...prev, ...data.data.results]);
        setCursor(data.data.cursor);
        setHasMore(data.data.hasMore);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more');
    } finally {
      setIsLoading(false);
    }
  }, [cursor, isLoading, debouncedQuery, workspaceId]);

  return {
    query,
    setQuery,
    results,
    isLoading,
    error,
    filters,
    setFilters,
    hasMore,
    total,
    loadMore,
  };
}
