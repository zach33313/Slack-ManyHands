'use client';

/**
 * search/components/SearchModal.tsx
 *
 * Enhanced command palette / global search modal.
 * Open with Cmd+K / Ctrl+K.
 *
 * Features:
 *   - Tab categories: All | Messages | Channels | People | Files | Actions
 *   - Fuzzy search with highlighted matching characters
 *   - Keyboard navigation: Up/Down arrows, Enter to select, Esc to close
 *   - Recent searches stored in localStorage (last 10)
 *   - Quick actions when query starts with '>': create channel, set status, toggle DND, etc.
 *   - Results show context: messages (snippet + channel + date), channels, people
 *   - Animated with modalVariants + backdrop blur, staggered result items
 */

import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  X,
  Hash,
  User,
  Paperclip,
  Clock,
  Loader2,
  MessageSquare,
  Zap,
  ChevronRight,
  Users,
  Bell,
  Moon,
  Sun,
  Settings,
  Phone,
  Plus,
  FileText,
  FileImage,
  FileVideo,
  Music,
  File,
  Download,
  ExternalLink,
} from 'lucide-react';
import { cn, formatFileSize } from '@/shared/lib/utils';
import { useSearch } from '@/shared/hooks/useSearch';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { useAppStore } from '@/store';
import { modalVariants, backdropVariants, staggerContainer, dropdownItemVariants } from '@/shared/lib/animations';
import { formatDistanceToNow } from 'date-fns';
import { UserAvatar } from '@/members/components/UserAvatar';
import { openDM } from '@/channels/actions';

const RECENT_SEARCHES_KEY = 'slack-clone-recent-searches';
const MAX_RECENT_SEARCHES = 10;

type TabCategory = 'all' | 'messages' | 'channels' | 'people' | 'files' | 'actions';

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  action: () => void;
}

interface SearchModalProps {
  workspaceId: string;
  workspaceSlug: string;
  onToggleDND?: () => void;
  onToggleTheme?: () => void;
  onOpenChannelCreator?: () => void;
  onOpenStatusPicker?: () => void;
  onStartHuddle?: () => void;
  onOpenPreferences?: () => void;
}

// ---------------------------------------------------------------------------
// People & Files result types (match /api/search/people and /api/search/files)
// ---------------------------------------------------------------------------

interface PersonResult {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
  title: string | null;
  statusText: string | null;
  statusEmoji: string | null;
}

interface FileResult {
  id: string;
  name: string;
  url: string;
  size: number;
  mimeType: string;
  uploadedBy: { id: string; name: string | null; image: string | null };
  channelName: string;
  createdAt: string; // ISO string from JSON response
}

// ---------------------------------------------------------------------------
// File type icon helper
// ---------------------------------------------------------------------------

function getMimeIcon(mimeType: string): React.ReactNode {
  if (mimeType.startsWith('image/')) return <FileImage className="h-5 w-5 text-blue-500 shrink-0" />;
  if (mimeType.startsWith('video/')) return <FileVideo className="h-5 w-5 text-purple-500 shrink-0" />;
  if (mimeType.startsWith('audio/')) return <Music className="h-5 w-5 text-pink-500 shrink-0" />;
  if (mimeType === 'application/pdf') return <FileText className="h-5 w-5 text-red-500 shrink-0" />;
  if (mimeType.startsWith('text/') || mimeType.includes('document') || mimeType.includes('spreadsheet') || mimeType.includes('presentation'))
    return <FileText className="h-5 w-5 text-green-600 shrink-0" />;
  return <File className="h-5 w-5 text-muted-foreground shrink-0" />;
}

// ---------------------------------------------------------------------------
// Loading skeleton for people/files tabs
// ---------------------------------------------------------------------------

function SearchSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="p-2 space-y-1 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2">
          <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 rounded bg-muted" />
            <div className="h-2.5 w-48 rounded bg-muted/60" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fuzzy search helper
// ---------------------------------------------------------------------------

function fuzzyMatch(text: string, pattern: string): { matched: boolean; indices: number[] } {
  if (!pattern) return { matched: true, indices: [] };
  const tl = text.toLowerCase();
  const pl = pattern.toLowerCase();
  const indices: number[] = [];
  let j = 0;
  for (let i = 0; i < tl.length && j < pl.length; i++) {
    if (tl[i] === pl[j]) {
      indices.push(i);
      j++;
    }
  }
  return { matched: j === pl.length, indices };
}

function HighlightedText({
  text,
  indices,
}: {
  text: string;
  indices: number[];
}) {
  if (indices.length === 0) return <span>{text}</span>;

  // Use a Set for O(1) per-character lookup instead of Array.includes (O(n))
  const indexSet = new Set(indices);

  // Group consecutive characters with the same highlight state into segments,
  // producing O(segments) DOM nodes instead of O(characters) DOM nodes.
  const segments: { text: string; highlighted: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const highlighted = indexSet.has(i);
    let j = i + 1;
    while (j < text.length && indexSet.has(j) === highlighted) j++;
    segments.push({ text: text.slice(i, j), highlighted });
    i = j;
  }

  return (
    <>
      {segments.map((seg, idx) =>
        seg.highlighted ? (
          <span key={idx} className="text-primary font-semibold">
            {seg.text}
          </span>
        ) : (
          <React.Fragment key={idx}>{seg.text}</React.Fragment>
        )
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

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
  } catch {}
}

function clearRecentSearches() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {}
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SearchModal({
  workspaceId,
  workspaceSlug,
  onToggleDND,
  onToggleTheme,
  onOpenChannelCreator,
  onOpenStatusPicker,
  onStartHuddle,
  onOpenPreferences,
}: SearchModalProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabCategory>('all');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const channels = useAppStore((s) => s.channels);
  const user = useAppStore((s) => s.user);
  const presenceMap = useAppStore((s) => s.presenceMap);

  const { query, setQuery, results, isLoading, error, total } = useSearch(workspaceId);

  // Shared debounced query for people/files searches (300 ms)
  const debouncedQuery = useDebounce(query, 300);

  // --- People search state ---
  const [peopleResults, setPeopleResults] = useState<PersonResult[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);

  // --- Files search state ---
  const [filesResults, setFilesResults] = useState<FileResult[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);

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

  // Load recent searches and focus when modal opens
  useEffect(() => {
    if (open) {
      setRecentSearches(getRecentSearches());
      setSelectedIndex(-1);
      setActiveTab('all');
      // requestAnimationFrame defers until after the browser paints the first frame,
      // by which point the element is guaranteed to be in the DOM and interactive —
      // no arbitrary fixed delay needed.
      const raf = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [open]);

  // Reset selected index when results or tab change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [results, activeTab]);

  // People search — fetch when tab is active and debounced query changes
  useEffect(() => {
    if (activeTab !== 'people' || !workspaceId) return;
    const q = debouncedQuery.trim();
    if (!q) {
      setPeopleResults([]);
      setPeopleError(null);
      return;
    }

    let cancelled = false;
    setPeopleLoading(true);
    setPeopleError(null);

    const params = new URLSearchParams({ workspaceId, q });
    fetch(`/api/search/people?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.ok) {
          setPeopleResults(data.data);
        } else {
          setPeopleError(data.error || 'Search failed');
          setPeopleResults([]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPeopleError('Search failed');
          setPeopleResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) setPeopleLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeTab, debouncedQuery, workspaceId]);

  // Files search — fetch when tab is active and debounced query changes
  useEffect(() => {
    if (activeTab !== 'files' || !workspaceId) return;
    const q = debouncedQuery.trim();
    if (!q) {
      setFilesResults([]);
      setFilesError(null);
      return;
    }

    let cancelled = false;
    setFilesLoading(true);
    setFilesError(null);

    const params = new URLSearchParams({ workspaceId, q });
    fetch(`/api/search/files?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.ok) {
          setFilesResults(data.data);
        } else {
          setFilesError(data.error || 'Search failed');
          setFilesResults([]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFilesError('Search failed');
          setFilesResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) setFilesLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeTab, debouncedQuery, workspaceId]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && resultsRef.current) {
      const items = resultsRef.current.querySelectorAll('[data-result-item]');
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

  const navigateToChannel = useCallback(
    (channelId: string) => {
      saveRecentSearch(query);
      handleClose();
      router.push(`/${workspaceSlug}/channel/${channelId}`);
    },
    [query, handleClose, router, workspaceSlug]
  );

  // Open a DM with a workspace member, then navigate to the DM channel
  const handleOpenPersonDM = useCallback(
    async (personId: string) => {
      saveRecentSearch(query);
      handleClose();
      try {
        await openDM(workspaceId, personId);
      } catch {
        // openDM may throw if DM already exists; that's fine — just navigate
      }
      router.push(`/${workspaceSlug}/dm/${personId}`);
    },
    [query, handleClose, workspaceId, workspaceSlug, router]
  );

  // Open/download a file: try to navigate to channel context, fall back to direct URL
  const handleOpenFile = useCallback(
    (file: FileResult) => {
      handleClose();
      const channel = channels.find((c) => c.name === file.channelName);
      if (channel) {
        router.push(`/${workspaceSlug}/channel/${channel.id}`);
      } else {
        window.open(file.url, '_blank', 'noopener,noreferrer');
      }
    },
    [handleClose, channels, workspaceSlug, router]
  );

  // Quick actions for ">command" mode
  const quickActions: QuickAction[] = [
    {
      id: 'create-channel',
      label: 'Create channel',
      description: 'Start a new channel',
      icon: <Plus className="h-4 w-4" />,
      action: () => {
        handleClose();
        onOpenChannelCreator?.();
      },
    },
    {
      id: 'set-status',
      label: 'Set status',
      description: 'Update your status message',
      icon: <User className="h-4 w-4" />,
      action: () => {
        handleClose();
        onOpenStatusPicker?.();
      },
    },
    {
      id: 'toggle-dnd',
      label: 'Toggle Do Not Disturb',
      description: 'Pause notifications',
      icon: <Moon className="h-4 w-4" />,
      action: () => {
        handleClose();
        onToggleDND?.();
      },
    },
    {
      id: 'toggle-theme',
      label: 'Toggle theme',
      description: 'Switch between light and dark mode',
      icon: <Sun className="h-4 w-4" />,
      action: () => {
        handleClose();
        onToggleTheme?.();
      },
    },
    {
      id: 'start-huddle',
      label: 'Start huddle',
      description: 'Start a quick voice conversation',
      icon: <Phone className="h-4 w-4" />,
      action: () => {
        handleClose();
        onStartHuddle?.();
      },
    },
    {
      id: 'invite-member',
      label: 'Invite member',
      description: 'Invite someone to this workspace',
      icon: <Users className="h-4 w-4" />,
      action: () => {
        handleClose();
        router.push(`/${workspaceSlug}/settings/members`);
      },
    },
  ];

  // Determine if we're in actions mode
  const isActionsMode = query.startsWith('>');
  const actionQuery = isActionsMode ? query.slice(1).trim().toLowerCase() : '';

  const filteredActions = isActionsMode
    ? quickActions.filter(
        (a) =>
          !actionQuery ||
          a.label.toLowerCase().includes(actionQuery) ||
          a.description.toLowerCase().includes(actionQuery)
      )
    : [];

  // Channel fuzzy results
  const channelResults = !isActionsMode && (activeTab === 'all' || activeTab === 'channels') && query.trim().length > 0
    ? channels
        .map((ch) => {
          const match = fuzzyMatch(ch.name, query.trim());
          return { channel: ch, ...match };
        })
        .filter((r) => r.matched)
        .slice(0, 5)
    : [];

  // Message results
  const messageResults =
    !isActionsMode && (activeTab === 'all' || activeTab === 'messages') ? results : [];

  // Tabs configuration
  const tabs: { id: TabCategory; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'messages', label: 'Messages' },
    { id: 'channels', label: 'Channels' },
    { id: 'people', label: 'People' },
    { id: 'files', label: 'Files' },
    { id: 'actions', label: 'Actions' },
  ];

  const showResults = query.trim().length > 0 || isActionsMode;
  const showRecent = !showResults && recentSearches.length > 0;
  const showActionsTab = activeTab === 'actions' || isActionsMode;

  const totalResultCount =
    (isActionsMode ? filteredActions.length : 0) +
    channelResults.length +
    messageResults.length;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev < totalResultCount - 1 ? prev + 1 : prev));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
          break;
        case 'Enter':
          e.preventDefault();
          {
            const items = resultsRef.current?.querySelectorAll('[data-result-item]');
            const selected = items?.[selectedIndex] as HTMLElement;
            selected?.click();
          }
          break;
        case 'Escape':
          handleClose();
          break;
      }
    },
    [totalResultCount, selectedIndex, handleClose]
  );

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

      {/* Modal portal */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              variants={backdropVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              onClick={handleClose}
            />

            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
              <motion.div
                className="w-full max-w-2xl bg-background rounded-xl border shadow-2xl overflow-hidden"
                variants={modalVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                onKeyDown={handleKeyDown}
              >
                {/* Search input */}
                <div className="flex items-center border-b px-3 py-1">
                  {isActionsMode ? (
                    <Zap className="h-4 w-4 text-primary shrink-0" />
                  ) : (
                    <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder={isActionsMode ? 'Type an action...' : 'Search messages, channels, people... (or type > for actions)'}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="flex-1 h-12 px-3 text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground"
                  />
                  {isLoading && !isActionsMode && (
                    <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0 mr-1" />
                  )}
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Tabs */}
                {!isActionsMode && (
                  <div className="flex items-center gap-0.5 px-2 py-1.5 border-b overflow-x-auto">
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          'px-2.5 py-1 text-xs rounded-md font-medium transition-colors whitespace-nowrap',
                          activeTab === tab.id
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                )}

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
                          onClick={() => {
                            clearRecentSearches();
                            setRecentSearches([]);
                          }}
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
                            onClick={() => {
                              setQuery(search);
                              inputRef.current?.focus();
                            }}
                            className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors text-left"
                          >
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="truncate">{search}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions mode */}
                  {isActionsMode && (
                    <motion.div
                      variants={staggerContainer}
                      initial="initial"
                      animate="animate"
                      className="p-2"
                    >
                      <div className="px-3 py-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          Quick Actions
                        </span>
                      </div>
                      {filteredActions.length === 0 && (
                        <div className="flex flex-col items-center py-8 text-muted-foreground">
                          <p className="text-sm">No matching actions</p>
                        </div>
                      )}
                      {filteredActions.map((action, idx) => (
                        <motion.button
                          key={action.id}
                          data-result-item
                          variants={dropdownItemVariants}
                          type="button"
                          onClick={action.action}
                          className={cn(
                            'flex items-center gap-3 w-full rounded-md px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left',
                            selectedIndex === idx && 'bg-accent'
                          )}
                        >
                          <span className="text-muted-foreground">{action.icon}</span>
                          <div>
                            <div className="font-medium">{action.label}</div>
                            <div className="text-xs text-muted-foreground">{action.description}</div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                        </motion.button>
                      ))}
                    </motion.div>
                  )}

                  {/* Channel results */}
                  {channelResults.length > 0 && !isActionsMode && (
                    <div className="p-2">
                      <div className="px-3 py-1.5">
                        <span className="text-xs font-medium text-muted-foreground">Channels</span>
                      </div>
                      <motion.div variants={staggerContainer} initial="initial" animate="animate">
                        {channelResults.map(({ channel, indices }, idx) => (
                          <motion.button
                            key={channel.id}
                            data-result-item
                            variants={dropdownItemVariants}
                            type="button"
                            onClick={() => navigateToChannel(channel.id)}
                            className={cn(
                              'flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors text-left',
                              selectedIndex === idx && 'bg-accent'
                            )}
                          >
                            <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div>
                              <div className="font-medium">
                                <HighlightedText text={channel.name} indices={indices} />
                              </div>
                              {channel.description && (
                                <div className="text-xs text-muted-foreground truncate max-w-xs">
                                  {channel.description}
                                </div>
                              )}
                            </div>
                          </motion.button>
                        ))}
                      </motion.div>
                    </div>
                  )}

                  {/* Message results */}
                  {messageResults.length > 0 && !isActionsMode && (
                    <div className="p-2">
                      <div className="px-3 py-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          Messages ({total})
                        </span>
                      </div>
                      <motion.div variants={staggerContainer} initial="initial" animate="animate">
                        {messageResults.map((result, idx) => {
                          const itemIdx = channelResults.length + idx;
                          const timeAgo = formatDistanceToNow(
                            new Date(result.message.createdAt),
                            { addSuffix: true }
                          );
                          return (
                            <motion.button
                              key={result.message.id}
                              data-result-item
                              variants={dropdownItemVariants}
                              type="button"
                              onClick={() =>
                                navigateToMessage(result.message.channelId, result.message.id)
                              }
                              className={cn(
                                'flex items-start gap-3 w-full rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors text-left',
                                selectedIndex === itemIdx && 'bg-accent'
                              )}
                            >
                              <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                                  <span className="font-medium text-foreground">
                                    {result.message.author.name}
                                  </span>
                                  <span>in</span>
                                  <span className="font-medium text-foreground">
                                    #{result.channelName}
                                  </span>
                                  <span className="ml-auto shrink-0">{timeAgo}</span>
                                </div>
                                <p className="text-sm text-foreground/80 truncate">
                                  {result.message.contentPlain}
                                </p>
                              </div>
                            </motion.button>
                          );
                        })}
                      </motion.div>
                    </div>
                  )}

                  {/* Actions tab when not in >mode */}
                  {activeTab === 'actions' && !isActionsMode && (
                    <div className="p-2">
                      <div className="px-3 py-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          Quick Actions — or type &gt; to filter
                        </span>
                      </div>
                      <motion.div variants={staggerContainer} initial="initial" animate="animate">
                        {quickActions.map((action, idx) => (
                          <motion.button
                            key={action.id}
                            data-result-item
                            variants={dropdownItemVariants}
                            type="button"
                            onClick={action.action}
                            className={cn(
                              'flex items-center gap-3 w-full rounded-md px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left',
                              selectedIndex === idx && 'bg-accent'
                            )}
                          >
                            <span className="text-muted-foreground">{action.icon}</span>
                            <div>
                              <div className="font-medium">{action.label}</div>
                              <div className="text-xs text-muted-foreground">{action.description}</div>
                            </div>
                          </motion.button>
                        ))}
                      </motion.div>
                    </div>
                  )}

                  {/* People tab */}
                  {activeTab === 'people' && !isActionsMode && (
                    <div className="p-2">
                      {/* Prompt to type when query is empty */}
                      {!query.trim() && (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                          <Users className="h-8 w-8 mb-2 opacity-50" />
                          <p className="text-sm font-medium">Search for people</p>
                          <p className="text-xs mt-1">Type a name or email to find workspace members</p>
                        </div>
                      )}

                      {/* Loading skeleton */}
                      {query.trim() && peopleLoading && <SearchSkeleton rows={4} />}

                      {/* Error */}
                      {query.trim() && !peopleLoading && peopleError && (
                        <div className="flex flex-col items-center justify-center py-8 text-destructive">
                          <p className="text-sm">{peopleError}</p>
                        </div>
                      )}

                      {/* Empty state */}
                      {query.trim() && !peopleLoading && !peopleError && peopleResults.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                          <User className="h-8 w-8 mb-2 opacity-50" />
                          <p className="text-sm">No people found for &ldquo;{query}&rdquo;</p>
                          <p className="text-xs mt-1">Try searching by name or email</p>
                        </div>
                      )}

                      {/* Results */}
                      {query.trim() && !peopleLoading && peopleResults.length > 0 && (
                        <>
                          <div className="px-3 py-1.5">
                            <span className="text-xs font-medium text-muted-foreground">
                              People ({peopleResults.length})
                            </span>
                          </div>
                          <motion.div variants={staggerContainer} initial="initial" animate="animate">
                            {peopleResults.map((person, idx) => {
                              const isOnline = presenceMap[person.id] === 'online';
                              const roleBadge =
                                person.role === 'OWNER'
                                  ? { label: 'Owner', cls: 'bg-amber-100 text-amber-800' }
                                  : person.role === 'ADMIN'
                                  ? { label: 'Admin', cls: 'bg-blue-100 text-blue-800' }
                                  : null;

                              return (
                                <motion.button
                                  key={person.id}
                                  data-result-item
                                  variants={dropdownItemVariants}
                                  type="button"
                                  onClick={() => handleOpenPersonDM(person.id)}
                                  className={cn(
                                    'flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors text-left',
                                    selectedIndex === idx && 'bg-accent'
                                  )}
                                >
                                  {/* Avatar with online indicator */}
                                  <div className="relative shrink-0">
                                    <UserAvatar
                                      user={{ id: person.id, name: person.name, image: person.image }}
                                      size="sm"
                                    />
                                    <span
                                      className={cn(
                                        'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background',
                                        isOnline ? 'bg-green-500' : 'bg-muted-foreground/40'
                                      )}
                                    />
                                  </div>

                                  {/* Name, status, email */}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="font-medium text-foreground truncate">
                                        {person.statusEmoji && (
                                          <span className="mr-1">{person.statusEmoji}</span>
                                        )}
                                        {person.name ?? person.email}
                                      </span>
                                      {roleBadge && (
                                        <span
                                          className={cn(
                                            'shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                                            roleBadge.cls
                                          )}
                                        >
                                          {roleBadge.label}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">
                                      {person.statusText
                                        ? person.statusText
                                        : person.title
                                        ? person.title
                                        : person.email}
                                    </div>
                                  </div>

                                  {/* Open DM hint */}
                                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                </motion.button>
                              );
                            })}
                          </motion.div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Files tab */}
                  {activeTab === 'files' && !isActionsMode && (
                    <div className="p-2">
                      {/* Prompt to type when query is empty */}
                      {!query.trim() && (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                          <Paperclip className="h-8 w-8 mb-2 opacity-50" />
                          <p className="text-sm font-medium">Search for files</p>
                          <p className="text-xs mt-1">Type a filename to find uploaded files</p>
                        </div>
                      )}

                      {/* Loading skeleton */}
                      {query.trim() && filesLoading && <SearchSkeleton rows={4} />}

                      {/* Error */}
                      {query.trim() && !filesLoading && filesError && (
                        <div className="flex flex-col items-center justify-center py-8 text-destructive">
                          <p className="text-sm">{filesError}</p>
                        </div>
                      )}

                      {/* Empty state */}
                      {query.trim() && !filesLoading && !filesError && filesResults.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                          <Paperclip className="h-8 w-8 mb-2 opacity-50" />
                          <p className="text-sm">No files found for &ldquo;{query}&rdquo;</p>
                          <p className="text-xs mt-1">Try a different filename or switch to Messages tab</p>
                        </div>
                      )}

                      {/* Results */}
                      {query.trim() && !filesLoading && filesResults.length > 0 && (
                        <>
                          <div className="px-3 py-1.5">
                            <span className="text-xs font-medium text-muted-foreground">
                              Files ({filesResults.length})
                            </span>
                          </div>
                          <motion.div variants={staggerContainer} initial="initial" animate="animate">
                            {filesResults.map((file, idx) => {
                              const uploadedAgo = formatDistanceToNow(
                                new Date(file.createdAt),
                                { addSuffix: true }
                              );
                              const isImage = file.mimeType.startsWith('image/');
                              const canNavigate = channels.some((c) => c.name === file.channelName);

                              return (
                                <motion.button
                                  key={file.id}
                                  data-result-item
                                  variants={dropdownItemVariants}
                                  type="button"
                                  onClick={() => handleOpenFile(file)}
                                  className={cn(
                                    'flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors text-left',
                                    selectedIndex === idx && 'bg-accent'
                                  )}
                                >
                                  {/* File type icon or image thumbnail */}
                                  {isImage ? (
                                    <div className="h-10 w-10 rounded border border-border overflow-hidden shrink-0 bg-muted">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={file.url}
                                        alt={file.name}
                                        className="h-full w-full object-cover"
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                      />
                                    </div>
                                  ) : (
                                    <div className="h-10 w-10 rounded border border-border flex items-center justify-center bg-muted shrink-0">
                                      {getMimeIcon(file.mimeType)}
                                    </div>
                                  )}

                                  {/* File metadata */}
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium text-foreground truncate">{file.name}</div>
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                                      <span>{formatFileSize(file.size)}</span>
                                      <span className="text-muted-foreground/40">·</span>
                                      <span>#{file.channelName}</span>
                                      <span className="text-muted-foreground/40">·</span>
                                      <span>{file.uploadedBy.name ?? 'Unknown'}</span>
                                      <span className="text-muted-foreground/40">·</span>
                                      <span className="shrink-0">{uploadedAgo}</span>
                                    </div>
                                  </div>

                                  {/* Action hint */}
                                  {canNavigate ? (
                                    <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                                  ) : (
                                    <Download className="h-4 w-4 text-muted-foreground shrink-0" />
                                  )}
                                </motion.button>
                              );
                            })}
                          </motion.div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Loading state (messages/channels/all tabs only) */}
                  {showResults && isLoading && !isActionsMode &&
                    activeTab !== 'people' && activeTab !== 'files' &&
                    messageResults.length === 0 && channelResults.length === 0 && (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      <span className="text-sm">Searching...</span>
                    </div>
                  )}

                  {/* Empty state (messages/channels/all tabs only) */}
                  {showResults && !isLoading && !isActionsMode && !error &&
                    totalResultCount === 0 &&
                    activeTab !== 'people' && activeTab !== 'files' && (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Search className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">No results found for &ldquo;{query}&rdquo;</p>
                      <p className="text-xs mt-1">Try different keywords or switch tabs</p>
                    </div>
                  )}

                  {/* Empty initial state */}
                  {!showResults && !showRecent && (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Search className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">Search messages, channels, and more</p>
                      <p className="text-xs mt-1">
                        Type <code className="bg-muted px-1 rounded">&gt;</code> for quick actions
                      </p>
                    </div>
                  )}

                  {/* Error */}
                  {error && (
                    <div className="flex flex-col items-center justify-center py-12 text-destructive">
                      <p className="text-sm">{error}</p>
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
                  <span className="ml-auto flex items-center gap-1 text-muted-foreground/70">
                    Type <code className="bg-muted px-1 rounded mx-0.5">&gt;</code> for actions
                  </span>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
