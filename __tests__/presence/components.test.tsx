/**
 * Tests for presence/components/TypingIndicator.tsx
 *
 * Covers:
 * - Hidden when no users are typing
 * - Single user: "Alice is typing"
 * - Two users: "Alice and Bob are typing"
 * - Three users: "Alice, Bob, and Charlie are typing"
 * - Four+ users: "Several people are typing"
 * - Animated dots are present
 * - Accessibility: role="status", aria-live="polite"
 * - Custom className is applied
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock the presence store
const mockTypingByChannel: Record<string, any[]> = {};

jest.mock('@/presence/store', () => ({
  usePresenceStore: (selector: (state: any) => any) =>
    selector({
      presenceMap: {},
      typingByChannel: mockTypingByChannel,
      setPresence: jest.fn(),
      setTypingUsers: jest.fn(),
      getPresence: () => 'offline',
    }),
}));

import { TypingIndicator } from '@/presence/components/TypingIndicator';

describe('TypingIndicator', () => {
  beforeEach(() => {
    // Reset typing state
    Object.keys(mockTypingByChannel).forEach((k) => delete mockTypingByChannel[k]);
  });

  it('renders nothing when no users are typing', () => {
    mockTypingByChannel['ch-1'] = [];

    const { container } = render(<TypingIndicator channelId="ch-1" />);

    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when channelId has no typing data', () => {
    const { container } = render(<TypingIndicator channelId="ch-no-data" />);

    expect(container.innerHTML).toBe('');
  });

  it('renders "Alice is typing" for one user', () => {
    mockTypingByChannel['ch-1'] = [{ userId: 'user-1', name: 'Alice' }];

    render(<TypingIndicator channelId="ch-1" />);

    expect(screen.getByText('Alice is typing')).toBeInTheDocument();
  });

  it('renders "Alice and Bob are typing" for two users', () => {
    mockTypingByChannel['ch-1'] = [
      { userId: 'user-1', name: 'Alice' },
      { userId: 'user-2', name: 'Bob' },
    ];

    render(<TypingIndicator channelId="ch-1" />);

    expect(screen.getByText('Alice and Bob are typing')).toBeInTheDocument();
  });

  it('renders "Alice, Bob, and Charlie are typing" for three users', () => {
    mockTypingByChannel['ch-1'] = [
      { userId: 'user-1', name: 'Alice' },
      { userId: 'user-2', name: 'Bob' },
      { userId: 'user-3', name: 'Charlie' },
    ];

    render(<TypingIndicator channelId="ch-1" />);

    expect(
      screen.getByText('Alice, Bob, and Charlie are typing')
    ).toBeInTheDocument();
  });

  it('renders "Several people are typing" for four or more users', () => {
    mockTypingByChannel['ch-1'] = [
      { userId: 'user-1', name: 'Alice' },
      { userId: 'user-2', name: 'Bob' },
      { userId: 'user-3', name: 'Charlie' },
      { userId: 'user-4', name: 'Dave' },
    ];

    render(<TypingIndicator channelId="ch-1" />);

    expect(screen.getByText('Several people are typing')).toBeInTheDocument();
  });

  it('renders animated bouncing dots', () => {
    mockTypingByChannel['ch-1'] = [{ userId: 'user-1', name: 'Alice' }];

    const { container } = render(<TypingIndicator channelId="ch-1" />);

    const dots = container.querySelectorAll('.animate-bounce');
    expect(dots.length).toBe(3);
  });

  it('has role="status" for accessibility', () => {
    mockTypingByChannel['ch-1'] = [{ userId: 'user-1', name: 'Alice' }];

    render(<TypingIndicator channelId="ch-1" />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has aria-live="polite" for screen readers', () => {
    mockTypingByChannel['ch-1'] = [{ userId: 'user-1', name: 'Alice' }];

    render(<TypingIndicator channelId="ch-1" />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('applies custom className', () => {
    mockTypingByChannel['ch-1'] = [{ userId: 'user-1', name: 'Alice' }];

    render(<TypingIndicator channelId="ch-1" className="mt-2" />);

    const status = screen.getByRole('status');
    expect(status.className).toContain('mt-2');
  });
});
