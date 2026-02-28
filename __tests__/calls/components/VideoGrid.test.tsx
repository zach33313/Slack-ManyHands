/**
 * Tests for calls/components/VideoGrid.tsx
 *
 * Covers:
 * - Empty state (0 participants)
 * - Grid class applied based on participant count (1, 2, 3-4, 5-6)
 * - Local participant is included in the count
 * - Each participant gets a tile rendered
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { VideoGrid } from '@/calls/components/VideoGrid';
import type { CallParticipant } from '@/calls/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock ParticipantTile to avoid its canvas/video/Web Audio dependencies
jest.mock('@/calls/components/ParticipantTile', () => ({
  ParticipantTile: ({ participant, isLocal }: { participant: CallParticipant; isLocal: boolean }) => (
    <div
      data-testid={`tile-${participant.userId}`}
      data-is-local={isLocal}
    />
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParticipant(userId: string): CallParticipant {
  return {
    userId,
    user: { id: userId, name: `User ${userId}`, image: null },
    status: 'connected',
    isMuted: false,
    isCameraOn: true,
    isScreenSharing: false,
    audioLevel: 0,
    joinedAt: new Date(),
    stream: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VideoGrid', () => {
  describe('empty state', () => {
    it('shows waiting message when no participants and no local participant', () => {
      render(<VideoGrid participants={[]} />);
      expect(screen.getByText(/waiting for participants/i)).toBeTruthy();
    });

    it('does not render a grid when empty', () => {
      const { container } = render(<VideoGrid participants={[]} />);
      expect(container.querySelector('.grid')).toBeNull();
    });
  });

  describe('grid layout by participant count', () => {
    it('uses grid-cols-1 for 1 total participant', () => {
      const local = makeParticipant('local-user');
      const { container } = render(
        <VideoGrid participants={[]} localParticipant={local} />
      );
      const grid = container.querySelector('.grid');
      expect(grid?.className).toContain('grid-cols-1');
      expect(grid?.className).toContain('grid-rows-1');
    });

    it('uses grid-cols-2 grid-rows-1 for 2 total participants', () => {
      const local = makeParticipant('local');
      const remote = makeParticipant('remote-1');
      const { container } = render(
        <VideoGrid participants={[remote]} localParticipant={local} />
      );
      const grid = container.querySelector('.grid');
      expect(grid?.className).toContain('grid-cols-2');
      expect(grid?.className).toContain('grid-rows-1');
    });

    it('uses grid-cols-2 grid-rows-2 for 3 total participants', () => {
      const local = makeParticipant('local');
      const remotes = [makeParticipant('r1'), makeParticipant('r2')];
      const { container } = render(
        <VideoGrid participants={remotes} localParticipant={local} />
      );
      const grid = container.querySelector('.grid');
      expect(grid?.className).toContain('grid-cols-2');
      expect(grid?.className).toContain('grid-rows-2');
    });

    it('uses grid-cols-2 grid-rows-2 for 4 total participants', () => {
      const local = makeParticipant('local');
      const remotes = [makeParticipant('r1'), makeParticipant('r2'), makeParticipant('r3')];
      const { container } = render(
        <VideoGrid participants={remotes} localParticipant={local} />
      );
      const grid = container.querySelector('.grid');
      expect(grid?.className).toContain('grid-cols-2');
      expect(grid?.className).toContain('grid-rows-2');
    });

    it('uses grid-cols-3 grid-rows-2 for 5 total participants', () => {
      const local = makeParticipant('local');
      const remotes = [
        makeParticipant('r1'), makeParticipant('r2'),
        makeParticipant('r3'), makeParticipant('r4'),
      ];
      const { container } = render(
        <VideoGrid participants={remotes} localParticipant={local} />
      );
      const grid = container.querySelector('.grid');
      expect(grid?.className).toContain('grid-cols-3');
      expect(grid?.className).toContain('grid-rows-2');
    });

    it('uses grid-cols-3 grid-rows-2 for 6 total participants', () => {
      const local = makeParticipant('local');
      const remotes = [
        makeParticipant('r1'), makeParticipant('r2'),
        makeParticipant('r3'), makeParticipant('r4'), makeParticipant('r5'),
      ];
      const { container } = render(
        <VideoGrid participants={remotes} localParticipant={local} />
      );
      const grid = container.querySelector('.grid');
      expect(grid?.className).toContain('grid-cols-3');
      expect(grid?.className).toContain('grid-rows-2');
    });
  });

  describe('participant tiles', () => {
    it('renders a tile for the local participant', () => {
      const local = makeParticipant('me');
      render(<VideoGrid participants={[]} localParticipant={local} />);
      expect(screen.getByTestId('tile-me')).toBeTruthy();
    });

    it('renders tiles for all remote participants', () => {
      const remotes = [makeParticipant('user-1'), makeParticipant('user-2')];
      render(<VideoGrid participants={remotes} />);
      expect(screen.getByTestId('tile-user-1')).toBeTruthy();
      expect(screen.getByTestId('tile-user-2')).toBeTruthy();
    });

    it('marks the local participant tile as local', () => {
      const local = makeParticipant('me');
      const remote = makeParticipant('them');
      render(<VideoGrid participants={[remote]} localParticipant={local} />);

      expect(screen.getByTestId('tile-me').getAttribute('data-is-local')).toBe('true');
      expect(screen.getByTestId('tile-them').getAttribute('data-is-local')).toBe('false');
    });

    it('shows local participant first in the grid', () => {
      const local = makeParticipant('me');
      const remote = makeParticipant('them');
      const { container } = render(
        <VideoGrid participants={[remote]} localParticipant={local} />
      );
      const tiles = container.querySelectorAll('[data-testid^="tile-"]');
      expect(tiles[0].getAttribute('data-testid')).toBe('tile-me');
      expect(tiles[1].getAttribute('data-testid')).toBe('tile-them');
    });

    it('works without a local participant', () => {
      const remotes = [makeParticipant('user-1')];
      render(<VideoGrid participants={remotes} />);
      expect(screen.getByTestId('tile-user-1')).toBeTruthy();
    });
  });

  describe('className prop', () => {
    it('applies additional className to the grid', () => {
      const local = makeParticipant('me');
      const { container } = render(
        <VideoGrid participants={[]} localParticipant={local} className="h-full" />
      );
      const grid = container.querySelector('.grid');
      expect(grid?.className).toContain('h-full');
    });
  });
});
