/**
 * shared/hooks/useDebounce.ts
 *
 * Generic debounce hook — delays updating a value until `delay` ms after
 * the last change. Used for search inputs and typing indicators.
 *
 * Usage:
 *   const debouncedQuery = useDebounce(searchQuery, 300)
 *   useEffect(() => { fetchResults(debouncedQuery) }, [debouncedQuery])
 */

'use client';

import { useState, useEffect } from 'react';

/**
 * Returns a debounced copy of `value` that only updates after `delay` milliseconds
 * of inactivity.
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 300)
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
