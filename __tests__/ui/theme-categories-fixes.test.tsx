/**
 * @jest-environment jsdom
 *
 * __tests__/ui/theme-categories-fixes.test.tsx
 *
 * Tests for two specific bug-fix areas:
 *
 * A. ThemePicker (components/ThemePicker.tsx)
 *    1. Auto button shows selected state when theme is 'system' (post-hydration)
 *    2. Skeleton/placeholder is rendered before mounted (hydration safety)
 *
 * B. ChannelCategories (components/layout/ChannelCategories.tsx)
 *    3. No eslint-disable comments in source file
 *    4. useEffect has proper, stable dependency array (not raw channel arrays)
 *    5. Component does not re-render infinitely with stable store state
 *
 * Run: npx jest __tests__/ui/theme-categories-fixes.test.tsx
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// framer-motion — render as plain HTML elements with no hooks
// ---------------------------------------------------------------------------

jest.mock('framer-motion', () => {
  const React = require('react');

  function motionEl(tag: string) {
    return function MotionEl({
      children,
      className,
      style,
      animate,
      initial,
      variants,
      exit,
      transition,
      layout,
      onClick,
      onContextMenu,
      title,
      ...rest
    }: Record<string, unknown>) {
      return React.createElement(tag, { className, style, onClick, onContextMenu, title }, children);
    };
  }

  return {
    motion: {
      div: motionEl('div'),
      button: motionEl('button'),
      span: motionEl('span'),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

// ---------------------------------------------------------------------------
// lucide-react — return null-rendering stubs for every icon
// ---------------------------------------------------------------------------

jest.mock('lucide-react', () => {
  const React = require('react');
  const Icon = ({ className }: { className?: string }) =>
    React.createElement('span', { 'aria-hidden': true, className });
  return new Proxy(
    {},
    { get: () => Icon }
  );
});

// ---------------------------------------------------------------------------
// next-themes — controllable per-test via mockUseTheme
// ---------------------------------------------------------------------------

const mockUseTheme = jest.fn();
jest.mock('next-themes', () => ({
  useTheme: () => mockUseTheme(),
}));

// ---------------------------------------------------------------------------
// theme-provider — controllable per-test via mockUseAppTheme
// ---------------------------------------------------------------------------

const mockUseAppTheme = jest.fn();
jest.mock('@/components/providers/theme-provider', () => ({
  useAppTheme: () => mockUseAppTheme(),
}));

// ---------------------------------------------------------------------------
// shared/lib/themes — minimal stub (only the shape ThemePicker needs)
// ---------------------------------------------------------------------------

jest.mock('@/shared/lib/themes', () => ({
  themes: {
    default: { label: 'Default' },
    ocean:   { label: 'Ocean'   },
  },
  themeNames: ['default', 'ocean'],
  applyTheme: jest.fn(),
  resetTheme: jest.fn(),
}));

// ---------------------------------------------------------------------------
// shared/lib/animations — empty variants (framer-motion is mocked anyway)
// ---------------------------------------------------------------------------

jest.mock('@/shared/lib/animations', () => ({
  staggerContainer: {},
  staggerItem:      {},
}));

// ---------------------------------------------------------------------------
// @dnd-kit — minimal functional stubs for ChannelCategories
// ---------------------------------------------------------------------------

jest.mock('@dnd-kit/core', () => {
  const React = require('react');
  return {
    DndContext:      ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    closestCenter:  jest.fn(),
    KeyboardSensor: class {},
    PointerSensor:  class {},
    useSensor:      jest.fn(() => ({})),
    useSensors:     jest.fn(() => []),
    DragOverlay:    () => null,
  };
});

jest.mock('@dnd-kit/sortable', () => {
  const React = require('react');
  return {
    arrayMove: (arr: unknown[], from: number, to: number) => {
      const next = [...arr];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    },
    SortableContext:              ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    sortableKeyboardCoordinates: jest.fn(),
    useSortable:                 jest.fn(() => ({
      attributes:  {},
      listeners:   {},
      setNodeRef:  jest.fn(),
      transform:   null,
      transition:  null,
      isDragging:  false,
    })),
    verticalListSortingStrategy: {},
  };
});

jest.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: { toString: () => '' },
  },
}));

// ---------------------------------------------------------------------------
// Zustand store — mutable state captured via closure
// ---------------------------------------------------------------------------

interface MockStoreState {
  user:             { id: string; name: string; image: null } | null;
  currentWorkspace: { id: string; name: string; slug: string } | null;
  channels:         Array<{
    id: string;
    name: string;
    type: string;
    workspaceId: string;
    description: null;
    isArchived: boolean;
    createdById: string;
    createdAt: Date;
    memberCount: number;
    unreadCount: number;
  }>;
  starredChannels: string[];
  presenceMap:     Record<string, string>;
}

let mockStoreState: MockStoreState = {
  user:             null,
  currentWorkspace: null,
  channels:         [],
  starredChannels:  [],
  presenceMap:      {},
};

jest.mock('@/store', () => ({
  useAppStore: (selector: (s: MockStoreState) => unknown) => selector(mockStoreState),
}));

// ---------------------------------------------------------------------------
// Imports — after all jest.mock() declarations
// ---------------------------------------------------------------------------

import { ThemePicker }       from '@/components/ThemePicker';
import { ChannelCategories } from '@/components/layout/ChannelCategories';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function resetStore(overrides: Partial<MockStoreState> = {}) {
  mockStoreState = {
    user:             { id: 'user-1', name: 'Alice', image: null },
    currentWorkspace: { id: 'ws-1',   name: 'Test WS', slug: 'test' },
    channels:         [],
    starredChannels:  [],
    presenceMap:      {},
    ...overrides,
  };
}

const DEFAULT_THEME_CTX = {
  colorTheme:    'default',
  setColorTheme: jest.fn(),
} as const;

const DEFAULT_NEXT_THEME = {
  theme:        'light',
  resolvedTheme: 'light',
  setTheme:     jest.fn(),
} as const;

const CC_PROPS = {
  workspaceSlug:  'test',
  onChannelClick: jest.fn(),
  dmParticipants: {},
} as const;

// ---------------------------------------------------------------------------
// ===========================================================================
// A. ThemePicker tests
// ===========================================================================
// ---------------------------------------------------------------------------

describe('ThemePicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAppTheme.mockReturnValue({ ...DEFAULT_THEME_CTX });
    mockUseTheme.mockReturnValue({ ...DEFAULT_NEXT_THEME });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test 1 — Auto button selected state when theme='system'
  // -------------------------------------------------------------------------

  it("shows Auto button with selected (border-primary) styling when theme is 'system'", () => {
    mockUseTheme.mockReturnValue({
      theme:         'system',
      resolvedTheme: 'dark',
      setTheme:      jest.fn(),
    });

    render(<ThemePicker />);

    // After render + effects (mounted=true), real interactive buttons are shown
    const autoBtn = screen.getByRole('button', { name: /auto/i });
    expect(autoBtn).toBeInTheDocument();

    // Active button carries all three selected-state classes
    expect(autoBtn.className).toContain('border-primary');
    expect(autoBtn.className).toContain('bg-primary/10');
    expect(autoBtn.className).toContain('text-primary');
  });

  it("Auto button does NOT carry selected styling when theme is 'light'", () => {
    mockUseTheme.mockReturnValue({
      theme:         'light',
      resolvedTheme: 'light',
      setTheme:      jest.fn(),
    });

    render(<ThemePicker />);

    const autoBtn = screen.getByRole('button', { name: /auto/i });
    expect(autoBtn.className).not.toContain('border-primary');
    expect(autoBtn.className).toContain('border-border');
  });

  it("Light button shows selected styling when theme is 'light'", () => {
    mockUseTheme.mockReturnValue({
      theme:         'light',
      resolvedTheme: 'light',
      setTheme:      jest.fn(),
    });

    render(<ThemePicker />);

    const lightBtn = screen.getByRole('button', { name: /light/i });
    expect(lightBtn.className).toContain('border-primary');
    expect(lightBtn.className).not.toContain('border-border');
  });

  it("Dark button shows selected styling when theme is 'dark'", () => {
    mockUseTheme.mockReturnValue({
      theme:         'dark',
      resolvedTheme: 'dark',
      setTheme:      jest.fn(),
    });

    render(<ThemePicker />);

    const darkBtn = screen.getByRole('button', { name: /dark/i });
    expect(darkBtn.className).toContain('border-primary');
  });

  it('only one mode button is selected at a time', () => {
    mockUseTheme.mockReturnValue({
      theme:         'system',
      resolvedTheme: 'dark',
      setTheme:      jest.fn(),
    });

    render(<ThemePicker />);

    const lightBtn = screen.getByRole('button', { name: /light/i });
    const darkBtn  = screen.getByRole('button', { name: /dark/i });
    const autoBtn  = screen.getByRole('button', { name: /auto/i });

    // Only Auto is selected
    expect(autoBtn.className).toContain('border-primary');
    expect(lightBtn.className).not.toContain('border-primary');
    expect(darkBtn.className).not.toContain('border-primary');
  });

  // -------------------------------------------------------------------------
  // Test 2 — Skeleton/placeholder before mounted
  // -------------------------------------------------------------------------

  it('shows three opacity-50 skeleton items before mounted (no interactive buttons)', () => {
    // Spy on React.useEffect and skip its FIRST call in ThemePicker, which is
    // `useEffect(() => { setMounted(true); }, [])`.
    // Because useAppTheme and useTheme are mocked (no hooks), and framer-motion
    // is mocked (no hooks), the FIRST useEffect call in the component tree is
    // the mounted-setter.
    const useEffectSpy = jest.spyOn(React, 'useEffect');
    useEffectSpy.mockImplementationOnce(
      // Replace the first useEffect call with a no-op — setMounted(true) never runs
      (_fn: React.EffectCallback, _deps?: React.DependencyList) => {}
    );

    const { container } = render(<ThemePicker />);

    // When mounted=false: three sibling <div> elements with `opacity-50`
    const skeletonItems = container.querySelectorAll('.opacity-50');
    expect(skeletonItems.length).toBe(3);

    // Each skeleton item is a <div>, not an interactive <button>
    skeletonItems.forEach((el) => {
      expect(el.tagName).toBe('DIV');
    });

    // Skeleton items contain the same labels as the real buttons
    const labels = Array.from(skeletonItems).map((el) => el.textContent?.trim());
    expect(labels).toContain('Light');
    expect(labels).toContain('Dark');
    expect(labels).toContain('Auto');

    // No real mode buttons rendered in the skeleton state
    expect(screen.queryByRole('button', { name: /auto/i })).toBeNull();
  });

  it('replaces skeleton with real buttons after mount effect runs', () => {
    // Normal render: useEffect runs, setMounted(true) fires, real buttons appear
    render(<ThemePicker />);

    // Real interactive buttons present
    expect(screen.getByRole('button', { name: /light/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dark/i  })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /auto/i  })).toBeInTheDocument();

    // Skeleton items gone
    expect(document.querySelectorAll('.opacity-50')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ===========================================================================
// B. ChannelCategories tests
// ===========================================================================
// ---------------------------------------------------------------------------

// Resolve the source file path once for all source-inspection tests
const CC_SOURCE_PATH = path.resolve(
  __dirname,
  '../../components/layout/ChannelCategories.tsx'
);

describe('ChannelCategories source code', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(CC_SOURCE_PATH, 'utf-8');
  });

  // -------------------------------------------------------------------------
  // Test 3 — No eslint-disable comments
  // -------------------------------------------------------------------------

  it('contains no eslint-disable comments', () => {
    expect(source).not.toMatch(/eslint-disable/);
  });

  it('contains no eslint-disable-next-line comments', () => {
    expect(source).not.toMatch(/eslint-disable-next-line/);
  });

  // -------------------------------------------------------------------------
  // Test 4 — useEffect has proper (stable) dependency array
  // -------------------------------------------------------------------------

  it('uses stable derived memoised keys (channelIdKey, starredKey) in effect deps', () => {
    // The initialization useEffect must depend on the memoised string keys,
    // NOT on the raw channels/starredChannels arrays (which are new references
    // every render and would cause an infinite re-render loop).
    expect(source).toContain('channelIdKey');
    expect(source).toContain('starredKey');
  });

  it('dependency array is [user?.id, currentWorkspace?.id, channelIdKey, starredKey]', () => {
    expect(source).toContain(
      '[user?.id, currentWorkspace?.id, channelIdKey, starredKey]'
    );
  });

  it('uses useMemo to derive channelIdKey from channels', () => {
    // Ensures channels.map(...).sort().join() pattern is memoised,
    // preventing new string reference on every render
    expect(source).toContain('useMemo');
    expect(source).toMatch(/channelIdKey.*=.*useMemo|useMemo.*channelIdKey/s);
  });

  it('uses an initialized ref to guard the no-saved-data branch', () => {
    // The ref prevents setCategories from being called on every render
    // in the no-saved-data path, which would otherwise cause an infinite loop.
    expect(source).toContain('initialized');
    expect(source).toContain('initialized.current');
    expect(source).toContain('useRef(false)');
  });

  it('initialization useEffect does NOT list raw channels array in deps', () => {
    // If `channels` (an array, new reference each render) appeared in the
    // dependency list of the init useEffect, it would cause an infinite loop.
    // The safe pattern uses the string-keyed memo: channelIdKey.
    const effectDepsLine = source.match(/\},\s*\[user\?\.id.*?\]\s*\)/s)?.[0] ?? '';
    // The dep array should not reference raw `channels` directly
    expect(effectDepsLine).not.toMatch(/,\s*channels[^I]/);
  });
});

describe('ChannelCategories rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
    localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test 5 — No infinite re-renders
  // -------------------------------------------------------------------------

  it('does not trigger "Maximum update depth exceeded" with empty channels', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Should complete without throwing or hitting React's update depth limit
    expect(() => {
      act(() => {
        render(<ChannelCategories {...CC_PROPS} />);
      });
    }).not.toThrow();

    const infiniteLoopLogs = errorSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].toLowerCase().includes('maximum update depth')
    );
    expect(infiniteLoopLogs).toHaveLength(0);
  });

  it('does not trigger "Maximum update depth exceeded" with non-empty channels', () => {
    resetStore({
      channels: [
        {
          id:          'ch-1',
          name:        'general',
          type:        'PUBLIC',
          workspaceId: 'ws-1',
          description: null,
          isArchived:  false,
          createdById: 'user-1',
          createdAt:   new Date(),
          memberCount: 1,
          unreadCount: 0,
        },
        {
          id:          'ch-2',
          name:        'random',
          type:        'PUBLIC',
          workspaceId: 'ws-1',
          description: null,
          isArchived:  false,
          createdById: 'user-1',
          createdAt:   new Date(),
          memberCount: 1,
          unreadCount: 0,
        },
      ],
    });

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      act(() => {
        render(<ChannelCategories {...CC_PROPS} />);
      });
    }).not.toThrow();

    const infiniteLoopLogs = errorSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].toLowerCase().includes('maximum update depth')
    );
    expect(infiniteLoopLogs).toHaveLength(0);
  });

  it('render count stabilizes (guard against infinite re-render loops)', () => {
    // Track external renders by using a wrapping component.
    // If ChannelCategories state changes cascade and propagate up (e.g. via
    // context), the wrapper would re-render. A stable component stays at 1.
    let wrapperRenderCount = 0;

    function Wrapper() {
      wrapperRenderCount++;
      return <ChannelCategories {...CC_PROPS} />;
    }

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    act(() => {
      render(<Wrapper />);
    });

    // No infinite loop errors
    const loopErrors = errorSpy.mock.calls.filter(
      (c) =>
        typeof c[0] === 'string' &&
        c[0].toLowerCase().includes('maximum update depth')
    );
    expect(loopErrors).toHaveLength(0);

    // The wrapper itself renders only once (no cascading updates out of CC)
    expect(wrapperRenderCount).toBeLessThanOrEqual(3);
  });

  // -------------------------------------------------------------------------
  // Smoke tests — component renders usable content
  // -------------------------------------------------------------------------

  it('renders without crashing when user and workspace are set', () => {
    expect(() => render(<ChannelCategories {...CC_PROPS} />)).not.toThrow();
  });

  it('renders without crashing when user is null (guards early return)', () => {
    resetStore({ user: null, currentWorkspace: null });
    expect(() => render(<ChannelCategories {...CC_PROPS} />)).not.toThrow();
  });

  it('shows "Add category" button', () => {
    render(<ChannelCategories {...CC_PROPS} />);
    expect(screen.getByText('Add category')).toBeInTheDocument();
  });

  it('shows "Channels" default category after initialization', () => {
    render(<ChannelCategories {...CC_PROPS} />);
    expect(screen.getByText('Channels')).toBeInTheDocument();
  });

  it('shows "Direct Messages" default category after initialization', () => {
    render(<ChannelCategories {...CC_PROPS} />);
    expect(screen.getByText('Direct Messages')).toBeInTheDocument();
  });

  it('displays channel names within Channels category', () => {
    resetStore({
      channels: [
        {
          id:          'ch-1',
          name:        'general',
          type:        'PUBLIC',
          workspaceId: 'ws-1',
          description: null,
          isArchived:  false,
          createdById: 'user-1',
          createdAt:   new Date(),
          memberCount: 5,
          unreadCount: 0,
        },
      ],
    });

    render(<ChannelCategories {...CC_PROPS} />);
    expect(screen.getByText('general')).toBeInTheDocument();
  });

  it('persists categories to localStorage on render', () => {
    render(<ChannelCategories {...CC_PROPS} />);
    // Save effect writes the initialized categories to localStorage
    const stored = localStorage.getItem('slack-clone-channel-categories-user-1-ws-1');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });
});
