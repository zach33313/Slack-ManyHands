/**
 * @jest-environment jsdom
 *
 * __tests__/polls/PollDisplay.multichoice.test.tsx
 *
 * Tests for PollDisplay multi-choice behavior. Covers:
 *   - Single-choice: clicking a new option deselects the previous one
 *   - Multi-choice: clicking multiple options keeps all selected
 *   - Multi-choice: unvoting one option doesn't affect other selections
 *   - getUserVotes() returns an array (verified via footer text)
 *   - Vote counts correctly reflect multi-choice voting
 *   - UI renders checkboxes (CheckCircle2/Circle) for multi-choice,
 *     radio-style (CheckCircle2 for voted only) for single-choice
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';

// ---------------------------------------------------------------------------
// Mock useSocket — must be declared before the component import
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
// Mock framer-motion — render motion.div as plain div, ignore animation props
// ---------------------------------------------------------------------------
jest.mock('framer-motion', () => {
  const React = require('react');

  const motionDiv = ({
    children,
    className,
    style,
    animate,
    initial,
    transition,
    ...rest
  }: Record<string, unknown>) =>
    React.createElement('div', { className, style, ...rest }, children);

  return {
    motion: { div: motionDiv },
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

// ---------------------------------------------------------------------------
// Mock lucide-react — expose test IDs so we can assert which icons render
// ---------------------------------------------------------------------------
jest.mock('lucide-react', () => {
  const React = require('react');
  return {
    Trophy: () => React.createElement('span', { 'data-testid': 'icon-trophy' }),
    CheckCircle2: ({ className }: { className?: string }) =>
      React.createElement('span', { 'data-testid': 'icon-check-circle', className }),
    Circle: ({ className }: { className?: string }) =>
      React.createElement('span', { 'data-testid': 'icon-circle', className }),
  };
});

// ---------------------------------------------------------------------------
// Import component under test (after all mocks)
// ---------------------------------------------------------------------------
import { PollDisplay } from '@/polls/components/PollDisplay';
import type { Poll, PollVoteGroup } from '@/polls/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CURRENT_USER = 'user-current';
const OTHER_USER = 'user-other';
const POLL_ID = 'poll-001';

/** Build a set of 3 vote groups, optionally pre-populated with the current user's vote. */
function makeVotes(alreadyVoted: string[] = []): PollVoteGroup[] {
  const options = ['Option A', 'Option B', 'Option C'];
  const total = alreadyVoted.length;

  return options.map((option) => {
    const voted = alreadyVoted.includes(option);
    return {
      option,
      count: voted ? 1 : 0,
      userIds: voted ? [CURRENT_USER] : [],
      percentage: total > 0 && voted ? Math.round((1 / total) * 100) : 0,
    };
  });
}

function makePoll(overrides: Partial<Poll> = {}): Poll {
  return {
    id: POLL_ID,
    messageId: 'msg-1',
    question: 'What is your favorite?',
    options: ['Option A', 'Option B', 'Option C'],
    isActive: true,
    multiChoice: false,
    endsAt: new Date(Date.now() + 86_400_000),
    votes: makeVotes(),
    totalVotes: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

/** Find the button element that contains the given option label text. */
function getOptionButton(label: string): HTMLElement {
  return screen.getByText(label).closest('button') as HTMLElement;
}

// ---------------------------------------------------------------------------
// 1. Single-choice behavior
// ---------------------------------------------------------------------------

describe('PollDisplay — single-choice behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('clicking a new option emits poll:unvote for old option and poll:vote for new option', () => {
    const poll = makePoll({
      multiChoice: false,
      votes: makeVotes(['Option A']),
      totalVotes: 1,
    });

    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);

    fireEvent.click(getOptionButton('Option B'));

    // Must unvote the previous selection first
    expect(mockSocket.emit).toHaveBeenCalledWith('poll:unvote', {
      pollId: POLL_ID,
      option: 'Option A',
    });
    // Then vote for the new option
    expect(mockSocket.emit).toHaveBeenCalledWith('poll:vote', {
      pollId: POLL_ID,
      option: 'Option B',
    });
  });

  it('clicking a new option moves border-primary to the new option (optimistic update)', () => {
    const poll = makePoll({
      multiChoice: false,
      votes: makeVotes(['Option A']),
      totalVotes: 1,
    });

    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);

    // Before: Option A selected, Option B not
    expect(getOptionButton('Option A')).toHaveClass('border-primary');
    expect(getOptionButton('Option B')).not.toHaveClass('border-primary');

    fireEvent.click(getOptionButton('Option B'));

    // After optimistic update: Option B selected, Option A deselected
    expect(getOptionButton('Option B')).toHaveClass('border-primary');
    expect(getOptionButton('Option A')).not.toHaveClass('border-primary');
  });

  it('clicking the same option emits poll:unvote and removes the vote (optimistic update)', () => {
    const poll = makePoll({
      multiChoice: false,
      votes: makeVotes(['Option A']),
      totalVotes: 1,
    });

    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);

    // Click the already-voted option
    fireEvent.click(getOptionButton('Option A'));

    expect(mockSocket.emit).toHaveBeenCalledWith('poll:unvote', {
      pollId: POLL_ID,
      option: 'Option A',
    });
    // Must NOT emit a new vote
    expect(mockSocket.emit).not.toHaveBeenCalledWith(
      'poll:vote',
      expect.anything()
    );

    // Optimistic: border-primary removed
    expect(getOptionButton('Option A')).not.toHaveClass('border-primary');
  });

  it('clicking a new option does not call poll:vote for the old option', () => {
    const poll = makePoll({
      multiChoice: false,
      votes: makeVotes(['Option A']),
      totalVotes: 1,
    });

    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);

    fireEvent.click(getOptionButton('Option B'));

    // Must NOT re-vote for Option A (would double-count)
    expect(mockSocket.emit).not.toHaveBeenCalledWith('poll:vote', {
      pollId: POLL_ID,
      option: 'Option A',
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Multi-choice behavior
// ---------------------------------------------------------------------------

describe('PollDisplay — multi-choice behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('clicking an additional option keeps previously selected options selected', () => {
    // User already voted for Option A; clicking B should NOT remove A
    const poll = makePoll({
      multiChoice: true,
      votes: makeVotes(['Option A']),
      totalVotes: 1,
    });

    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);

    // Option A is selected before clicking B
    expect(getOptionButton('Option A')).toHaveClass('border-primary');

    fireEvent.click(getOptionButton('Option B'));

    // Only a vote for B should be emitted — no unvote for A
    expect(mockSocket.emit).toHaveBeenCalledWith('poll:vote', {
      pollId: POLL_ID,
      option: 'Option B',
    });
    expect(mockSocket.emit).not.toHaveBeenCalledWith(
      'poll:unvote',
      expect.anything()
    );

    // Both options selected after optimistic update
    expect(getOptionButton('Option A')).toHaveClass('border-primary');
    expect(getOptionButton('Option B')).toHaveClass('border-primary');
  });

  it('unvoting one option does not clear other selected options', () => {
    // User voted for both A and B
    const poll = makePoll({
      multiChoice: true,
      votes: [
        { option: 'Option A', count: 1, userIds: [CURRENT_USER], percentage: 50 },
        { option: 'Option B', count: 1, userIds: [CURRENT_USER], percentage: 50 },
        { option: 'Option C', count: 0, userIds: [], percentage: 0 },
      ],
      totalVotes: 2,
    });

    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);

    // Both A and B selected initially
    expect(getOptionButton('Option A')).toHaveClass('border-primary');
    expect(getOptionButton('Option B')).toHaveClass('border-primary');

    // Unvote B
    fireEvent.click(getOptionButton('Option B'));

    expect(mockSocket.emit).toHaveBeenCalledWith('poll:unvote', {
      pollId: POLL_ID,
      option: 'Option B',
    });

    // Option A must remain selected after the optimistic update
    expect(getOptionButton('Option A')).toHaveClass('border-primary');
    // Option B is now deselected
    expect(getOptionButton('Option B')).not.toHaveClass('border-primary');
  });

  it('clicking an unvoted option in multi-choice does NOT emit poll:unvote for any option', () => {
    const poll = makePoll({
      multiChoice: true,
      votes: makeVotes(),
      totalVotes: 0,
    });

    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);

    fireEvent.click(getOptionButton('Option A'));

    // No unvote should ever be emitted when adding a fresh vote
    const unvoteCalls = (mockSocket.emit as jest.Mock).mock.calls.filter(
      ([event]) => event === 'poll:unvote'
    );
    expect(unvoteCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. getUserVotes() returns an array (tested via footer text)
// ---------------------------------------------------------------------------

describe('PollDisplay — getUserVotes() returns an array', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('footer shows "2 options selected" when user voted for 2 options (array length = 2)', () => {
    const poll = makePoll({
      multiChoice: true,
      votes: [
        { option: 'Option A', count: 1, userIds: [CURRENT_USER], percentage: 50 },
        { option: 'Option B', count: 1, userIds: [CURRENT_USER], percentage: 50 },
        { option: 'Option C', count: 0, userIds: [], percentage: 0 },
      ],
      totalVotes: 2,
    });

    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);

    // Only possible if getUserVotes() returned an array with 2 elements
    expect(screen.getByText(/2 options selected/)).toBeInTheDocument();
  });

  it('footer shows "1 option selected" (singular) when user voted for exactly 1 option', () => {
    const poll = makePoll({
      multiChoice: true,
      votes: makeVotes(['Option A']),
      totalVotes: 1,
    });

    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);

    // Singular form: only possible if the array has exactly 1 element
    expect(screen.getByText(/1 option selected/)).toBeInTheDocument();
  });

  it('footer shows "Select your choices" when the user has no votes (empty array)', () => {
    const poll = makePoll({
      multiChoice: true,
      votes: makeVotes(),
      totalVotes: 0,
    });

    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);

    expect(screen.getByText(/Select your choices/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. Vote counts reflect multi-choice voting correctly
// ---------------------------------------------------------------------------

describe('PollDisplay — vote counts with multi-choice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('total vote count increases by 1 when a user adds a vote in multi-choice (optimistic)', () => {
    // Another user has already voted; current user hasn't
    const poll = makePoll({
      multiChoice: true,
      votes: [
        { option: 'Option A', count: 1, userIds: [OTHER_USER], percentage: 100 },
        { option: 'Option B', count: 0, userIds: [], percentage: 0 },
        { option: 'Option C', count: 0, userIds: [], percentage: 0 },
      ],
      totalVotes: 1,
    });

    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);

    // Footer starts at "1 vote ..."
    expect(screen.getByText(/\b1 vote\b/)).toBeInTheDocument();

    fireEvent.click(getOptionButton('Option B'));

    // After optimistic update: "2 votes ..."
    expect(screen.getByText(/\b2 votes\b/)).toBeInTheDocument();
  });

  it('individual option count increases after a multi-choice vote (optimistic)', () => {
    const poll = makePoll({
      multiChoice: true,
      votes: makeVotes(),
      totalVotes: 0,
    });

    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);

    fireEvent.click(getOptionButton('Option A'));

    // Option A's count span shows "1 · 100%"
    const optionAButton = getOptionButton('Option A');
    expect(within(optionAButton).getByText(/^1\s/)).toBeInTheDocument();
  });

  it('other option counts are unaffected when voting for a different option (multi-choice)', () => {
    const poll = makePoll({
      multiChoice: true,
      votes: [
        { option: 'Option A', count: 2, userIds: [OTHER_USER, 'user-x'], percentage: 100 },
        { option: 'Option B', count: 0, userIds: [], percentage: 0 },
        { option: 'Option C', count: 0, userIds: [], percentage: 0 },
      ],
      totalVotes: 2,
    });

    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);

    // Vote for Option B — this must NOT change Option A's count
    fireEvent.click(getOptionButton('Option B'));

    const optionAButton = getOptionButton('Option A');
    // Option A still shows count=2 (the "2 ·..." text)
    expect(within(optionAButton).getByText(/^2\s/)).toBeInTheDocument();
  });

  it('unvoting in multi-choice decreases only the target option count (optimistic)', () => {
    const poll = makePoll({
      multiChoice: true,
      votes: [
        { option: 'Option A', count: 1, userIds: [CURRENT_USER], percentage: 50 },
        { option: 'Option B', count: 1, userIds: [CURRENT_USER], percentage: 50 },
        { option: 'Option C', count: 0, userIds: [], percentage: 0 },
      ],
      totalVotes: 2,
    });

    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);

    // Unvote B — A's count should stay at 1
    fireEvent.click(getOptionButton('Option B'));

    const optionAButton = getOptionButton('Option A');
    expect(within(optionAButton).getByText(/^1\s/)).toBeInTheDocument();

    // B's count should drop to 0
    const optionBButton = getOptionButton('Option B');
    expect(within(optionBButton).getByText(/^0\s/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 5. UI rendering: checkboxes (multi-choice) vs radio-style (single-choice)
// ---------------------------------------------------------------------------

describe('PollDisplay — UI rendering (checkbox vs radio style)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders "Select all that apply" subtitle for active multi-choice polls', () => {
    const poll = makePoll({ multiChoice: true, isActive: true });
    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);
    expect(screen.getByText('Select all that apply')).toBeInTheDocument();
  });

  it('does NOT render "Select all that apply" for single-choice polls', () => {
    const poll = makePoll({ multiChoice: false, isActive: true });
    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);
    expect(screen.queryByText('Select all that apply')).not.toBeInTheDocument();
  });

  it('renders CheckCircle2 for voted options and Circle for unvoted in multi-choice', () => {
    // 2 voted, 1 unvoted
    const poll = makePoll({
      multiChoice: true,
      isActive: true,
      votes: [
        { option: 'Option A', count: 1, userIds: [CURRENT_USER], percentage: 33 },
        { option: 'Option B', count: 1, userIds: [CURRENT_USER], percentage: 33 },
        { option: 'Option C', count: 0, userIds: [], percentage: 0 },
      ],
      totalVotes: 2,
    });

    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);

    expect(screen.getAllByTestId('icon-check-circle')).toHaveLength(2);
    expect(screen.getAllByTestId('icon-circle')).toHaveLength(1);
  });

  it('renders Circle for every option when user has no votes in multi-choice', () => {
    const poll = makePoll({
      multiChoice: true,
      isActive: true,
      votes: makeVotes(), // no votes
      totalVotes: 0,
    });

    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);

    // All 3 options should show Circle (unchecked)
    expect(screen.getAllByTestId('icon-circle')).toHaveLength(3);
    // No CheckCircle2 icons
    expect(screen.queryAllByTestId('icon-check-circle')).toHaveLength(0);
  });

  it('renders CheckCircle2 only for the voted option in single-choice (radio style)', () => {
    const poll = makePoll({
      multiChoice: false,
      isActive: true,
      votes: [
        { option: 'Option A', count: 1, userIds: [CURRENT_USER], percentage: 100 },
        { option: 'Option B', count: 0, userIds: [], percentage: 0 },
        { option: 'Option C', count: 0, userIds: [], percentage: 0 },
      ],
      totalVotes: 1,
    });

    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);

    // Only the voted option gets a CheckCircle2 icon
    expect(screen.getAllByTestId('icon-check-circle')).toHaveLength(1);
    // No Circle icons for unvoted options in single-choice
    expect(screen.queryAllByTestId('icon-circle')).toHaveLength(0);
  });

  it('renders no icons when no vote cast in single-choice poll', () => {
    const poll = makePoll({
      multiChoice: false,
      isActive: true,
      votes: makeVotes(), // no votes
      totalVotes: 0,
    });

    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);

    // Single-choice with no vote: no indicator icons at all
    expect(screen.queryAllByTestId('icon-check-circle')).toHaveLength(0);
    expect(screen.queryAllByTestId('icon-circle')).toHaveLength(0);
  });

  it('the voted option button has border-primary; unvoted buttons do not (single-choice)', () => {
    const poll = makePoll({
      multiChoice: false,
      isActive: true,
      votes: [
        { option: 'Option A', count: 1, userIds: [CURRENT_USER], percentage: 100 },
        { option: 'Option B', count: 0, userIds: [], percentage: 0 },
        { option: 'Option C', count: 0, userIds: [], percentage: 0 },
      ],
      totalVotes: 1,
    });

    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);

    expect(getOptionButton('Option A')).toHaveClass('border-primary');
    expect(getOptionButton('Option B')).not.toHaveClass('border-primary');
    expect(getOptionButton('Option C')).not.toHaveClass('border-primary');
  });

  it('all voted option buttons have border-primary in multi-choice', () => {
    const poll = makePoll({
      multiChoice: true,
      isActive: true,
      votes: [
        { option: 'Option A', count: 1, userIds: [CURRENT_USER], percentage: 50 },
        { option: 'Option B', count: 1, userIds: [CURRENT_USER], percentage: 50 },
        { option: 'Option C', count: 0, userIds: [], percentage: 0 },
      ],
      totalVotes: 2,
    });

    render(<PollDisplay poll={poll} currentUserId={CURRENT_USER} />);

    expect(getOptionButton('Option A')).toHaveClass('border-primary');
    expect(getOptionButton('Option B')).toHaveClass('border-primary');
    expect(getOptionButton('Option C')).not.toHaveClass('border-primary');
  });
});
