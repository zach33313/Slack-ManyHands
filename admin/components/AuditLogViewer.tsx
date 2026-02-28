'use client';

/**
 * admin/components/AuditLogViewer.tsx
 *
 * Scrollable audit log list with infinite scroll.
 * Each entry shows: action icon, description, timestamp.
 * Filter by action type.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import {
  Shield, UserMinus, UserPlus, Hash, Settings,
  AlertCircle, ChevronDown, Loader2, RefreshCw,
} from 'lucide-react';
import { staggerContainer, staggerItem } from '@/shared/lib/animations';
import type { AuditLogEntry } from '../types';
import { cn } from '@/shared/lib/utils';

// ---------------------------------------------------------------------------
// Action metadata
// ---------------------------------------------------------------------------

interface ActionMeta {
  icon: React.ReactNode;
  color: string;
  label: string;
}

const ACTION_META: Record<string, ActionMeta> = {
  MEMBER_ROLE_CHANGED: {
    icon: <Shield className="w-3.5 h-3.5" />,
    color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    label: 'Role Changed',
  },
  MEMBER_REMOVED: {
    icon: <UserMinus className="w-3.5 h-3.5" />,
    color: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    label: 'Member Removed',
  },
  MEMBER_JOINED: {
    icon: <UserPlus className="w-3.5 h-3.5" />,
    color: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    label: 'Member Joined',
  },
  CHANNEL_ARCHIVED: {
    icon: <Hash className="w-3.5 h-3.5" />,
    color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    label: 'Channel Archived',
  },
  CHANNEL_CREATED: {
    icon: <Hash className="w-3.5 h-3.5" />,
    color: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    label: 'Channel Created',
  },
  SETTINGS_UPDATED: {
    icon: <Settings className="w-3.5 h-3.5" />,
    color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
    label: 'Settings Updated',
  },
};

function getActionMeta(action: string): ActionMeta {
  return ACTION_META[action] ?? {
    icon: <AlertCircle className="w-3.5 h-3.5" />,
    color: 'bg-muted text-muted-foreground',
    label: action.replace(/_/g, ' '),
  };
}

// ---------------------------------------------------------------------------
// Description formatter
// ---------------------------------------------------------------------------

function formatDescription(entry: AuditLogEntry): string {
  const actor = entry.actor.name;
  const changes = entry.changes;

  switch (entry.action) {
    case 'MEMBER_ROLE_CHANGED': {
      const from = (changes?.role as { from?: string })?.from ?? 'unknown';
      const to = (changes?.role as { to?: string })?.to ?? 'unknown';
      const target = (changes?.targetName as string) ?? 'a member';
      return `${actor} changed ${target}'s role from ${from} to ${to}`;
    }
    case 'MEMBER_REMOVED': {
      const target = (changes?.targetName as string) ?? 'a member';
      return `${actor} removed ${target} from the workspace`;
    }
    case 'MEMBER_JOINED': {
      return `${actor} joined the workspace`;
    }
    case 'CHANNEL_ARCHIVED': {
      const name = (changes?.channelName as string) ?? 'a channel';
      return `${actor} archived channel #${name}`;
    }
    case 'CHANNEL_CREATED': {
      const name = (changes?.channelName as string) ?? 'a channel';
      return `${actor} created channel #${name}`;
    }
    case 'SETTINGS_UPDATED': {
      return `${actor} updated workspace settings`;
    }
    default:
      return `${actor} performed ${entry.action.replace(/_/g, ' ').toLowerCase()}`;
  }
}

// ---------------------------------------------------------------------------
// Single entry component
// ---------------------------------------------------------------------------

function AuditLogEntryRow({ entry }: { entry: AuditLogEntry }) {
  const meta = getActionMeta(entry.action);
  const description = formatDescription(entry);

  return (
    <motion.div
      variants={staggerItem}
      className="flex items-start gap-3 py-3 border-b last:border-b-0"
    >
      {/* Icon */}
      <div
        className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
          meta.color
        )}
      >
        {meta.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm">{description}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
        </p>
      </div>

      {/* Action label */}
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0 hidden sm:block">
        {meta.label}
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface AuditLogViewerProps {
  workspaceId: string;
  initialEntries: AuditLogEntry[];
  initialNextCursor: string | null;
}

const ACTION_FILTER_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'MEMBER_ROLE_CHANGED', label: 'Role Changes' },
  { value: 'MEMBER_REMOVED', label: 'Removals' },
  { value: 'MEMBER_JOINED', label: 'Joins' },
  { value: 'CHANNEL_ARCHIVED', label: 'Channel Archived' },
  { value: 'CHANNEL_CREATED', label: 'Channel Created' },
  { value: 'SETTINGS_UPDATED', label: 'Settings Updated' },
];

export function AuditLogViewer({
  workspaceId,
  initialEntries,
  initialNextCursor,
}: AuditLogViewerProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>(initialEntries);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [isLoading, setIsLoading] = useState(false);
  const [actionFilter, setActionFilter] = useState('');
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchMore = useCallback(async () => {
    if (isLoading || !nextCursor) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        cursor: nextCursor,
        limit: '50',
        ...(actionFilter ? { action: actionFilter } : {}),
      });
      const res = await fetch(`/api/workspaces/${workspaceId}/audit-log?${params}`);
      if (!res.ok) throw new Error('Failed to fetch audit log');
      const data = await res.json() as { entries: AuditLogEntry[]; nextCursor: string | null };
      setEntries((prev) => [...prev, ...data.entries]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      console.error('[AuditLogViewer] Failed to load more:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, nextCursor, workspaceId, actionFilter]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current || !nextCursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) fetchMore();
      },
      { threshold: 0.5 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [fetchMore, nextCursor]);

  // Re-fetch when filter changes
  const handleFilterChange = async (filter: string) => {
    setActionFilter(filter);
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '50',
        ...(filter ? { action: filter } : {}),
      });
      const res = await fetch(`/api/workspaces/${workspaceId}/audit-log?${params}`);
      if (!res.ok) throw new Error('Failed to fetch audit log');
      const data = await res.json() as { entries: AuditLogEntry[]; nextCursor: string | null };
      setEntries(data.entries);
      setNextCursor(data.nextCursor);
    } catch (err) {
      console.error('[AuditLogViewer] Filter fetch failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter client-side for instant feedback
  const filteredEntries = actionFilter
    ? entries.filter((e) => e.action === actionFilter)
    : entries;

  return (
    <div className="space-y-4">
      {/* Filter toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <select
            value={actionFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="pl-3 pr-8 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
          >
            {ACTION_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>

        <span className="text-xs text-muted-foreground">
          {filteredEntries.length} entries
          {filteredEntries.length >= 50 && '+'}
        </span>

        <button
          onClick={() => handleFilterChange(actionFilter)}
          className="ml-auto p-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Log list */}
      {filteredEntries.length === 0 && !isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No audit log entries found</p>
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="rounded-lg border bg-card"
        >
          <div className="px-4 divide-y">
            {filteredEntries.map((entry) => (
              <AuditLogEntryRow key={entry.id} entry={entry} />
            ))}
          </div>

          {/* Infinite scroll sentinel */}
          {nextCursor && (
            <div ref={sentinelRef} className="flex items-center justify-center py-4">
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : (
                <button
                  onClick={fetchMore}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Load more
                </button>
              )}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
