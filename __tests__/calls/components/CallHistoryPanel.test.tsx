/**
 * Tests for calls/components/CallHistoryPanel.tsx
 *
 * Covers:
 * - Empty state (no recent calls)
 * - Renders history entries with status badges
 * - Shows correct duration formatting
 * - "Call again" button appears only for completed calls
 * - "Call again" triggers onCallAgain callback with channelId and type
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useCallStore } from '@/calls/store';
import { CallHistoryPanel } from '@/calls/components/CallHistoryPanel';
import type { CallHistoryEntry } from '@/calls/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('framer-motion', () => {
  const React = require('react');
  return {
    motion: {
      div: ({ children, variants, initial, animate, ...props }: any) =>
        React.createElement('div', props, children),
      button: ({ children, whileHover, whileTap, transition, ...props }: any) =>
        React.createElement('button', props, children),
    },
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock('@/shared/lib/animations', () => ({
  staggerContainer: {},
  staggerItem: {},
  tapScale: {},
  springSnappy: {},
}));

// Mock date-fns to return a stable string for test determinism
jest.mock('date-fns', () => ({
  formatDistanceToNow: jest.fn(() => '5 minutes ago'),
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

function makeEntry(overrides?: Partial<CallHistoryEntry>): CallHistoryEntry {
  return {
    callId: 'call-1',
    channelId: 'ch-1',
    type: '1:1',
    status: 'completed',
    duration: 65,
    participantIds: ['user-1', 'user-2'],
    startedAt: new Date('2024-01-01T10:00:00'),
    endedAt: new Date('2024-01-01T10:01:05'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CallHistoryPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCallStore.setState(initialStoreState);
  });

  describe('empty state', () => {
    it('shows "No recent calls" when callHistory is empty', () => {
      render(<CallHistoryPanel />);
      expect(screen.getByText('No recent calls')).toBeTruthy();
    });

    it('shows descriptive subtitle in empty state', () => {
      render(<CallHistoryPanel />);
      expect(screen.getByText('Your call history will appear here')).toBeTruthy();
    });

    it('does not show "Recent Calls" header when empty', () => {
      render(<CallHistoryPanel />);
      expect(screen.queryByText('Recent Calls')).toBeNull();
    });
  });

  describe('with call history entries', () => {
    beforeEach(() => {
      useCallStore.setState({
        callHistory: [
          makeEntry({ callId: 'call-1', status: 'completed', duration: 65 }),
          makeEntry({ callId: 'call-2', status: 'missed', duration: 0 }),
          makeEntry({ callId: 'call-3', status: 'declined', duration: 0 }),
        ],
      });
    });

    it('shows "Recent Calls" header', () => {
      render(<CallHistoryPanel />);
      expect(screen.getByText('Recent Calls')).toBeTruthy();
    });

    it('does not show empty state text', () => {
      render(<CallHistoryPanel />);
      expect(screen.queryByText('No recent calls')).toBeNull();
    });

    it('renders status badge for completed call', () => {
      render(<CallHistoryPanel />);
      expect(screen.getByText('Completed')).toBeTruthy();
    });

    it('renders status badge for missed call', () => {
      render(<CallHistoryPanel />);
      expect(screen.getByText('Missed')).toBeTruthy();
    });

    it('renders status badge for declined call', () => {
      render(<CallHistoryPanel />);
      expect(screen.getByText('Declined')).toBeTruthy();
    });

    it('renders relative timestamp using formatDistanceToNow', () => {
      render(<CallHistoryPanel />);
      // Our mock returns '5 minutes ago'
      const timestamps = screen.getAllByText('5 minutes ago');
      expect(timestamps.length).toBeGreaterThan(0);
    });
  });

  describe('duration formatting', () => {
    it('shows dash for 0 second duration', () => {
      useCallStore.setState({ callHistory: [makeEntry({ duration: 0 })] });
      render(<CallHistoryPanel />);
      expect(screen.getByText('—')).toBeTruthy();
    });

    it('shows seconds only for durations under 60 seconds', () => {
      useCallStore.setState({ callHistory: [makeEntry({ duration: 45 })] });
      render(<CallHistoryPanel />);
      expect(screen.getByText('45s')).toBeTruthy();
    });

    it('shows minutes and seconds for durations over 60 seconds', () => {
      useCallStore.setState({ callHistory: [makeEntry({ duration: 125 })] });
      render(<CallHistoryPanel />);
      expect(screen.getByText('2m 5s')).toBeTruthy();
    });

    it('shows 1m 0s for exactly 60 seconds', () => {
      useCallStore.setState({ callHistory: [makeEntry({ duration: 60 })] });
      render(<CallHistoryPanel />);
      expect(screen.getByText('1m 0s')).toBeTruthy();
    });
  });

  describe('"Call again" button', () => {
    const onCallAgain = jest.fn();

    it('shows Call again button for completed calls', () => {
      useCallStore.setState({
        callHistory: [makeEntry({ status: 'completed' })],
      });
      render(<CallHistoryPanel onCallAgain={onCallAgain} />);
      expect(screen.getByLabelText('Call again')).toBeTruthy();
    });

    it('does not show Call again button for missed calls', () => {
      useCallStore.setState({
        callHistory: [makeEntry({ status: 'missed' })],
      });
      render(<CallHistoryPanel onCallAgain={onCallAgain} />);
      expect(screen.queryByLabelText('Call again')).toBeNull();
    });

    it('does not show Call again button for declined calls', () => {
      useCallStore.setState({
        callHistory: [makeEntry({ status: 'declined' })],
      });
      render(<CallHistoryPanel onCallAgain={onCallAgain} />);
      expect(screen.queryByLabelText('Call again')).toBeNull();
    });

    it('calls onCallAgain with channelId and type when clicked', () => {
      useCallStore.setState({
        callHistory: [makeEntry({ channelId: 'ch-test', type: '1:1', status: 'completed' })],
      });
      render(<CallHistoryPanel onCallAgain={onCallAgain} />);
      fireEvent.click(screen.getByLabelText('Call again'));
      expect(onCallAgain).toHaveBeenCalledWith('ch-test', '1:1');
    });

    it('does not show Call again button when onCallAgain prop is not provided', () => {
      useCallStore.setState({
        callHistory: [makeEntry({ status: 'completed' })],
      });
      render(<CallHistoryPanel />);
      expect(screen.queryByLabelText('Call again')).toBeNull();
    });
  });

  describe('multiple entries', () => {
    it('renders all history entries', () => {
      useCallStore.setState({
        callHistory: [
          makeEntry({ callId: 'c1', status: 'completed', duration: 30 }),
          makeEntry({ callId: 'c2', status: 'missed', duration: 0 }),
        ],
      });
      render(<CallHistoryPanel />);
      expect(screen.getByText('Completed')).toBeTruthy();
      expect(screen.getByText('Missed')).toBeTruthy();
    });
  });
});
