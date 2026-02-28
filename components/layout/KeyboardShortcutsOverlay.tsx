'use client';

/**
 * components/layout/KeyboardShortcutsOverlay.tsx
 *
 * Full-screen modal showing all keyboard shortcuts, triggered by '?' or Cmd+/.
 * Includes a search filter to quickly find shortcuts.
 * Categories: Navigation, Messaging, Formatting, Calls, General
 * Animated with staggered reveal using Framer Motion.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Keyboard } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  backdropVariants,
  modalVariants,
  staggerContainer,
  staggerItem,
} from '@/shared/lib/animations';

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutCategory {
  id: string;
  label: string;
  shortcuts: Shortcut[];
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    id: 'navigation',
    label: 'Navigation',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open command palette / search' },
      { keys: ['Alt', '↑'], description: 'Previous channel or DM' },
      { keys: ['Alt', '↓'], description: 'Next channel or DM' },
      { keys: ['⌘', '['], description: 'Navigate back' },
      { keys: ['⌘', ']'], description: 'Navigate forward' },
      { keys: ['⌘', 'Shift', 'K'], description: 'Open DM list' },
      { keys: ['⌘', 'Shift', 'L'], description: 'Open channel list' },
    ],
  },
  {
    id: 'messaging',
    label: 'Messaging',
    shortcuts: [
      { keys: ['Enter'], description: 'Send message' },
      { keys: ['Shift', 'Enter'], description: 'Insert new line' },
      { keys: ['↑'], description: 'Edit last message' },
      { keys: ['⌘', 'Shift', '\\'], description: 'Toggle right panel' },
      { keys: ['Esc'], description: 'Cancel editing / close thread' },
      { keys: ['⌘', 'Shift', 'M'], description: 'Open mentions' },
    ],
  },
  {
    id: 'formatting',
    label: 'Formatting',
    shortcuts: [
      { keys: ['⌘', 'B'], description: 'Bold text' },
      { keys: ['⌘', 'I'], description: 'Italic text' },
      { keys: ['⌘', 'Shift', 'X'], description: 'Strikethrough' },
      { keys: ['⌘', 'Shift', 'C'], description: 'Inline code' },
      { keys: ['⌘', 'Shift', '7'], description: 'Ordered list' },
      { keys: ['⌘', 'Shift', '8'], description: 'Unordered list' },
      { keys: ['⌘', 'Shift', '9'], description: 'Blockquote' },
    ],
  },
  {
    id: 'calls',
    label: 'Calls & Huddles',
    shortcuts: [
      { keys: ['⌘', 'Shift', 'H'], description: 'Start/join huddle' },
      { keys: ['⌘', 'D'], description: 'Toggle mute (in call)' },
      { keys: ['⌘', 'E'], description: 'Toggle camera (in call)' },
      { keys: ['⌘', 'Shift', 'E'], description: 'End call' },
    ],
  },
  {
    id: 'general',
    label: 'General',
    shortcuts: [
      { keys: ['⌘', ','], description: 'Open preferences' },
      { keys: ['⌘', 'Shift', 'D'], description: 'Toggle Do Not Disturb' },
      { keys: ['?'], description: 'Open keyboard shortcuts' },
      { keys: ['⌘', '/'], description: 'Open keyboard shortcuts' },
      { keys: ['⌘', 'Shift', 'A'], description: 'Open all activity' },
      { keys: ['⌘', 'Shift', 'T'], description: 'Open threads panel' },
      { keys: ['⌘', 'Shift', 'S'], description: 'Open saved items' },
    ],
  },
];

interface KeyboardShortcutsOverlayProps {
  /** Controls visibility from parent */
  open?: boolean;
  onClose?: () => void;
}

export function KeyboardShortcutsOverlay({
  open: controlledOpen,
  onClose,
}: KeyboardShortcutsOverlayProps = {}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const isOpen = controlledOpen !== undefined ? controlledOpen : open;

  const handleClose = useCallback(() => {
    setOpen(false);
    setSearchQuery('');
    onClose?.();
  }, [onClose]);

  // Global keyboard shortcuts: '?' or Cmd+/
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // '?' key (not in input)
      if (e.key === '?' && !isTyping && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }

      // Cmd+/ or Ctrl+/
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }

      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  // Focus search when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Filter shortcuts by search query
  const filteredCategories = SHORTCUT_CATEGORIES.map((cat) => ({
    ...cat,
    shortcuts: cat.shortcuts.filter(
      (s) =>
        !searchQuery ||
        s.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.keys.some((k) => k.toLowerCase().includes(searchQuery.toLowerCase()))
    ),
  })).filter((cat) => cat.shortcuts.length > 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              className="w-full max-w-2xl max-h-[80vh] bg-background rounded-xl border shadow-2xl overflow-hidden flex flex-col"
              variants={modalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
                <div className="flex items-center gap-2">
                  <Keyboard className="h-5 w-5 text-muted-foreground" />
                  <h2 className="font-semibold text-base">Keyboard Shortcuts</h2>
                </div>
                <button
                  onClick={handleClose}
                  className="rounded-md p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Close keyboard shortcuts"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Search */}
              <div className="px-5 py-3 border-b shrink-0">
                <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter shortcuts..."
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Shortcut categories */}
              <div className="overflow-y-auto flex-1 px-5 py-4">
                {filteredCategories.length === 0 && (
                  <div className="flex flex-col items-center py-12 text-muted-foreground">
                    <Search className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">No shortcuts found for &ldquo;{searchQuery}&rdquo;</p>
                  </div>
                )}

                <motion.div
                  variants={staggerContainer}
                  initial="initial"
                  animate="animate"
                  className="space-y-6"
                >
                  {filteredCategories.map((category) => (
                    <motion.div key={category.id} variants={staggerItem}>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        {category.label}
                      </h3>
                      <div className="space-y-1">
                        {category.shortcuts.map((shortcut, idx) => (
                          <ShortcutRow key={idx} shortcut={shortcut} />
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              </div>

              {/* Footer */}
              <div className="border-t px-5 py-3 shrink-0 text-xs text-muted-foreground">
                Press <kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono">?</kbd> or{' '}
                <kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono">⌘/</kbd> to toggle this overlay
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// ShortcutRow sub-component
// ---------------------------------------------------------------------------

function ShortcutRow({ shortcut }: { shortcut: Shortcut }) {
  return (
    <div className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50 transition-colors group">
      <span className="text-sm text-foreground/80">{shortcut.description}</span>
      <div className="flex items-center gap-1">
        {shortcut.keys.map((key, i) => (
          <React.Fragment key={i}>
            <kbd className="inline-flex h-6 items-center justify-center rounded border bg-background px-1.5 font-mono text-[11px] font-medium text-foreground shadow-sm min-w-[1.5rem]">
              {key}
            </kbd>
            {i < shortcut.keys.length - 1 && (
              <span className="text-muted-foreground text-[10px]">+</span>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
