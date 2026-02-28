/**
 * Tests for calls/store.ts
 *
 * Covers all Zustand store actions:
 * - setActiveCall / updateParticipant
 * - toggleMute / toggleCamera / toggleScreenShare
 * - setIncomingCall / clearIncomingCall
 * - setHuddle / updateHuddleParticipant
 * - addToCallHistory (capped at 100, newest first)
 * - setLocalStream / setScreenStream
 * - setMediaDevices / setSelectedDevice
 */

import { useCallStore } from '@/calls/store';
import type {
  CallState,
  CallParticipant,
  HuddleState,
  IncomingCallInfo,
  CallHistoryEntry,
} from '@/calls/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCall(overrides?: Partial<CallState>): CallState {
  return {
    id: 'call-1',
    channelId: 'ch-1',
    type: '1:1',
    status: 'ringing',
    initiatorId: 'user-1',
    participants: [],
    startedAt: new Date('2024-01-01T10:00:00'),
    endedAt: null,
    isScreenSharing: false,
    screenSharingUserId: null,
    ...overrides,
  };
}

function makeParticipant(overrides?: Partial<CallParticipant>): CallParticipant {
  return {
    userId: 'user-1',
    user: { id: 'user-1', name: 'Alice', image: null },
    status: 'connected',
    isMuted: false,
    isCameraOn: true,
    isScreenSharing: false,
    audioLevel: 0,
    joinedAt: new Date('2024-01-01T10:00:00'),
    stream: null,
    ...overrides,
  };
}

function makeHuddle(channelId = 'ch-1', overrides?: Partial<HuddleState>): HuddleState {
  return {
    channelId,
    participants: [],
    startedAt: new Date('2024-01-01T10:00:00'),
    isActive: true,
    ...overrides,
  };
}

function makeIncomingCall(overrides?: Partial<IncomingCallInfo>): IncomingCallInfo {
  return {
    callId: 'call-incoming-1',
    channelId: 'ch-1',
    callerId: 'user-2',
    callerName: 'Bob',
    type: '1:1',
    ...overrides,
  };
}

function makeHistoryEntry(overrides?: Partial<CallHistoryEntry>): CallHistoryEntry {
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

const initialState = {
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
// Tests
// ---------------------------------------------------------------------------

describe('useCallStore', () => {
  beforeEach(() => {
    useCallStore.setState(initialState);
  });

  // --- Initial state ---

  describe('initial state', () => {
    it('starts with activeCall as null', () => {
      expect(useCallStore.getState().activeCall).toBeNull();
    });

    it('starts with isMuted false', () => {
      expect(useCallStore.getState().isMuted).toBe(false);
    });

    it('starts with isCameraOn true', () => {
      expect(useCallStore.getState().isCameraOn).toBe(true);
    });

    it('starts with isScreenSharing false', () => {
      expect(useCallStore.getState().isScreenSharing).toBe(false);
    });

    it('starts with empty huddlesByChannel', () => {
      expect(useCallStore.getState().huddlesByChannel).toEqual({});
    });

    it('starts with empty callHistory', () => {
      expect(useCallStore.getState().callHistory).toEqual([]);
    });
  });

  // --- setActiveCall ---

  describe('setActiveCall', () => {
    it('sets an active call', () => {
      const call = makeCall();
      useCallStore.getState().setActiveCall(call);
      expect(useCallStore.getState().activeCall).toEqual(call);
    });

    it('clears the active call when set to null', () => {
      useCallStore.getState().setActiveCall(makeCall());
      useCallStore.getState().setActiveCall(null);
      expect(useCallStore.getState().activeCall).toBeNull();
    });

    it('replaces an existing active call', () => {
      useCallStore.getState().setActiveCall(makeCall({ id: 'call-1', status: 'ringing' }));
      useCallStore.getState().setActiveCall(makeCall({ id: 'call-1', status: 'connected' }));
      expect(useCallStore.getState().activeCall?.status).toBe('connected');
    });
  });

  // --- toggleMute ---

  describe('toggleMute', () => {
    it('toggles isMuted from false to true', () => {
      useCallStore.getState().toggleMute();
      expect(useCallStore.getState().isMuted).toBe(true);
    });

    it('toggles isMuted back to false on second call', () => {
      useCallStore.getState().toggleMute();
      useCallStore.getState().toggleMute();
      expect(useCallStore.getState().isMuted).toBe(false);
    });

    it('does not affect isCameraOn', () => {
      useCallStore.getState().toggleMute();
      expect(useCallStore.getState().isCameraOn).toBe(true);
    });
  });

  // --- toggleCamera ---

  describe('toggleCamera', () => {
    it('toggles isCameraOn from true to false', () => {
      useCallStore.getState().toggleCamera();
      expect(useCallStore.getState().isCameraOn).toBe(false);
    });

    it('toggles isCameraOn back to true on second call', () => {
      useCallStore.getState().toggleCamera();
      useCallStore.getState().toggleCamera();
      expect(useCallStore.getState().isCameraOn).toBe(true);
    });

    it('does not affect isMuted', () => {
      useCallStore.getState().toggleCamera();
      expect(useCallStore.getState().isMuted).toBe(false);
    });
  });

  // --- toggleScreenShare ---

  describe('toggleScreenShare', () => {
    it('toggles isScreenSharing from false to true', () => {
      useCallStore.getState().toggleScreenShare();
      expect(useCallStore.getState().isScreenSharing).toBe(true);
    });

    it('toggles isScreenSharing back to false on second call', () => {
      useCallStore.getState().toggleScreenShare();
      useCallStore.getState().toggleScreenShare();
      expect(useCallStore.getState().isScreenSharing).toBe(false);
    });
  });

  // --- setIncomingCall / clearIncomingCall ---

  describe('setIncomingCall', () => {
    it('sets an incoming call', () => {
      const incoming = makeIncomingCall();
      useCallStore.getState().setIncomingCall(incoming);
      expect(useCallStore.getState().incomingCall).toEqual(incoming);
    });

    it('replaces an existing incoming call', () => {
      useCallStore.getState().setIncomingCall(makeIncomingCall({ callerId: 'user-2' }));
      useCallStore.getState().setIncomingCall(makeIncomingCall({ callerId: 'user-3' }));
      expect(useCallStore.getState().incomingCall?.callerId).toBe('user-3');
    });
  });

  describe('clearIncomingCall', () => {
    it('clears incomingCall to null', () => {
      useCallStore.getState().setIncomingCall(makeIncomingCall());
      useCallStore.getState().clearIncomingCall();
      expect(useCallStore.getState().incomingCall).toBeNull();
    });

    it('is a no-op if incomingCall is already null', () => {
      useCallStore.getState().clearIncomingCall();
      expect(useCallStore.getState().incomingCall).toBeNull();
    });
  });

  // --- updateParticipant ---

  describe('updateParticipant', () => {
    it('updates a participant in the active call', () => {
      const participant = makeParticipant({ userId: 'user-1', isMuted: false });
      useCallStore.getState().setActiveCall(makeCall({ participants: [participant] }));

      useCallStore.getState().updateParticipant('user-1', { isMuted: true });

      const updated = useCallStore.getState().activeCall?.participants[0];
      expect(updated?.isMuted).toBe(true);
    });

    it('does not affect other participants', () => {
      const p1 = makeParticipant({ userId: 'user-1', isMuted: false });
      const p2 = makeParticipant({ userId: 'user-2', isMuted: false });
      useCallStore.getState().setActiveCall(makeCall({ participants: [p1, p2] }));

      useCallStore.getState().updateParticipant('user-1', { isMuted: true });

      const participants = useCallStore.getState().activeCall?.participants ?? [];
      expect(participants.find((p) => p.userId === 'user-1')?.isMuted).toBe(true);
      expect(participants.find((p) => p.userId === 'user-2')?.isMuted).toBe(false);
    });

    it('is a no-op when there is no active call', () => {
      useCallStore.getState().updateParticipant('user-1', { isMuted: true });
      expect(useCallStore.getState().activeCall).toBeNull();
    });

    it('preserves other fields when updating a single field', () => {
      const participant = makeParticipant({ userId: 'user-1', isMuted: false, isCameraOn: true });
      useCallStore.getState().setActiveCall(makeCall({ participants: [participant] }));

      useCallStore.getState().updateParticipant('user-1', { isMuted: true });

      const updated = useCallStore.getState().activeCall?.participants[0];
      expect(updated?.isCameraOn).toBe(true);
    });
  });

  // --- setHuddle / updateHuddleParticipant ---

  describe('setHuddle', () => {
    it('sets a huddle for a channel', () => {
      const huddle = makeHuddle('ch-1');
      useCallStore.getState().setHuddle('ch-1', huddle);
      expect(useCallStore.getState().huddlesByChannel['ch-1']).toEqual(huddle);
    });

    it('manages multiple channels independently', () => {
      useCallStore.getState().setHuddle('ch-1', makeHuddle('ch-1'));
      useCallStore.getState().setHuddle('ch-2', makeHuddle('ch-2'));

      const state = useCallStore.getState();
      expect(state.huddlesByChannel['ch-1']).toBeDefined();
      expect(state.huddlesByChannel['ch-2']).toBeDefined();
    });

    it('removes a huddle when set to null', () => {
      useCallStore.getState().setHuddle('ch-1', makeHuddle('ch-1'));
      useCallStore.getState().setHuddle('ch-1', null);
      expect(useCallStore.getState().huddlesByChannel['ch-1']).toBeUndefined();
    });

    it('setting null for one channel does not affect another', () => {
      useCallStore.getState().setHuddle('ch-1', makeHuddle('ch-1'));
      useCallStore.getState().setHuddle('ch-2', makeHuddle('ch-2'));
      useCallStore.getState().setHuddle('ch-1', null);

      expect(useCallStore.getState().huddlesByChannel['ch-1']).toBeUndefined();
      expect(useCallStore.getState().huddlesByChannel['ch-2']).toBeDefined();
    });

    it('replaces an existing huddle', () => {
      useCallStore.getState().setHuddle('ch-1', makeHuddle('ch-1', { isActive: true }));
      useCallStore.getState().setHuddle('ch-1', makeHuddle('ch-1', { isActive: false }));
      expect(useCallStore.getState().huddlesByChannel['ch-1']?.isActive).toBe(false);
    });
  });

  describe('updateHuddleParticipant', () => {
    it('updates a participant in a huddle', () => {
      const participant = makeParticipant({ userId: 'user-1', isMuted: false });
      useCallStore.getState().setHuddle('ch-1', makeHuddle('ch-1', { participants: [participant] }));

      useCallStore.getState().updateHuddleParticipant('ch-1', 'user-1', { isMuted: true });

      const updated = useCallStore.getState().huddlesByChannel['ch-1']?.participants[0];
      expect(updated?.isMuted).toBe(true);
    });

    it('is a no-op when channel has no huddle', () => {
      useCallStore.getState().updateHuddleParticipant('ch-nonexistent', 'user-1', { isMuted: true });
      expect(useCallStore.getState().huddlesByChannel['ch-nonexistent']).toBeUndefined();
    });

    it('does not affect participants in other huddles', () => {
      const p1 = makeParticipant({ userId: 'user-1', isMuted: false });
      useCallStore.getState().setHuddle('ch-1', makeHuddle('ch-1', { participants: [p1] }));
      useCallStore.getState().setHuddle('ch-2', makeHuddle('ch-2', { participants: [makeParticipant({ userId: 'user-1', isMuted: false })] }));

      useCallStore.getState().updateHuddleParticipant('ch-1', 'user-1', { isMuted: true });

      expect(useCallStore.getState().huddlesByChannel['ch-1']?.participants[0]?.isMuted).toBe(true);
      expect(useCallStore.getState().huddlesByChannel['ch-2']?.participants[0]?.isMuted).toBe(false);
    });
  });

  // --- addToCallHistory ---

  describe('addToCallHistory', () => {
    it('prepends an entry to callHistory', () => {
      const entry = makeHistoryEntry({ callId: 'call-1' });
      useCallStore.getState().addToCallHistory(entry);
      expect(useCallStore.getState().callHistory[0]).toEqual(entry);
    });

    it('puts newest entries first', () => {
      useCallStore.getState().addToCallHistory(makeHistoryEntry({ callId: 'call-1' }));
      useCallStore.getState().addToCallHistory(makeHistoryEntry({ callId: 'call-2' }));

      const history = useCallStore.getState().callHistory;
      expect(history[0].callId).toBe('call-2');
      expect(history[1].callId).toBe('call-1');
    });

    it('caps the history at 100 entries', () => {
      for (let i = 0; i < 105; i++) {
        useCallStore.getState().addToCallHistory(makeHistoryEntry({ callId: `call-${i}` }));
      }
      expect(useCallStore.getState().callHistory).toHaveLength(100);
    });

    it('keeps the 100 most recent entries', () => {
      for (let i = 0; i < 102; i++) {
        useCallStore.getState().addToCallHistory(makeHistoryEntry({ callId: `call-${i}` }));
      }
      const history = useCallStore.getState().callHistory;
      // Newest entry is call-101 (last added), oldest kept should be call-2
      expect(history[0].callId).toBe('call-101');
      expect(history[99].callId).toBe('call-2');
    });
  });

  // --- setLocalStream / setScreenStream ---

  describe('setLocalStream', () => {
    it('sets localStream to null initially', () => {
      expect(useCallStore.getState().localStream).toBeNull();
    });

    it('stores a stream reference', () => {
      const fakeStream = { id: 'stream-1' } as unknown as MediaStream;
      useCallStore.getState().setLocalStream(fakeStream);
      expect(useCallStore.getState().localStream).toBe(fakeStream);
    });

    it('clears the stream when set to null', () => {
      const fakeStream = { id: 'stream-1' } as unknown as MediaStream;
      useCallStore.getState().setLocalStream(fakeStream);
      useCallStore.getState().setLocalStream(null);
      expect(useCallStore.getState().localStream).toBeNull();
    });
  });

  describe('setScreenStream', () => {
    it('sets and clears screenStream', () => {
      const fakeStream = { id: 'screen-1' } as unknown as MediaStream;
      useCallStore.getState().setScreenStream(fakeStream);
      expect(useCallStore.getState().screenStream).toBe(fakeStream);

      useCallStore.getState().setScreenStream(null);
      expect(useCallStore.getState().screenStream).toBeNull();
    });
  });

  // --- setMediaDevices / setSelectedDevice ---

  describe('setMediaDevices', () => {
    it('merges partial device updates', () => {
      const fakeCamera = { deviceId: 'cam-1', kind: 'videoinput', label: 'Camera 1' } as MediaDeviceInfo;
      useCallStore.getState().setMediaDevices({ cameras: [fakeCamera] });

      const devices = useCallStore.getState().mediaDevices;
      expect(devices.cameras).toHaveLength(1);
      expect(devices.cameras[0].deviceId).toBe('cam-1');
      // Unset fields remain at defaults
      expect(devices.microphones).toEqual([]);
      expect(devices.speakers).toEqual([]);
    });

    it('merges multiple updates additively', () => {
      const fakeMic = { deviceId: 'mic-1', kind: 'audioinput', label: 'Mic 1' } as MediaDeviceInfo;
      const fakeCamera = { deviceId: 'cam-1', kind: 'videoinput', label: 'Camera 1' } as MediaDeviceInfo;

      useCallStore.getState().setMediaDevices({ cameras: [fakeCamera] });
      useCallStore.getState().setMediaDevices({ microphones: [fakeMic] });

      const devices = useCallStore.getState().mediaDevices;
      expect(devices.cameras).toHaveLength(1);
      expect(devices.microphones).toHaveLength(1);
    });
  });

  describe('setSelectedDevice', () => {
    it('sets selectedCameraId when type is camera', () => {
      useCallStore.getState().setSelectedDevice('camera', 'cam-1');
      expect(useCallStore.getState().mediaDevices.selectedCameraId).toBe('cam-1');
    });

    it('sets selectedMicrophoneId when type is microphone', () => {
      useCallStore.getState().setSelectedDevice('microphone', 'mic-1');
      expect(useCallStore.getState().mediaDevices.selectedMicrophoneId).toBe('mic-1');
    });

    it('sets selectedSpeakerId when type is speaker', () => {
      useCallStore.getState().setSelectedDevice('speaker', 'spk-1');
      expect(useCallStore.getState().mediaDevices.selectedSpeakerId).toBe('spk-1');
    });

    it('does not overwrite other selections', () => {
      useCallStore.getState().setSelectedDevice('camera', 'cam-1');
      useCallStore.getState().setSelectedDevice('microphone', 'mic-1');

      const devices = useCallStore.getState().mediaDevices;
      expect(devices.selectedCameraId).toBe('cam-1');
      expect(devices.selectedMicrophoneId).toBe('mic-1');
    });

    it('can update a selection to a new device', () => {
      useCallStore.getState().setSelectedDevice('camera', 'cam-1');
      useCallStore.getState().setSelectedDevice('camera', 'cam-2');
      expect(useCallStore.getState().mediaDevices.selectedCameraId).toBe('cam-2');
    });
  });
});
