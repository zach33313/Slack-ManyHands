/**
 * @jest-environment jsdom
 *
 * __tests__/animations/AnimatedReactionBar.test.tsx
 *
 * Tests for the AnimatedReactionBar component.
 * Verifies:
 *   - Renders nothing when there are no reactions
 *   - Renders animated reaction pills with emoji and count
 *   - Emits message:react / message:unreact on toggle click
 *   - Emits message:react when using the picker to add a new reaction
 *   - Correct title attribute text
 *   - Reaction pills are rendered with data-reaction-emoji attribute
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ReactionGroup } from '@/shared/types';

// ---------------------------------------------------------------------------
// Mock framer-motion
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
      onClick,
      type,
      title,
      'data-reaction-emoji': reactionEmoji,
      'data-testid': testId,
      ...rest
    }: Record<string, unknown>) {
      const testProps: Record<string, string | undefined> = {};
      if (typeof reactionEmoji === 'string') testProps['data-reaction-emoji'] = reactionEmoji;
      if (typeof testId === 'string') testProps['data-testid'] = testId;
      return React.createElement(
        tag,
        { className, style, onClick, type, title, ...testProps, ...rest },
        children,
      );
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
// Mock useSocket
// ---------------------------------------------------------------------------
const mockSocket = {
  emit: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
};
jest.mock('@/shared/hooks/useSocket', () => ({
  useSocket: () => mockSocket,
}));

// ---------------------------------------------------------------------------
// Mock ReactionPicker
// ---------------------------------------------------------------------------
jest.mock('@/messages/components/ReactionPicker', () => ({
  ReactionPicker: ({ onSelect }: { onSelect: (emoji: string) => void }) => (
    <button data-testid="add-reaction-btn" onClick={() => onSelect('🎉')}>
      +
    </button>
  ),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { AnimatedReactionBar } from '@/messages/components/AnimatedReactionBar';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CURRENT_USER_ID = 'user-alice';
const OTHER_USER_ID = 'user-bob';
const MESSAGE_ID = 'msg-abc';

function makeReactions(overrides: Partial<ReactionGroup>[] = []): ReactionGroup[] {
  return overrides.map((o, i) => ({
    emoji: '👍',
    count: 1,
    userIds: [OTHER_USER_ID],
    ...o,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnimatedReactionBar — empty state', () => {
  it('renders nothing when reactions array is empty', () => {
    const { container } = render(
      <AnimatedReactionBar messageId={MESSAGE_ID} reactions={[]} currentUserId={CURRENT_USER_ID} />,
    );
    // AnimatePresence wraps the bar — when hasReactions is false, nothing renders
    expect(container.firstChild).toBeNull();
  });
});

describe('AnimatedReactionBar — rendering reaction pills', () => {
  const reactions: ReactionGroup[] = [
    { emoji: '👍', count: 3, userIds: [CURRENT_USER_ID, OTHER_USER_ID, 'user-carol'] },
    { emoji: '❤️', count: 1, userIds: [OTHER_USER_ID] },
  ];

  it('renders a pill for each reaction', () => {
    render(
      <AnimatedReactionBar
        messageId={MESSAGE_ID}
        reactions={reactions}
        currentUserId={CURRENT_USER_ID}
      />,
    );
    expect(screen.getByText('👍')).toBeInTheDocument();
    expect(screen.getByText('❤️')).toBeInTheDocument();
  });

  it('renders the count for each reaction', () => {
    render(
      <AnimatedReactionBar
        messageId={MESSAGE_ID}
        reactions={reactions}
        currentUserId={CURRENT_USER_ID}
      />,
    );
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders the add-reaction picker button when there are reactions', () => {
    render(
      <AnimatedReactionBar
        messageId={MESSAGE_ID}
        reactions={reactions}
        currentUserId={CURRENT_USER_ID}
      />,
    );
    expect(screen.getByTestId('add-reaction-btn')).toBeInTheDocument();
  });

  it('renders reaction pills with data-reaction-emoji attribute', () => {
    const { container } = render(
      <AnimatedReactionBar
        messageId={MESSAGE_ID}
        reactions={reactions}
        currentUserId={CURRENT_USER_ID}
      />,
    );
    const thumbsBtn = container.querySelector('[data-reaction-emoji="👍"]');
    const heartBtn = container.querySelector('[data-reaction-emoji="❤️"]');
    expect(thumbsBtn).toBeInTheDocument();
    expect(heartBtn).toBeInTheDocument();
  });
});

describe('AnimatedReactionBar — title attributes', () => {
  it('shows "1 reaction" for a reaction with count 1', () => {
    const reactions: ReactionGroup[] = [
      { emoji: '👍', count: 1, userIds: [CURRENT_USER_ID] },
    ];
    render(
      <AnimatedReactionBar
        messageId={MESSAGE_ID}
        reactions={reactions}
        currentUserId={CURRENT_USER_ID}
      />,
    );
    const btn = screen.getByText('👍').closest('button')!;
    expect(btn).toHaveAttribute('title', '1 reaction');
  });

  it('shows "5 reactions" for a reaction with count 5', () => {
    const reactions: ReactionGroup[] = [
      { emoji: '🔥', count: 5, userIds: ['a', 'b', 'c', 'd', 'e'] },
    ];
    render(
      <AnimatedReactionBar
        messageId={MESSAGE_ID}
        reactions={reactions}
        currentUserId={CURRENT_USER_ID}
      />,
    );
    const btn = screen.getByText('🔥').closest('button')!;
    expect(btn).toHaveAttribute('title', '5 reactions');
  });
});

describe('AnimatedReactionBar — socket interactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('emits message:unreact when clicking a reaction the current user already reacted to', () => {
    const reactions: ReactionGroup[] = [
      { emoji: '👍', count: 2, userIds: [CURRENT_USER_ID, OTHER_USER_ID] },
    ];
    render(
      <AnimatedReactionBar
        messageId={MESSAGE_ID}
        reactions={reactions}
        currentUserId={CURRENT_USER_ID}
      />,
    );

    const thumbsBtn = screen.getByText('👍').closest('button')!;
    fireEvent.click(thumbsBtn);

    expect(mockSocket.emit).toHaveBeenCalledWith('message:unreact', {
      messageId: MESSAGE_ID,
      emoji: '👍',
    });
  });

  it('emits message:react when clicking a reaction the current user has not reacted to', () => {
    const reactions: ReactionGroup[] = [
      { emoji: '👍', count: 1, userIds: [OTHER_USER_ID] },
    ];
    render(
      <AnimatedReactionBar
        messageId={MESSAGE_ID}
        reactions={reactions}
        currentUserId={CURRENT_USER_ID}
      />,
    );

    const thumbsBtn = screen.getByText('👍').closest('button')!;
    fireEvent.click(thumbsBtn);

    expect(mockSocket.emit).toHaveBeenCalledWith('message:react', {
      messageId: MESSAGE_ID,
      emoji: '👍',
    });
  });

  it('emits message:react with correct emoji when adding a new reaction via the picker', () => {
    const reactions: ReactionGroup[] = [
      { emoji: '👍', count: 1, userIds: [OTHER_USER_ID] },
    ];
    render(
      <AnimatedReactionBar
        messageId={MESSAGE_ID}
        reactions={reactions}
        currentUserId={CURRENT_USER_ID}
      />,
    );

    fireEvent.click(screen.getByTestId('add-reaction-btn'));

    expect(mockSocket.emit).toHaveBeenCalledWith('message:react', {
      messageId: MESSAGE_ID,
      emoji: '🎉',
    });
  });

  it('emits with the correct messageId', () => {
    const reactions: ReactionGroup[] = [
      { emoji: '❤️', count: 1, userIds: [OTHER_USER_ID] },
    ];
    render(
      <AnimatedReactionBar
        messageId="specific-msg-id"
        reactions={reactions}
        currentUserId={CURRENT_USER_ID}
      />,
    );

    fireEvent.click(screen.getByText('❤️').closest('button')!);

    expect(mockSocket.emit).toHaveBeenCalledWith('message:react', {
      messageId: 'specific-msg-id',
      emoji: '❤️',
    });
  });

  it('emits exactly one event per click', () => {
    const reactions: ReactionGroup[] = [
      { emoji: '👍', count: 1, userIds: [OTHER_USER_ID] },
    ];
    render(
      <AnimatedReactionBar
        messageId={MESSAGE_ID}
        reactions={reactions}
        currentUserId={CURRENT_USER_ID}
      />,
    );

    fireEvent.click(screen.getByText('👍').closest('button')!);

    expect(mockSocket.emit).toHaveBeenCalledTimes(1);
  });
});

describe('AnimatedReactionBar — multiple reactions', () => {
  it('correctly identifies which reactions the current user has reacted to', () => {
    const reactions: ReactionGroup[] = [
      { emoji: '👍', count: 2, userIds: [CURRENT_USER_ID, OTHER_USER_ID] },
      { emoji: '🔥', count: 1, userIds: [OTHER_USER_ID] },
    ];
    render(
      <AnimatedReactionBar
        messageId={MESSAGE_ID}
        reactions={reactions}
        currentUserId={CURRENT_USER_ID}
      />,
    );

    // Click thumbs (user has reacted) → should unreact
    fireEvent.click(screen.getByText('👍').closest('button')!);
    expect(mockSocket.emit).toHaveBeenCalledWith('message:unreact', expect.objectContaining({ emoji: '👍' }));

    jest.clearAllMocks();

    // Click fire (user has NOT reacted) → should react
    fireEvent.click(screen.getByText('🔥').closest('button')!);
    expect(mockSocket.emit).toHaveBeenCalledWith('message:react', expect.objectContaining({ emoji: '🔥' }));
  });
});
