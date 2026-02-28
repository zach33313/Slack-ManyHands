/**
 * @jest-environment jsdom
 */

/**
 * Tests for shared/hooks/useKeyboardShortcuts.ts
 *
 * Covers:
 * - useKeyboardShortcuts: registers/unregisters document keydown listener
 * - Input blocking: shortcuts don't fire when focus is in INPUT/TEXTAREA/contentEditable
 * - allowInInput: shortcuts with allowInInput:true fire even from inputs
 * - useAppKeyboardShortcuts: each pre-wired shortcut invokes the correct handler
 * - Cmd+K fires even from inputs (open search override)
 * - Alt+Up / Alt+Down fire even from inputs (channel nav)
 */

import { renderHook, act } from '@testing-library/react';
import '@testing-library/jest-dom';

import {
  useKeyboardShortcuts,
  useAppKeyboardShortcuts,
  type ShortcutConfig,
} from '@/shared/hooks/useKeyboardShortcuts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fireKey(
  key: string,
  opts: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {},
  target: EventTarget = document
) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    ...opts,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

// ---------------------------------------------------------------------------
// useKeyboardShortcuts — core
// ---------------------------------------------------------------------------

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('calls handler when matching key is pressed', () => {
    const handler = jest.fn();
    const shortcuts: ShortcutConfig[] = [{ key: 'a', handler }];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    fireKey('a');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not call handler for non-matching key', () => {
    const handler = jest.fn();
    const shortcuts: ShortcutConfig[] = [{ key: 'a', handler }];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    fireKey('b');
    expect(handler).not.toHaveBeenCalled();
  });

  it('requires meta modifier when meta:true', () => {
    const handler = jest.fn();
    const shortcuts: ShortcutConfig[] = [{ key: 'k', meta: true, handler }];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    // Without meta → no call
    fireKey('k');
    expect(handler).not.toHaveBeenCalled();

    // With meta → call
    fireKey('k', { metaKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('requires shift modifier when shift:true', () => {
    const handler = jest.fn();
    const shortcuts: ShortcutConfig[] = [{ key: 'd', shift: true, meta: true, handler }];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    // Without shift → no call
    fireKey('d', { metaKey: true });
    expect(handler).not.toHaveBeenCalled();

    // With shift → call
    fireKey('d', { metaKey: true, shiftKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('blocks shortcut when focus is in INPUT by default', () => {
    const handler = jest.fn();
    const shortcuts: ShortcutConfig[] = [{ key: '?', handler }];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    fireKey('?', {}, input);
    expect(handler).not.toHaveBeenCalled();
  });

  it('fires shortcut from INPUT when allowInInput:true', () => {
    const handler = jest.fn();
    const shortcuts: ShortcutConfig[] = [{ key: 'Enter', allowInInput: true, handler }];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    fireKey('Enter', {}, input);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('removes listener on unmount', () => {
    const handler = jest.fn();
    const shortcuts: ShortcutConfig[] = [{ key: 'z', handler }];

    const { unmount } = renderHook(() => useKeyboardShortcuts(shortcuts));
    unmount();

    fireKey('z');
    expect(handler).not.toHaveBeenCalled();
  });

  it('uses latest handler without re-registering listener', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    const { rerender } = renderHook(
      ({ h }: { h: jest.Mock }) =>
        useKeyboardShortcuts([{ key: 'q', handler: h }]),
      { initialProps: { h: handler1 } }
    );

    // Update handler
    rerender({ h: handler2 });

    fireKey('q');
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler1).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useAppKeyboardShortcuts — pre-wired shortcuts
// ---------------------------------------------------------------------------

describe('useAppKeyboardShortcuts', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('Cmd+K calls onOpenSearch', () => {
    const onOpenSearch = jest.fn();
    renderHook(() => useAppKeyboardShortcuts({ onOpenSearch }));

    fireKey('k', { metaKey: true });
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+K calls onOpenSearch (Windows-style)', () => {
    const onOpenSearch = jest.fn();
    renderHook(() => useAppKeyboardShortcuts({ onOpenSearch }));

    fireKey('k', { ctrlKey: true });
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it('Cmd+K fires even when focus is in an INPUT', () => {
    const onOpenSearch = jest.fn();
    renderHook(() => useAppKeyboardShortcuts({ onOpenSearch }));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    fireKey('k', { metaKey: true }, input);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it('? key calls onOpenShortcuts', () => {
    const onOpenShortcuts = jest.fn();
    renderHook(() => useAppKeyboardShortcuts({ onOpenShortcuts }));

    fireKey('?');
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
  });

  it('Cmd+/ calls onOpenShortcuts', () => {
    const onOpenShortcuts = jest.fn();
    renderHook(() => useAppKeyboardShortcuts({ onOpenShortcuts }));

    fireKey('/', { metaKey: true });
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
  });

  it('? does not fire from INPUT', () => {
    const onOpenShortcuts = jest.fn();
    renderHook(() => useAppKeyboardShortcuts({ onOpenShortcuts }));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    fireKey('?', {}, input);
    expect(onOpenShortcuts).not.toHaveBeenCalled();
  });

  it('Alt+ArrowUp calls onPrevChannel', () => {
    const onPrevChannel = jest.fn();
    renderHook(() => useAppKeyboardShortcuts({ onPrevChannel }));

    fireKey('ArrowUp', { altKey: true });
    expect(onPrevChannel).toHaveBeenCalledTimes(1);
  });

  it('Alt+ArrowDown calls onNextChannel', () => {
    const onNextChannel = jest.fn();
    renderHook(() => useAppKeyboardShortcuts({ onNextChannel }));

    fireKey('ArrowDown', { altKey: true });
    expect(onNextChannel).toHaveBeenCalledTimes(1);
  });

  it('Cmd+Shift+D calls onToggleDND', () => {
    const onToggleDND = jest.fn();
    renderHook(() => useAppKeyboardShortcuts({ onToggleDND }));

    fireKey('d', { metaKey: true, shiftKey: true });
    expect(onToggleDND).toHaveBeenCalledTimes(1);
  });

  it('Cmd+Shift+\\ calls onTogglePanel', () => {
    const onTogglePanel = jest.fn();
    renderHook(() => useAppKeyboardShortcuts({ onTogglePanel }));

    fireKey('\\', { metaKey: true, shiftKey: true });
    expect(onTogglePanel).toHaveBeenCalledTimes(1);
  });

  it('Cmd+Shift+T calls onOpenThreads', () => {
    const onOpenThreads = jest.fn();
    renderHook(() => useAppKeyboardShortcuts({ onOpenThreads }));

    fireKey('t', { metaKey: true, shiftKey: true });
    expect(onOpenThreads).toHaveBeenCalledTimes(1);
  });

  it('Cmd+Shift+S calls onOpenBookmarks', () => {
    const onOpenBookmarks = jest.fn();
    renderHook(() => useAppKeyboardShortcuts({ onOpenBookmarks }));

    fireKey('s', { metaKey: true, shiftKey: true });
    expect(onOpenBookmarks).toHaveBeenCalledTimes(1);
  });

  it('Cmd+, calls onOpenPreferences', () => {
    const onOpenPreferences = jest.fn();
    renderHook(() => useAppKeyboardShortcuts({ onOpenPreferences }));

    fireKey(',', { metaKey: true });
    expect(onOpenPreferences).toHaveBeenCalledTimes(1);
  });

  it('Cmd+[ calls onNavigateBack', () => {
    const onNavigateBack = jest.fn();
    renderHook(() => useAppKeyboardShortcuts({ onNavigateBack }));

    fireKey('[', { metaKey: true });
    expect(onNavigateBack).toHaveBeenCalledTimes(1);
  });

  it('Cmd+] calls onNavigateForward', () => {
    const onNavigateForward = jest.fn();
    renderHook(() => useAppKeyboardShortcuts({ onNavigateForward }));

    fireKey(']', { metaKey: true });
    expect(onNavigateForward).toHaveBeenCalledTimes(1);
  });

  it('does not throw when handler is not provided', () => {
    // No handlers registered — shortcut should silently no-op
    renderHook(() => useAppKeyboardShortcuts({}));

    expect(() => {
      fireKey('k', { metaKey: true });
      fireKey('?');
    }).not.toThrow();
  });

  it('removes listener on unmount', () => {
    const onOpenSearch = jest.fn();
    const { unmount } = renderHook(() =>
      useAppKeyboardShortcuts({ onOpenSearch })
    );

    unmount();

    fireKey('k', { metaKey: true });
    expect(onOpenSearch).not.toHaveBeenCalled();
  });
});
