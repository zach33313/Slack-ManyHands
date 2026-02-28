/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ReactionBar } from '@/messages/components/ReactionBar';
import { createMockSocket, createReactions, CURRENT_USER_ID, OTHER_USER_ID } from './setup';
import type { ReactionGroup } from '@/shared/types';

// Mock useSocket
const mockSocket = createMockSocket();
jest.mock('@/shared/hooks/useSocket', () => ({
  useSocket: () => mockSocket,
}));

// Mock ReactionPicker to avoid emoji-mart complexity
jest.mock('@/messages/components/ReactionPicker', () => ({
  ReactionPicker: ({ onSelect }: { onSelect: (emoji: string) => void }) => (
    <button data-testid="add-reaction-btn" onClick={() => onSelect('🎉')}>
      +
    </button>
  ),
}));

describe('ReactionBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when there are no reactions', () => {
    const { container } = render(
      <ReactionBar messageId="msg-1" reactions={[]} currentUserId={CURRENT_USER_ID} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders reaction pills with emoji and count', () => {
    const reactions = createReactions();
    render(
      <ReactionBar messageId="msg-1" reactions={reactions} currentUserId={CURRENT_USER_ID} />
    );
    expect(screen.getByText('👍')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('❤️')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('highlights reactions the current user has reacted to', () => {
    const reactions: ReactionGroup[] = [
      { emoji: '👍', count: 2, userIds: [CURRENT_USER_ID, OTHER_USER_ID] },
      { emoji: '🔥', count: 1, userIds: [OTHER_USER_ID] },
    ];
    render(
      <ReactionBar messageId="msg-1" reactions={reactions} currentUserId={CURRENT_USER_ID} />
    );

    const thumbsButton = screen.getByText('👍').closest('button')!;
    expect(thumbsButton).toHaveClass('bg-blue-50');

    const fireButton = screen.getByText('🔥').closest('button')!;
    expect(fireButton).not.toHaveClass('bg-blue-50');
  });

  it('emits message:unreact when clicking a reaction the user already has', () => {
    const reactions: ReactionGroup[] = [
      { emoji: '👍', count: 2, userIds: [CURRENT_USER_ID, OTHER_USER_ID] },
    ];
    render(
      <ReactionBar messageId="msg-1" reactions={reactions} currentUserId={CURRENT_USER_ID} />
    );

    const thumbsButton = screen.getByText('👍').closest('button')!;
    fireEvent.click(thumbsButton);

    expect(mockSocket.emit).toHaveBeenCalledWith('message:unreact', {
      messageId: 'msg-1',
      emoji: '👍',
    });
  });

  it('emits message:react when clicking a reaction the user has not reacted to', () => {
    const reactions: ReactionGroup[] = [
      { emoji: '👍', count: 1, userIds: [OTHER_USER_ID] },
    ];
    render(
      <ReactionBar messageId="msg-1" reactions={reactions} currentUserId={CURRENT_USER_ID} />
    );

    const thumbsButton = screen.getByText('👍').closest('button')!;
    fireEvent.click(thumbsButton);

    expect(mockSocket.emit).toHaveBeenCalledWith('message:react', {
      messageId: 'msg-1',
      emoji: '👍',
    });
  });

  it('renders a "+" button to add new reactions', () => {
    const reactions = createReactions();
    render(
      <ReactionBar messageId="msg-1" reactions={reactions} currentUserId={CURRENT_USER_ID} />
    );
    expect(screen.getByTestId('add-reaction-btn')).toBeInTheDocument();
  });

  it('emits message:react when adding a new reaction via the picker', () => {
    const reactions = createReactions();
    render(
      <ReactionBar messageId="msg-1" reactions={reactions} currentUserId={CURRENT_USER_ID} />
    );

    fireEvent.click(screen.getByTestId('add-reaction-btn'));

    expect(mockSocket.emit).toHaveBeenCalledWith('message:react', {
      messageId: 'msg-1',
      emoji: '🎉',
    });
  });

  it('shows correct title text for single reaction', () => {
    const reactions: ReactionGroup[] = [
      { emoji: '👍', count: 1, userIds: [CURRENT_USER_ID] },
    ];
    render(
      <ReactionBar messageId="msg-1" reactions={reactions} currentUserId={CURRENT_USER_ID} />
    );
    const button = screen.getByText('👍').closest('button')!;
    expect(button).toHaveAttribute('title', '1 reaction');
  });

  it('shows correct title text for multiple reactions', () => {
    const reactions: ReactionGroup[] = [
      { emoji: '👍', count: 5, userIds: ['a', 'b', 'c', 'd', 'e'] },
    ];
    render(
      <ReactionBar messageId="msg-1" reactions={reactions} currentUserId={CURRENT_USER_ID} />
    );
    const button = screen.getByText('👍').closest('button')!;
    expect(button).toHaveAttribute('title', '5 reactions');
  });
});
