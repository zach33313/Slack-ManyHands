/**
 * Tests for calls/components/CallTimer.tsx
 *
 * Covers:
 * - MM:SS formatting (e.g. 00:00, 01:05, 10:30)
 * - H:MM:SS formatting for calls over one hour
 * - Timer updates on each second via setInterval
 * - Timer resets when startedAt changes
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { CallTimer } from '@/calls/components/CallTimer';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a Date that was `seconds` ago from the current mocked time.
 */
function secondsAgo(seconds: number): Date {
  return new Date(Date.now() - seconds * 1000);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CallTimer', () => {
  describe('initial render (MM:SS format)', () => {
    it('shows 00:00 when startedAt is now', () => {
      render(<CallTimer startedAt={secondsAgo(0)} />);
      expect(screen.getByText('00:00')).toBeTruthy();
    });

    it('shows 00:05 for 5 seconds elapsed', () => {
      render(<CallTimer startedAt={secondsAgo(5)} />);
      expect(screen.getByText('00:05')).toBeTruthy();
    });

    it('shows 01:00 for exactly one minute', () => {
      render(<CallTimer startedAt={secondsAgo(60)} />);
      expect(screen.getByText('01:00')).toBeTruthy();
    });

    it('shows 01:05 for 65 seconds elapsed', () => {
      render(<CallTimer startedAt={secondsAgo(65)} />);
      expect(screen.getByText('01:05')).toBeTruthy();
    });

    it('shows 10:30 for 630 seconds elapsed', () => {
      render(<CallTimer startedAt={secondsAgo(630)} />);
      expect(screen.getByText('10:30')).toBeTruthy();
    });

    it('shows 59:59 for 3599 seconds elapsed', () => {
      render(<CallTimer startedAt={secondsAgo(3599)} />);
      expect(screen.getByText('59:59')).toBeTruthy();
    });
  });

  describe('H:MM:SS format for calls over one hour', () => {
    it('shows 1:00:00 for exactly one hour', () => {
      render(<CallTimer startedAt={secondsAgo(3600)} />);
      expect(screen.getByText('1:00:00')).toBeTruthy();
    });

    it('shows 1:01:05 for 3665 seconds', () => {
      render(<CallTimer startedAt={secondsAgo(3665)} />);
      expect(screen.getByText('1:01:05')).toBeTruthy();
    });

    it('shows 2:00:00 for two hours', () => {
      render(<CallTimer startedAt={secondsAgo(7200)} />);
      expect(screen.getByText('2:00:00')).toBeTruthy();
    });
  });

  describe('interval updates', () => {
    it('increments by 1 second after 1000ms', () => {
      render(<CallTimer startedAt={secondsAgo(0)} />);
      expect(screen.getByText('00:00')).toBeTruthy();

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(screen.getByText('00:01')).toBeTruthy();
    });

    it('shows correct time after 65 seconds of interval advancement', () => {
      render(<CallTimer startedAt={secondsAgo(0)} />);

      act(() => {
        jest.advanceTimersByTime(65_000);
      });

      expect(screen.getByText('01:05')).toBeTruthy();
    });

    it('clears the interval on unmount', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      const { unmount } = render(<CallTimer startedAt={secondsAgo(0)} />);

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });

  describe('className prop', () => {
    it('applies the default className when not provided', () => {
      const { container } = render(<CallTimer startedAt={secondsAgo(0)} />);
      const span = container.querySelector('span');
      expect(span?.className).toContain('font-mono');
    });

    it('applies a custom className when provided', () => {
      const { container } = render(
        <CallTimer startedAt={secondsAgo(0)} className="custom-class" />
      );
      const span = container.querySelector('span');
      expect(span?.className).toBe('custom-class');
    });
  });
});
