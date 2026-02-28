'use client';

/**
 * shared/hooks/useKeyboardShortcuts.ts
 *
 * Global keyboard shortcut registration hook.
 * Registers keydown listeners on document and dispatches actions.
 * Prevents firing when focus is in an input/textarea/contenteditable.
 *
 * Usage:
 *   const { registerShortcut, unregisterShortcut } = useKeyboardShortcuts()
 *
 *   // Or use the pre-wired app shortcuts:
 *   useAppKeyboardShortcuts({ onToggleDND, onOpenSearch, ... })
 */

import { useEffect, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShortcutConfig {
  /** Modifier keys required */
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** The key value (e.g. 'k', 'Escape', '?') */
  key: string;
  /** Whether this shortcut fires when focus is in inputs (default: false) */
  allowInInput?: boolean;
  /** Handler function */
  handler: (e: KeyboardEvent) => void;
}

export type ShortcutMap = Record<string, ShortcutConfig>;

// ---------------------------------------------------------------------------
// Core hook
// ---------------------------------------------------------------------------

/**
 * Register a map of keyboard shortcuts.
 * Shortcuts are automatically unregistered when the component unmounts.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  // Keep a ref to the shortcuts array so we don't need to re-add listeners
  // when the array contents change (handlers might be new functions each render)
  const shortcutsRef = useRef<ShortcutConfig[]>(shortcuts);
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      for (const shortcut of shortcutsRef.current) {
        // Skip if in input unless explicitly allowed
        if (isTyping && !shortcut.allowInInput) continue;

        // Check modifier keys
        const metaMatch = shortcut.meta ? (e.metaKey || e.ctrlKey) : true;
        const ctrlMatch = shortcut.ctrl ? e.ctrlKey : true;
        const shiftMatch = shortcut.shift ? e.shiftKey : !shortcut.shift || e.shiftKey;
        const altMatch = shortcut.alt ? e.altKey : true;

        // Exact match: if shortcut requires meta but meta is not pressed, skip
        if (shortcut.meta !== undefined) {
          if (shortcut.meta && !(e.metaKey || e.ctrlKey)) continue;
          if (!shortcut.meta && (e.metaKey || e.ctrlKey) && shortcut.key !== 'k') continue;
        }
        if (shortcut.shift !== undefined) {
          if (shortcut.shift && !e.shiftKey) continue;
          if (!shortcut.shift && e.shiftKey) continue;
        }
        if (shortcut.alt !== undefined) {
          if (shortcut.alt && !e.altKey) continue;
          if (!shortcut.alt && e.altKey) continue;
        }

        if (e.key.toLowerCase() === shortcut.key.toLowerCase()) {
          e.preventDefault();
          shortcut.handler(e);
          return;
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []); // Intentionally empty — we use the ref
}

// ---------------------------------------------------------------------------
// Pre-wired app shortcuts hook
// ---------------------------------------------------------------------------

export interface AppShortcutHandlers {
  /** Open command palette */
  onOpenSearch?: () => void;
  /** Navigate to previous channel */
  onPrevChannel?: () => void;
  /** Navigate to next channel */
  onNextChannel?: () => void;
  /** Toggle right panel */
  onTogglePanel?: () => void;
  /** Toggle Do Not Disturb */
  onToggleDND?: () => void;
  /** Open preferences */
  onOpenPreferences?: () => void;
  /** Open keyboard shortcuts overlay */
  onOpenShortcuts?: () => void;
  /** Start/join huddle */
  onStartHuddle?: () => void;
  /** Toggle mute in call */
  onToggleMute?: () => void;
  /** Toggle camera in call */
  onToggleCamera?: () => void;
  /** Navigate back */
  onNavigateBack?: () => void;
  /** Navigate forward */
  onNavigateForward?: () => void;
  /** Open threads panel */
  onOpenThreads?: () => void;
  /** Open saved items */
  onOpenBookmarks?: () => void;
}

/**
 * Register all application-level keyboard shortcuts.
 * Call this once at the workspace layout level.
 */
export function useAppKeyboardShortcuts(handlers: AppShortcutHandlers) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      const h = handlersRef.current;

      // Cmd+K — open search (allow in input to override browser find)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === 'k') {
        e.preventDefault();
        h.onOpenSearch?.();
        return;
      }

      // Cmd+[ — navigate back
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === '[') {
        e.preventDefault();
        h.onNavigateBack?.();
        return;
      }

      // Cmd+] — navigate forward
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === ']') {
        e.preventDefault();
        h.onNavigateForward?.();
        return;
      }

      // Alt+Up — previous channel
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.key === 'ArrowUp') {
        e.preventDefault();
        h.onPrevChannel?.();
        return;
      }

      // Alt+Down — next channel
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.key === 'ArrowDown') {
        e.preventDefault();
        h.onNextChannel?.();
        return;
      }

      // Don't fire the rest when typing in inputs
      if (isTyping) return;

      // '?' — open keyboard shortcuts
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        h.onOpenShortcuts?.();
        return;
      }

      // Cmd+/ — open keyboard shortcuts
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        h.onOpenShortcuts?.();
        return;
      }

      // Cmd+Shift+\ — toggle right panel
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === '\\') {
        e.preventDefault();
        h.onTogglePanel?.();
        return;
      }

      // Cmd+Shift+D — toggle DND
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        h.onToggleDND?.();
        return;
      }

      // Cmd+, — open preferences
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === ',') {
        e.preventDefault();
        h.onOpenPreferences?.();
        return;
      }

      // Cmd+Shift+H — start huddle
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        h.onStartHuddle?.();
        return;
      }

      // Cmd+D — toggle mute
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        h.onToggleMute?.();
        return;
      }

      // Cmd+E — toggle camera
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        h.onToggleCamera?.();
        return;
      }

      // Cmd+Shift+T — open threads
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        h.onOpenThreads?.();
        return;
      }

      // Cmd+Shift+S — open bookmarks
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        h.onOpenBookmarks?.();
        return;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []); // Uses ref — stable listener
}
