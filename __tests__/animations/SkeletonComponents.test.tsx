/**
 * @jest-environment jsdom
 *
 * __tests__/animations/SkeletonComponents.test.tsx
 *
 * Tests for all skeleton loading components:
 *   - SkeletonMessage (full and compact variants)
 *   - SkeletonMessageList
 *   - SkeletonChannelList
 *   - SkeletonMemberList
 *
 * Verifies structure, counts, and prop-driven behavior.
 * Animation details (shimmer, stagger) are covered in animations.test.ts.
 */

import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';

// ---------------------------------------------------------------------------
// Mock framer-motion — render m.div as plain div, pass className through
// ---------------------------------------------------------------------------
jest.mock('framer-motion', () => {
  const React = require('react');

  function createMotionElement(tag: string) {
    return function MotionElement({
      children,
      className,
      style,
      animate,
      initial,
      variants,
      exit,
      transition,
      whileTap,
      whileHover,
      ...rest
    }: Record<string, unknown>) {
      return React.createElement(tag, { className, style, ...rest }, children);
    };
  }

  return {
    m: {
      div: createMotionElement('div'),
      button: createMotionElement('button'),
      span: createMotionElement('span'),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    LazyMotion: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    domAnimation: {},
  };
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------
import { SkeletonMessage, SkeletonMessageList } from '@/components/ui/SkeletonMessage';
import { SkeletonChannelList } from '@/components/ui/SkeletonChannelList';
import { SkeletonMemberList } from '@/components/ui/SkeletonMemberList';

// ---------------------------------------------------------------------------
// SkeletonMessage
// ---------------------------------------------------------------------------

describe('SkeletonMessage — full variant (default)', () => {
  it('renders without crashing', () => {
    const { container } = render(<SkeletonMessage />);
    expect(container.firstChild).not.toBeNull();
  });

  it('has the full-layout class (pt-2 indicates full not compact)', () => {
    const { container } = render(<SkeletonMessage />);
    const outerDiv = container.firstChild as HTMLElement;
    // Full variant uses 'pt-2 pb-0.5', compact uses 'py-0.5'
    expect(outerDiv.className).toContain('pt-2');
  });

  it('renders an avatar circle (rounded-full h-10 w-10)', () => {
    const { container } = render(<SkeletonMessage />);
    const avatar = container.querySelector('.rounded-full.h-10.w-10');
    expect(avatar).not.toBeNull();
  });

  it('renders a name bar (w-[120px])', () => {
    const { container } = render(<SkeletonMessage />);
    // Name bar has class 'w-[120px]'
    const nameBar = container.querySelector('[class*="w-\\[120px\\]"]');
    expect(nameBar).not.toBeNull();
  });

  it('renders multiple shimmer blocks (content lines)', () => {
    const { container } = render(<SkeletonMessage />);
    // ShimmerBlock renders as m.div → div with class "rounded ..."
    // Full message: avatar(1) + name(1) + timestamp(1) + 3 content lines = at least 5 shimmer blocks
    const shimmerBlocks = container.querySelectorAll('[class*="rounded"]');
    expect(shimmerBlocks.length).toBeGreaterThanOrEqual(5);
  });
});

describe('SkeletonMessage — compact variant', () => {
  it('renders without crashing', () => {
    const { container } = render(<SkeletonMessage compact />);
    expect(container.firstChild).not.toBeNull();
  });

  it('has the compact layout class (py-0.5, no pt-2)', () => {
    const { container } = render(<SkeletonMessage compact />);
    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv.className).toContain('py-0.5');
    expect(outerDiv.className).not.toContain('pt-2');
  });

  it('does not render an avatar circle in compact mode', () => {
    const { container } = render(<SkeletonMessage compact />);
    const avatar = container.querySelector('.rounded-full.h-10.w-10');
    expect(avatar).toBeNull();
  });

  it('renders exactly 2 content shimmer blocks in compact mode', () => {
    const { container } = render(<SkeletonMessage compact />);
    // Compact: 2 ShimmerBlock elements (h-4 w-3/4 and h-4 w-1/2)
    const shimmerBlocks = container.querySelectorAll('[class*="h-4"]');
    expect(shimmerBlocks.length).toBe(2);
  });

  it('has an indent spacer div (w-[52px]) in place of the avatar', () => {
    const { container } = render(<SkeletonMessage compact />);
    const spacer = container.querySelector('.w-\\[52px\\]');
    expect(spacer).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SkeletonMessageList
// ---------------------------------------------------------------------------

describe('SkeletonMessageList', () => {
  it('renders 5 skeleton messages by default', () => {
    const { container } = render(<SkeletonMessageList />);
    // Each SkeletonMessage renders as an m.div → div.
    // The wrapper m.div is flex-col; children are SkeletonMessage items.
    // Full messages have pt-2, compact messages have py-0.5
    const allItems = container.querySelectorAll('[class*="px-5"]');
    expect(allItems).toHaveLength(5);
  });

  it('renders the requested count of messages', () => {
    const { container } = render(<SkeletonMessageList count={3} />);
    const allItems = container.querySelectorAll('[class*="px-5"]');
    expect(allItems).toHaveLength(3);
  });

  it('first message is full (has avatar)', () => {
    const { container } = render(<SkeletonMessageList count={3} />);
    // i=0: compact = false (i > 0 is false), so it's full
    const avatar = container.querySelector('.rounded-full.h-10.w-10');
    expect(avatar).not.toBeNull();
  });

  it('item at index 3 (every 3rd) is full (has avatar)', () => {
    const { container } = render(<SkeletonMessageList count={5} />);
    // i=3: compact = (3 > 0 && 3 % 3 !== 0) = (true && false) = false → full
    // So we expect at least 2 full messages: index 0 and index 3
    const avatars = container.querySelectorAll('.rounded-full.h-10.w-10');
    expect(avatars.length).toBeGreaterThanOrEqual(2);
  });

  it('renders a containing div with flex-col class', () => {
    const { container } = render(<SkeletonMessageList />);
    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv.className).toContain('flex-col');
  });
});

// ---------------------------------------------------------------------------
// SkeletonChannelList
// ---------------------------------------------------------------------------

describe('SkeletonChannelList', () => {
  it('renders without crashing', () => {
    const { container } = render(<SkeletonChannelList />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders 8 channel skeleton items by default', () => {
    const { container } = render(<SkeletonChannelList />);
    // Each SkeletonChannelItem has class 'flex items-center gap-2 px-3 py-1.5'
    const items = container.querySelectorAll('[class*="py-1\\.5"]');
    expect(items).toHaveLength(8);
  });

  it('renders a custom count of channel items', () => {
    const { container } = render(<SkeletonChannelList count={5} />);
    const items = container.querySelectorAll('[class*="py-1\\.5"]');
    expect(items).toHaveLength(5);
  });

  it('renders a header shimmer block by default (showHeader=true)', () => {
    const { container } = render(<SkeletonChannelList showHeader />);
    // Header div has class 'mb-1 flex items-center gap-2 px-3 py-1'
    const header = container.querySelector('[class*="mb-1"]');
    expect(header).not.toBeNull();
  });

  it('does not render a header when showHeader is false', () => {
    const { container } = render(<SkeletonChannelList showHeader={false} />);
    const header = container.querySelector('[class*="mb-1"]');
    expect(header).toBeNull();
  });

  it('each channel item has a hash icon placeholder and a name bar', () => {
    const { container } = render(<SkeletonChannelList count={1} />);
    // Each item has a 4×4 icon placeholder (rounded-sm h-4 w-4) and a name bar
    const iconPlaceholder = container.querySelector('.rounded-sm.h-4.w-4');
    expect(iconPlaceholder).not.toBeNull();
    // Name bar has class h-3.5 and a width class
    const nameBar = container.querySelector('[class*="h-3\\.5"]');
    expect(nameBar).not.toBeNull();
  });

  it('wraps items in a stagger container', () => {
    const { container } = render(<SkeletonChannelList />);
    // The outer div wraps items — just verify items are rendered
    const items = container.querySelectorAll('[class*="py-1\\.5"]');
    expect(items.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// SkeletonMemberList
// ---------------------------------------------------------------------------

describe('SkeletonMemberList', () => {
  it('renders without crashing', () => {
    const { container } = render(<SkeletonMemberList />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders 6 member skeleton items by default', () => {
    const { container } = render(<SkeletonMemberList />);
    // Each SkeletonMemberItem has class 'flex items-center gap-2.5 px-3 py-2'
    const items = container.querySelectorAll('[class*="gap-2\\.5"]');
    expect(items).toHaveLength(6);
  });

  it('renders a custom count of member items', () => {
    const { container } = render(<SkeletonMemberList count={3} />);
    const items = container.querySelectorAll('[class*="gap-2\\.5"]');
    expect(items).toHaveLength(3);
  });

  it('each member item has an avatar circle (h-8 w-8 rounded-full)', () => {
    const { container } = render(<SkeletonMemberList count={1} />);
    const avatar = container.querySelector('.rounded-full.h-8.w-8');
    expect(avatar).not.toBeNull();
  });

  it('each member item has a name bar and a status bar', () => {
    const { container } = render(<SkeletonMemberList count={1} />);
    // Name bar has h-3.5, status bar has h-3
    const nameBar = container.querySelector('[class*="h-3\\.5"]');
    const statusBar = container.querySelector('[class*="h-3"]');
    expect(nameBar).not.toBeNull();
    expect(statusBar).not.toBeNull();
  });

  it('has a py-2 outer container', () => {
    const { container } = render(<SkeletonMemberList />);
    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv.className).toContain('py-2');
  });

  it('different items have varying name widths', () => {
    const { container } = render(<SkeletonMemberList count={6} />);
    const nameBars = container.querySelectorAll('[class*="h-3\\.5"]');
    // Collect all class strings and verify there is more than one unique width
    const widthClasses = Array.from(nameBars).map((el) => {
      const match = el.className.match(/w-\w+/);
      return match ? match[0] : '';
    });
    const uniqueWidths = new Set(widthClasses);
    expect(uniqueWidths.size).toBeGreaterThan(1);
  });
});
