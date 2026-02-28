/**
 * Tests for calls/components/HuddleBar.tsx
 *
 * Covers:
 * - Hidden when no active huddle and not in huddle
 * - Visible when huddle is active
 * - Renders participant avatars (up to 6)
 * - Shows overflow count when more than 6 participants
 * - Join button calls joinHuddle when not in huddle
 * - Leave button calls leaveHuddle when in huddle
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useCallStore } from '@/calls/store';
import { HuddleBar } from '@/calls/components/HuddleBar';
import type { CallParticipant, HuddleState } from '@/calls/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('framer-motion', () => {
  const React = require('react');
  return {
    motion: {
      div: ({ children, initial, animate, exit, transition, ...props }: any) =>
        React.createElement('div', props, children),
      button: ({ children, whileHover, whileTap, transition, ...props }: any) =>
        React.createElement('button', props, children),
    },
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock('@/shared/lib/animations', () => ({
  springSnappy: {},
  tapScale: {},
}));

// Mock useHuddle to control its return value
const mockJoinHuddle = jest.fn();
const mockLeaveHuddle = jest.fn();
let mockIsInHuddle = false;
let mockParticipants: CallParticipant[] = [];

jest.mock('@/calls/hooks/useHuddle', () => ({
  useHuddle: () => ({
    joinHuddle: mockJoinHuddle,
    leaveHuddle: mockLeaveHuddle,
    isInHuddle: mockIsInHuddle,
    participants: mockParticipants,
    remoteStreams: new Map(),
    toggleAudio: jest.fn(),
    toggleVideo: jest.fn(),
  }),
}));

// Mock useAudioLevel to always return 0
jest.mock('@/calls/hooks/useAudioLevel', () => ({
  useAudioLevel: () => 0,
}));

// Mock AudioVisualizer to avoid canvas dependencies
jest.mock('@/calls/components/AudioVisualizer', () => ({
  AudioVisualizer: () => null,
}));

// ---------------------------------------------------------------------------
// Initial store state
// ---------------------------------------------------------------------------

const initialStoreState = {
  activeCall: null,
  localStream: null,
  screenStream: null,
  isMuted: false,
  isCameraOn: true,
  isScreenSharing: false,
  incomingCall: null,
  huddlesByChannel: {},
  callHistory: [],
  mediaDevices: {
    cameras: [],
    microphones: [],
    speakers: [],
    selectedCameraId: null,
    selectedMicrophoneId: null,
    selectedSpeakerId: null,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParticipant(userId: string, overrides?: Partial<CallParticipant>): CallParticipant {
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
    ...overrides,
  };
}

function makeHuddle(channelId = 'ch-1', overrides?: Partial<HuddleState>): HuddleState {
  return {
    channelId,
    participants: [],
    startedAt: new Date(),
    isActive: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HuddleBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsInHuddle = false;
    mockParticipants = [];
    useCallStore.setState(initialStoreState);
  });

  describe('visibility', () => {
    it('renders nothing when huddle is not active and not in huddle', () => {
      const { container } = render(<HuddleBar channelId="ch-1" />);
      expect(container.firstChild).toBeNull();
    });

    it('renders when huddle is active in the channel', () => {
      useCallStore.setState({
        huddlesByChannel: { 'ch-1': makeHuddle('ch-1', { isActive: true }) },
      });
      const { container } = render(<HuddleBar channelId="ch-1" />);
      expect(container.firstChild).not.toBeNull();
    });

    it('renders when user is in the huddle (even without store state)', () => {
      mockIsInHuddle = true;
      const { container } = render(<HuddleBar channelId="ch-1" />);
      expect(container.firstChild).not.toBeNull();
    });

    it('does not render for a different channel', () => {
      useCallStore.setState({
        huddlesByChannel: { 'ch-2': makeHuddle('ch-2', { isActive: true }) },
      });
      const { container } = render(<HuddleBar channelId="ch-1" />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('join / leave buttons', () => {
    it('shows Join button when not in huddle', () => {
      mockIsInHuddle = false;
      useCallStore.setState({
        huddlesByChannel: { 'ch-1': makeHuddle('ch-1') },
      });
      render(<HuddleBar channelId="ch-1" />);
      expect(screen.getByText('Join')).toBeTruthy();
    });

    it('shows Leave button when in huddle', () => {
      mockIsInHuddle = true;
      render(<HuddleBar channelId="ch-1" />);
      expect(screen.getByText('Leave')).toBeTruthy();
    });

    it('calls joinHuddle with channelId when Join is clicked', () => {
      mockIsInHuddle = false;
      useCallStore.setState({
        huddlesByChannel: { 'ch-1': makeHuddle('ch-1') },
      });
      render(<HuddleBar channelId="ch-1" />);
      fireEvent.click(screen.getByText('Join'));
      expect(mockJoinHuddle).toHaveBeenCalledWith('ch-1');
    });

    it('calls leaveHuddle when Leave is clicked', () => {
      mockIsInHuddle = true;
      render(<HuddleBar channelId="ch-1" />);
      fireEvent.click(screen.getByText('Leave'));
      expect(mockLeaveHuddle).toHaveBeenCalled();
    });

    it('calls joinHuddle exactly once per click', () => {
      mockIsInHuddle = false;
      useCallStore.setState({
        huddlesByChannel: { 'ch-1': makeHuddle('ch-1') },
      });
      render(<HuddleBar channelId="ch-1" />);
      fireEvent.click(screen.getByText('Join'));
      expect(mockJoinHuddle).toHaveBeenCalledTimes(1);
    });
  });

  describe('participant avatars', () => {
    beforeEach(() => {
      mockIsInHuddle = true;
    });

    it('shows participant avatars from the huddle state', () => {
      const participants = [
        makeParticipant('user-1', { user: { id: 'user-1', name: 'Alice', image: null } }),
        makeParticipant('user-2', { user: { id: 'user-2', name: 'Bob', image: null } }),
      ];
      useCallStore.setState({
        huddlesByChannel: {
          'ch-1': makeHuddle('ch-1', { participants }),
        },
      });
      render(<HuddleBar channelId="ch-1" />);
      // Avatar initials: A for Alice, B for Bob
      expect(screen.getByText('A')).toBeTruthy();
      expect(screen.getByText('B')).toBeTruthy();
    });

    it('shows at most 6 participant avatars', () => {
      const participants = Array.from({ length: 8 }, (_, i) =>
        makeParticipant(`user-${i + 1}`, {
          user: { id: `user-${i + 1}`, name: `User${i + 1}`, image: null },
        })
      );
      useCallStore.setState({
        huddlesByChannel: { 'ch-1': makeHuddle('ch-1', { participants }) },
      });
      render(<HuddleBar channelId="ch-1" />);
      // Overflow count "+2" should appear (8 - 6 = 2)
      expect(screen.getByText('+2')).toBeTruthy();
    });

    it('does not show overflow indicator when participants are 6 or fewer', () => {
      const participants = Array.from({ length: 6 }, (_, i) =>
        makeParticipant(`user-${i + 1}`, {
          user: { id: `user-${i + 1}`, name: `User${i + 1}`, image: null },
        })
      );
      useCallStore.setState({
        huddlesByChannel: { 'ch-1': makeHuddle('ch-1', { participants }) },
      });
      render(<HuddleBar channelId="ch-1" />);
      // No overflow indicator
      expect(screen.queryByText(/^\+\d/)).toBeNull();
    });
  });

  describe('huddle label', () => {
    it('shows "Huddle" label text', () => {
      mockIsInHuddle = true;
      render(<HuddleBar channelId="ch-1" />);
      expect(screen.getByText('Huddle')).toBeTruthy();
    });
  });
});
