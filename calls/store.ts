/**
 * calls/store.ts
 *
 * Zustand store for call and huddle state management.
 * Holds active call, huddle state, incoming call notification,
 * local/screen streams, and media device selections.
 *
 * Usage:
 *   import { useCallStore } from '@/calls/store'
 *   const activeCall = useCallStore(s => s.activeCall)
 */

'use client';

import { create } from 'zustand';
import type {
  CallStoreState,
  CallState,
  CallParticipant,
  HuddleState,
  IncomingCallInfo,
  CallHistoryEntry,
  MediaDevicesState,
} from './types';

const defaultMediaDevices: MediaDevicesState = {
  cameras: [],
  microphones: [],
  speakers: [],
  selectedCameraId: null,
  selectedMicrophoneId: null,
  selectedSpeakerId: null,
};

export const useCallStore = create<CallStoreState>((set, get) => ({
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  activeCall: null,
  localStream: null,
  screenStream: null,
  isMuted: false,
  isCameraOn: true,
  isScreenSharing: false,
  incomingCall: null,
  huddlesByChannel: {},
  activeHuddleChannelId: null,
  callHistory: [],
  mediaDevices: defaultMediaDevices,

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  setActiveCall: (call: CallState | null) =>
    set({ activeCall: call }),

  setLocalStream: (stream: MediaStream | null) =>
    set({ localStream: stream }),

  setScreenStream: (stream: MediaStream | null) =>
    set({ screenStream: stream }),

  toggleMute: () =>
    set((state) => ({ isMuted: !state.isMuted })),

  toggleCamera: () =>
    set((state) => ({ isCameraOn: !state.isCameraOn })),

  toggleScreenShare: () =>
    set((state) => ({ isScreenSharing: !state.isScreenSharing })),

  setIncomingCall: (incoming: IncomingCallInfo | null) =>
    set({ incomingCall: incoming }),

  clearIncomingCall: () =>
    set({ incomingCall: null }),

  setActiveHuddleChannelId: (channelId: string | null) =>
    set({ activeHuddleChannelId: channelId }),

  setHuddle: (channelId: string, huddle: HuddleState | null) =>
    set((state) => {
      if (huddle === null) {
        const next = { ...state.huddlesByChannel };
        delete next[channelId];
        return { huddlesByChannel: next };
      }
      return {
        huddlesByChannel: {
          ...state.huddlesByChannel,
          [channelId]: huddle,
        },
      };
    }),

  addToCallHistory: (entry: CallHistoryEntry) =>
    set((state) => ({
      // Keep max 100 entries, newest first
      callHistory: [entry, ...state.callHistory].slice(0, 100),
    })),

  updateParticipant: (userId: string, updates: Partial<CallParticipant>) =>
    set((state) => {
      if (!state.activeCall) return state;
      return {
        activeCall: {
          ...state.activeCall,
          participants: state.activeCall.participants.map((p) =>
            p.userId === userId ? { ...p, ...updates } : p
          ),
        },
      };
    }),

  updateHuddleParticipant: (channelId: string, userId: string, updates: Partial<CallParticipant>) =>
    set((state) => {
      const huddle = state.huddlesByChannel[channelId];
      if (!huddle) return state;
      return {
        huddlesByChannel: {
          ...state.huddlesByChannel,
          [channelId]: {
            ...huddle,
            participants: huddle.participants.map((p) =>
              p.userId === userId ? { ...p, ...updates } : p
            ),
          },
        },
      };
    }),

  setMediaDevices: (devices: Partial<MediaDevicesState>) =>
    set((state) => ({
      mediaDevices: { ...state.mediaDevices, ...devices },
    })),

  setSelectedDevice: (type: 'camera' | 'microphone' | 'speaker', deviceId: string) =>
    set((state) => {
      const key =
        type === 'camera'
          ? 'selectedCameraId'
          : type === 'microphone'
            ? 'selectedMicrophoneId'
            : 'selectedSpeakerId';
      return {
        mediaDevices: { ...state.mediaDevices, [key]: deviceId },
      };
    }),
}));
