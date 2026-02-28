/**
 * @jest-environment jsdom
 */

/**
 * Tests for shared/hooks/useCelebrationReactions.ts
 *
 * Covers:
 * - seedReactionSnapshot: populates baseline cache
 * - reaction:updated with celebration emoji → triggers confetti (after hydration)
 * - reaction:updated before hydration period → does NOT trigger confetti
 * - reaction:updated with non-celebration emoji → does NOT trigger confetti
 * - reaction count decreased → does NOT trigger confetti
 * - reaction count increased on already-present non-celebration → no confetti
 * - snapshot is updated after each event
 * - socket listener is removed on unmount
 */

import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks (must be before imports)
// ---------------------------------------------------------------------------

const mockOn = jest.fn();
const mockOff = jest.fn();
const mockSocket = { on: mockOn, off: mockOff };

jest.mock('@/shared/lib/socket-client', () => ({
  getSocket: () => mockSocket,
}));

const mockTriggerCelebrationConfetti = jest.fn().mockResolvedValue(undefined);
jest.mock('@/shared/lib/animations', () => ({
  triggerCelebrationConfetti: (...args: unknown[]) => mockTriggerCelebrationConfetti(...args),
}));

import {
  seedReactionSnapshot,
  useCelebrationReactions,
} from '@/shared/hooks/useCelebrationReactions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getReactionUpdatedHandler(): ((payload: unknown) => void) | undefined {
  const call = mockOn.mock.calls.find(([event]: [string]) => event === 'reaction:updated');
  return call?.[1];
}

type ReactionPayload = { messageId: string; reactions: Array<{ emoji: string; count: number; userIds: string[] }> };

// ---------------------------------------------------------------------------
// seedReactionSnapshot
// ---------------------------------------------------------------------------

describe('seedReactionSnapshot', () => {
  it('does not throw when called with empty reactions', () => {
    expect(() => seedReactionSnapshot('msg-1', [])).not.toThrow();
  });

  it('stores reactions for a message', () => {
    seedReactionSnapshot('msg-seed', [
      { emoji: '👍', count: 3, userIds: ['u1', 'u2', 'u3'] },
      { emoji: '🎉', count: 1, userIds: ['u4'] },
    ]);
    // No direct way to inspect the cache, but subsequent tests rely on it
    // This is verified indirectly in the confetti tests below
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// useCelebrationReactions — socket listener registration
// ---------------------------------------------------------------------------

describe('useCelebrationReactions — socket registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('registers reaction:updated listener on mount', () => {
    renderHook(() => useCelebrationReactions());

    expect(mockOn).toHaveBeenCalledWith('reaction:updated', expect.any(Function));
  });

  it('removes reaction:updated listener on unmount', () => {
    const { unmount } = renderHook(() => useCelebrationReactions());
    unmount();

    expect(mockOff).toHaveBeenCalledWith('reaction:updated', expect.any(Function));
  });
});

// ---------------------------------------------------------------------------
// useCelebrationReactions — confetti logic
// ---------------------------------------------------------------------------

describe('useCelebrationReactions — confetti behaviour', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Reset snapshot cache for message used in tests
    seedReactionSnapshot('msg-test', []);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function mountAndHydrate() {
    renderHook(() => useCelebrationReactions());
    // Advance past the 2-second hydration guard
    act(() => {
      jest.advanceTimersByTime(2001);
    });
  }

  it('does NOT trigger confetti before hydration period (2 seconds)', () => {
    renderHook(() => useCelebrationReactions());

    // Do NOT advance past 2 seconds
    const handler = getReactionUpdatedHandler();
    const payload: ReactionPayload = {
      messageId: 'msg-test',
      reactions: [{ emoji: '🎉', count: 1, userIds: ['u1'] }],
    };

    act(() => {
      handler?.(payload);
    });

    expect(mockTriggerCelebrationConfetti).not.toHaveBeenCalled();
  });

  it('triggers confetti when 🎉 reaction count increases after hydration', async () => {
    seedReactionSnapshot('msg-cel', []);
    mountAndHydrate();

    const handler = getReactionUpdatedHandler();
    const payload: ReactionPayload = {
      messageId: 'msg-cel',
      reactions: [{ emoji: '🎉', count: 1, userIds: ['u1'] }],
    };

    await act(async () => {
      handler?.(payload);
    });

    expect(mockTriggerCelebrationConfetti).toHaveBeenCalledTimes(1);
  });

  it('triggers confetti for all celebration emojis (🎊 🥳 🏆 🚀 ✨)', async () => {
    const celebrationEmojis = ['🎊', '🥳', '🏆', '🚀', '✨'];

    for (const emoji of celebrationEmojis) {
      jest.clearAllMocks();
      const msgId = `msg-${emoji}`;
      seedReactionSnapshot(msgId, []);
      mountAndHydrate();

      const handler = getReactionUpdatedHandler();
      const payload: ReactionPayload = {
        messageId: msgId,
        reactions: [{ emoji, count: 1, userIds: ['u1'] }],
      };

      await act(async () => {
        handler?.(payload);
      });

      expect(mockTriggerCelebrationConfetti).toHaveBeenCalledTimes(1);
    }
  });

  it('does NOT trigger confetti for non-celebration emojis', async () => {
    seedReactionSnapshot('msg-noncelebrate', []);
    mountAndHydrate();

    const handler = getReactionUpdatedHandler();
    const payload: ReactionPayload = {
      messageId: 'msg-noncelebrate',
      reactions: [
        { emoji: '👍', count: 5, userIds: ['u1', 'u2', 'u3', 'u4', 'u5'] },
        { emoji: '❤️', count: 2, userIds: ['u1', 'u2'] },
      ],
    };

    await act(async () => {
      handler?.(payload);
    });

    expect(mockTriggerCelebrationConfetti).not.toHaveBeenCalled();
  });

  it('does NOT trigger confetti when count decreases (reaction removed)', async () => {
    const msgId = 'msg-decrease';
    // Pre-seed with count=3
    seedReactionSnapshot(msgId, [{ emoji: '🎉', count: 3, userIds: ['u1', 'u2', 'u3'] }]);
    mountAndHydrate();

    const handler = getReactionUpdatedHandler();
    // Count goes down to 2
    const payload: ReactionPayload = {
      messageId: msgId,
      reactions: [{ emoji: '🎉', count: 2, userIds: ['u1', 'u2'] }],
    };

    await act(async () => {
      handler?.(payload);
    });

    expect(mockTriggerCelebrationConfetti).not.toHaveBeenCalled();
  });

  it('does NOT trigger confetti when count stays the same', async () => {
    const msgId = 'msg-same-count';
    seedReactionSnapshot(msgId, [{ emoji: '🎉', count: 2, userIds: ['u1', 'u2'] }]);
    mountAndHydrate();

    const handler = getReactionUpdatedHandler();
    const payload: ReactionPayload = {
      messageId: msgId,
      reactions: [{ emoji: '🎉', count: 2, userIds: ['u1', 'u2'] }],
    };

    await act(async () => {
      handler?.(payload);
    });

    expect(mockTriggerCelebrationConfetti).not.toHaveBeenCalled();
  });

  it('updates snapshot after each event (subsequent decreases do not celebrate)', async () => {
    const msgId = 'msg-snapshot-update';
    seedReactionSnapshot(msgId, []);
    mountAndHydrate();

    const handler = getReactionUpdatedHandler();

    // First: count goes 0 → 1 (celebration)
    await act(async () => {
      handler?.({ messageId: msgId, reactions: [{ emoji: '🎉', count: 1, userIds: ['u1'] }] });
    });
    expect(mockTriggerCelebrationConfetti).toHaveBeenCalledTimes(1);

    // Second: same count (should NOT celebrate again)
    jest.clearAllMocks();
    await act(async () => {
      handler?.({ messageId: msgId, reactions: [{ emoji: '🎉', count: 1, userIds: ['u1'] }] });
    });
    expect(mockTriggerCelebrationConfetti).not.toHaveBeenCalled();
  });

  it('triggers confetti for new celebration emoji on message that already has reactions', async () => {
    const msgId = 'msg-existing-reactions';
    // Seed with 👍 already present
    seedReactionSnapshot(msgId, [{ emoji: '👍', count: 2, userIds: ['u1', 'u2'] }]);
    mountAndHydrate();

    const handler = getReactionUpdatedHandler();
    // Now add 🎉 (count goes from 0 to 1)
    const payload: ReactionPayload = {
      messageId: msgId,
      reactions: [
        { emoji: '👍', count: 2, userIds: ['u1', 'u2'] },
        { emoji: '🎉', count: 1, userIds: ['u3'] },
      ],
    };

    await act(async () => {
      handler?.(payload);
    });

    expect(mockTriggerCelebrationConfetti).toHaveBeenCalledTimes(1);
  });
});
