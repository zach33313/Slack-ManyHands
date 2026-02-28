/**
 * Tests for calls/components/IncomingCallModal.tsx
 *
 * Covers:
 * - Hidden when incomingCall is null
 * - Renders caller name and call type badge
 * - Accept button calls onAccept with callId
 * - Decline button calls onDecline with callId
 * - Auto-dismisses after 30 seconds
 * - Cancels auto-dismiss timer on unmount
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useCallStore } from '@/calls/store';
import { IncomingCallModal } from '@/calls/components/IncomingCallModal';
import type { IncomingCallInfo } from '@/calls/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('framer-motion', () => {
  const React = require('react');
  return {
    motion: {
      div: ({ children, initial, animate, exit, variants, transition, ...props }: any) =>
        React.createElement('div', props, children),
      button: ({ children, whileHover, whileTap, transition, ...props }: any) =>
        React.createElement('button', props, children),
    },
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock('@/shared/lib/animations', () => ({
  modalVariants: {},
  backdropVariants: {},
  springSnappy: {},
  tapScale: {},
}));

// ---------------------------------------------------------------------------
// Initial state for store reset
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

function makeIncomingCall(overrides?: Partial<IncomingCallInfo>): IncomingCallInfo {
  return {
    callId: 'call-1',
    channelId: 'ch-1',
    callerId: 'user-2',
    callerName: 'Bob Smith',
    type: '1:1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IncomingCallModal', () => {
  const onAccept = jest.fn();
  const onDecline = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useCallStore.setState(initialStoreState);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('when there is no incoming call', () => {
    it('renders nothing', () => {
      const { container } = render(
        <IncomingCallModal onAccept={onAccept} onDecline={onDecline} />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('when there is an incoming call', () => {
    beforeEach(() => {
      useCallStore.setState({ incomingCall: makeIncomingCall() });
    });

    it('renders the caller name', () => {
      render(<IncomingCallModal onAccept={onAccept} onDecline={onDecline} />);
      expect(screen.getByText('Bob Smith')).toBeTruthy();
    });

    it('shows caller initial in the avatar', () => {
      render(<IncomingCallModal onAccept={onAccept} onDecline={onDecline} />);
      // Avatar shows first letter of callerName
      expect(screen.getByText('B')).toBeTruthy();
    });

    it('shows voice call badge for 1:1 type', () => {
      render(<IncomingCallModal onAccept={onAccept} onDecline={onDecline} />);
      expect(screen.getByText(/voice call/i)).toBeTruthy();
    });

    it('shows huddle invite badge for huddle type', () => {
      useCallStore.setState({ incomingCall: makeIncomingCall({ type: 'huddle' }) });
      render(<IncomingCallModal onAccept={onAccept} onDecline={onDecline} />);
      expect(screen.getByText(/huddle invite/i)).toBeTruthy();
    });

    it('renders an Accept button', () => {
      render(<IncomingCallModal onAccept={onAccept} onDecline={onDecline} />);
      const acceptBtn = screen.getByLabelText('Accept call');
      expect(acceptBtn).toBeTruthy();
    });

    it('renders a Decline button', () => {
      render(<IncomingCallModal onAccept={onAccept} onDecline={onDecline} />);
      const declineBtn = screen.getByLabelText('Decline call');
      expect(declineBtn).toBeTruthy();
    });
  });

  describe('accept / decline interactions', () => {
    beforeEach(() => {
      useCallStore.setState({ incomingCall: makeIncomingCall({ callId: 'call-42' }) });
    });

    it('calls onAccept with the correct callId when Accept is clicked', () => {
      render(<IncomingCallModal onAccept={onAccept} onDecline={onDecline} />);
      fireEvent.click(screen.getByLabelText('Accept call'));
      expect(onAccept).toHaveBeenCalledWith('call-42');
    });

    it('calls onDecline with the correct callId when Decline is clicked', () => {
      render(<IncomingCallModal onAccept={onAccept} onDecline={onDecline} />);
      fireEvent.click(screen.getByLabelText('Decline call'));
      expect(onDecline).toHaveBeenCalledWith('call-42');
    });

    it('calls onAccept exactly once', () => {
      render(<IncomingCallModal onAccept={onAccept} onDecline={onDecline} />);
      fireEvent.click(screen.getByLabelText('Accept call'));
      expect(onAccept).toHaveBeenCalledTimes(1);
    });

    it('calls onDecline exactly once', () => {
      render(<IncomingCallModal onAccept={onAccept} onDecline={onDecline} />);
      fireEvent.click(screen.getByLabelText('Decline call'));
      expect(onDecline).toHaveBeenCalledTimes(1);
    });
  });

  describe('auto-dismiss after 30 seconds', () => {
    it('clears the incoming call after 30 seconds', () => {
      useCallStore.setState({ incomingCall: makeIncomingCall() });
      render(<IncomingCallModal onAccept={onAccept} onDecline={onDecline} />);

      act(() => {
        jest.advanceTimersByTime(30_000);
      });

      expect(useCallStore.getState().incomingCall).toBeNull();
    });

    it('does not clear before 30 seconds', () => {
      useCallStore.setState({ incomingCall: makeIncomingCall() });
      render(<IncomingCallModal onAccept={onAccept} onDecline={onDecline} />);

      act(() => {
        jest.advanceTimersByTime(29_999);
      });

      expect(useCallStore.getState().incomingCall).not.toBeNull();
    });

    it('cancels the timer when the component unmounts', () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      useCallStore.setState({ incomingCall: makeIncomingCall() });

      const { unmount } = render(
        <IncomingCallModal onAccept={onAccept} onDecline={onDecline} />
      );

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });
});
