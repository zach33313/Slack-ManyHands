/**
 * @jest-environment jsdom
 *
 * __tests__/animations/AnimatedMessage.test.tsx
 *
 * Tests for the AnimatedMessage wrapper component.
 * Verifies:
 *   - Own vs other-user animation variant selection
 *   - Edit flash: 'message-just-edited' class applied on edit, removed after 650ms
 *   - Delete transition: animate prop switches from string 'animate' to opacity/scale object
 */

import React from 'react';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { MessageWithMeta } from '@/shared/types';

// ---------------------------------------------------------------------------
// Mock framer-motion — render m.div/m.button/m.span as plain HTML elements.
// Captures the `animate` prop as data-animate and `variants` as data-variants.
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
      layoutId,
      ...rest
    }: Record<string, unknown>) {
      const testProps: Record<string, string> = {};
      if (animate !== undefined) {
        testProps['data-animate'] =
          typeof animate === 'string' ? animate : JSON.stringify(animate);
      }
      if (variants !== undefined) {
        testProps['data-variants'] = JSON.stringify(variants);
      }
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
// Mock MessageItem — avoids pulling in the full component tree
// ---------------------------------------------------------------------------
jest.mock('@/messages/components/MessageItem', () => ({
  MessageItem: ({ message }: { message: { id: string; contentPlain: string } }) => (
    <div data-testid="message-item" data-message-id={message.id}>
      {message.contentPlain}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Import after mocks are established
// ---------------------------------------------------------------------------
import { AnimatedMessage } from '@/messages/components/AnimatedMessage';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CURRENT_USER_ID = 'user-alice';
const OTHER_USER_ID = 'user-bob';

function makeTiptap(text: string) {
  return {
    type: 'doc' as const,
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

function createMessage(overrides: Partial<MessageWithMeta> = {}): MessageWithMeta {
  return {
    id: 'msg-1',
    channelId: 'channel-1',
    userId: OTHER_USER_ID,
    content: makeTiptap('Hello world'),
    contentPlain: 'Hello world',
    parentId: null,
    replyCount: 0,
    isEdited: false,
    isDeleted: false,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    author: { id: OTHER_USER_ID, name: 'Bob', image: null },
    files: [],
    reactions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnimatedMessage — variant selection', () => {
  it("uses messageVariants (y: 10 initial) for other users' messages", () => {
    const msg = createMessage({ userId: OTHER_USER_ID });
    const { container } = render(
      <AnimatedMessage message={msg} currentUserId={CURRENT_USER_ID} />,
    );

    const motionDiv = container.firstChild as HTMLElement;
    const variantsRaw = motionDiv.getAttribute('data-variants');
    expect(variantsRaw).not.toBeNull();
    const variants = JSON.parse(variantsRaw!);
    // messageVariants.initial = { opacity: 0, y: 10 }
    expect(variants.initial?.y).toBe(10);
    expect(variants.initial?.x).toBeUndefined();
  });

  it("uses ownMessageVariants (x: 12 initial) for the current user's own messages", () => {
    const msg = createMessage({ userId: CURRENT_USER_ID });
    const { container } = render(
      <AnimatedMessage message={msg} currentUserId={CURRENT_USER_ID} />,
    );

    const motionDiv = container.firstChild as HTMLElement;
    const variants = JSON.parse(motionDiv.getAttribute('data-variants')!);
    // ownMessageVariants.initial = { opacity: 0, x: 12 }
    expect(variants.initial?.x).toBe(12);
    expect(variants.initial?.y).toBeUndefined();
  });

  it('renders MessageItem inside the motion wrapper', () => {
    const msg = createMessage();
    const { getByTestId } = render(
      <AnimatedMessage message={msg} currentUserId={CURRENT_USER_ID} />,
    );
    expect(getByTestId('message-item')).toBeInTheDocument();
  });

  it('default animate prop is "animate" (string)', () => {
    const msg = createMessage();
    const { container } = render(
      <AnimatedMessage message={msg} currentUserId={CURRENT_USER_ID} />,
    );
    const motionDiv = container.firstChild as HTMLElement;
    expect(motionDiv.getAttribute('data-animate')).toBe('animate');
  });
});

describe('AnimatedMessage — edit flash', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not apply message-just-edited on initial render', () => {
    const msg = createMessage({ editedAt: null, isEdited: false });
    const { container } = render(
      <AnimatedMessage message={msg} currentUserId={CURRENT_USER_ID} />,
    );
    expect(container.firstChild).not.toHaveClass('message-just-edited');
  });

  it('applies message-just-edited class when editedAt changes and isEdited is true', () => {
    // Start with an already-edited message (editedAt is non-null so prevEditedAt.current
    // is initialized to a Date on first render, not null — allowing the next edit to flash)
    const editedAt1 = new Date('2024-01-01T10:00:00Z');
    const editedAt2 = new Date('2024-01-01T12:00:00Z');
    const msg = createMessage({ editedAt: editedAt1, isEdited: true });
    const { container, rerender } = render(
      <AnimatedMessage message={msg} currentUserId={CURRENT_USER_ID} />,
    );

    act(() => {
      rerender(
        <AnimatedMessage
          message={{ ...msg, editedAt: editedAt2 }}
          currentUserId={CURRENT_USER_ID}
        />,
      );
    });

    expect(container.firstChild).toHaveClass('message-just-edited');
  });

  it('removes message-just-edited class after 650ms', () => {
    const editedAt1 = new Date('2024-01-01T10:00:00Z');
    const editedAt2 = new Date('2024-01-01T12:00:00Z');
    const msg = createMessage({ editedAt: editedAt1, isEdited: true });
    const { container, rerender } = render(
      <AnimatedMessage message={msg} currentUserId={CURRENT_USER_ID} />,
    );

    act(() => {
      rerender(
        <AnimatedMessage
          message={{ ...msg, editedAt: editedAt2 }}
          currentUserId={CURRENT_USER_ID}
        />,
      );
    });

    expect(container.firstChild).toHaveClass('message-just-edited');

    act(() => {
      jest.advanceTimersByTime(700);
    });

    expect(container.firstChild).not.toHaveClass('message-just-edited');
  });

  it('does not apply flash when editedAt changes but isEdited is false', () => {
    const msg = createMessage({ editedAt: null, isEdited: false });
    const { container, rerender } = render(
      <AnimatedMessage message={msg} currentUserId={CURRENT_USER_ID} />,
    );

    act(() => {
      rerender(
        <AnimatedMessage
          message={{ ...msg, editedAt: new Date(), isEdited: false }}
          currentUserId={CURRENT_USER_ID}
        />,
      );
    });

    expect(container.firstChild).not.toHaveClass('message-just-edited');
  });

  it('does not apply flash when editedAt does not change', () => {
    const editedAt = new Date('2024-01-01T12:00:00Z');
    const msg = createMessage({ editedAt, isEdited: true });
    const { container, rerender } = render(
      <AnimatedMessage message={msg} currentUserId={CURRENT_USER_ID} />,
    );

    // Same editedAt, just re-render
    act(() => {
      rerender(
        <AnimatedMessage
          message={{ ...msg, editedAt, contentPlain: 'Updated text' }}
          currentUserId={CURRENT_USER_ID}
        />,
      );
    });

    expect(container.firstChild).not.toHaveClass('message-just-edited');
  });
});

describe('AnimatedMessage — delete transition', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('animate prop is "animate" string when not deleted', () => {
    const msg = createMessage({ isDeleted: false });
    const { container } = render(
      <AnimatedMessage message={msg} currentUserId={CURRENT_USER_ID} />,
    );
    const motionDiv = container.firstChild as HTMLElement;
    expect(motionDiv.getAttribute('data-animate')).toBe('animate');
  });

  it('animate prop becomes object with opacity 0.4 when isDeleted transitions to true', () => {
    const msg = createMessage({ isDeleted: false });
    const { container, rerender } = render(
      <AnimatedMessage message={msg} currentUserId={CURRENT_USER_ID} />,
    );

    act(() => {
      rerender(
        <AnimatedMessage
          message={{ ...msg, isDeleted: true }}
          currentUserId={CURRENT_USER_ID}
        />,
      );
    });

    const motionDiv = container.firstChild as HTMLElement;
    const animateRaw = motionDiv.getAttribute('data-animate');
    expect(animateRaw).not.toBe('animate');
    const animateObj = JSON.parse(animateRaw!);
    expect(animateObj.opacity).toBe(0.4);
  });

  it('animate prop includes scale 0.98 during delete transition', () => {
    const msg = createMessage({ isDeleted: false });
    const { container, rerender } = render(
      <AnimatedMessage message={msg} currentUserId={CURRENT_USER_ID} />,
    );

    act(() => {
      rerender(
        <AnimatedMessage
          message={{ ...msg, isDeleted: true }}
          currentUserId={CURRENT_USER_ID}
        />,
      );
    });

    const motionDiv = container.firstChild as HTMLElement;
    const animateObj = JSON.parse(motionDiv.getAttribute('data-animate')!);
    expect(animateObj.scale).toBe(0.98);
  });

  it('reverts to "animate" string after 200ms delete transition', () => {
    const msg = createMessage({ isDeleted: false });
    const { container, rerender } = render(
      <AnimatedMessage message={msg} currentUserId={CURRENT_USER_ID} />,
    );

    act(() => {
      rerender(
        <AnimatedMessage
          message={{ ...msg, isDeleted: true }}
          currentUserId={CURRENT_USER_ID}
        />,
      );
    });

    act(() => {
      jest.advanceTimersByTime(250);
    });

    const motionDiv = container.firstChild as HTMLElement;
    expect(motionDiv.getAttribute('data-animate')).toBe('animate');
  });
});
