/**
 * calls/types.ts
 *
 * Types for voice/video calling and huddle features.
 * WebRTC via simple-peer, signaling via Socket.IO.
 * Max 6 participants in huddle (mesh topology).
 *
 * Core shared types (UserSummary, etc.) live in shared/types/index.ts.
 */

import type { UserSummary } from '@/shared/types';

// ---------------------------------------------------------------------------
// Enums / Literal Types
// ---------------------------------------------------------------------------

export type CallType = '1:1' | 'huddle';
export type CallStatus = 'ringing' | 'connected' | 'ended' | 'missed';
export type ParticipantStatus = 'joining' | 'connected' | 'left';

/** UI state for the active call (more granular than CallStatus) */
export type CallUIState = 'idle' | 'ringing' | 'connecting' | 'connected' | 'ended';

// ---------------------------------------------------------------------------
// Domain Types
// ---------------------------------------------------------------------------

/** Full state of an active call (also used as ActiveCall in store) */
export interface CallState {
  id: string;
  channelId: string;
  type: CallType;
  status: CallStatus;
  initiatorId: string;
  participants: CallParticipant[];
  startedAt: Date;
  endedAt: Date | null;
  isScreenSharing: boolean;
  screenSharingUserId: string | null;
}

/** A participant in a call or huddle */
export interface CallParticipant {
  userId: string;
  user: UserSummary;
  status: ParticipantStatus;
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  /** 0-1 audio level from Web Audio AnalyserNode */
  audioLevel: number;
  joinedAt: Date;
  /** Live media stream from this participant (null if not yet received) */
  stream?: MediaStream | null;
}

/** WebRTC signaling payload relayed via Socket.IO — opaque, never inspect */
export interface CallSignalPayload {
  callId: string;
  fromUserId: string;
  toUserId: string;
  /** simple-peer signal data — treat as opaque blob */
  signal: unknown;
}

/** State of a channel huddle (persistent group audio) */
export interface HuddleState {
  channelId: string;
  participants: CallParticipant[];
  startedAt: Date;
  /** Whether this huddle is currently active */
  isActive: boolean;
}

/** Incoming call notification displayed to the callee */
export interface IncomingCallInfo {
  callId: string;
  channelId: string;
  callerId: string;
  callerName: string;
  type: CallType;
}

/** An entry in the call history log */
export interface CallHistoryEntry {
  callId: string;
  channelId: string;
  type: CallType;
  /** Outcome of the call */
  status: 'completed' | 'missed' | 'declined';
  /** Duration in seconds (0 if not connected) */
  duration: number;
  participantIds: string[];
  startedAt: Date;
  endedAt: Date;
}

/** Media device selection state */
export interface MediaDevicesState {
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
  selectedCameraId: string | null;
  selectedMicrophoneId: string | null;
  selectedSpeakerId: string | null;
}

// ---------------------------------------------------------------------------
// Zustand Store Shape
// ---------------------------------------------------------------------------

/** Shape of useCallStore — manages active call + huddle state */
export interface CallStoreState {
  activeCall: CallState | null;
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  incomingCall: IncomingCallInfo | null;
  /** Huddle state keyed by channelId */
  huddlesByChannel: Record<string, HuddleState>;
  /** Channel ID of the huddle the current user is in (null if not in any) */
  activeHuddleChannelId: string | null;
  /** Recent call history */
  callHistory: CallHistoryEntry[];
  /** Available media devices and selections */
  mediaDevices: MediaDevicesState;

  // Actions
  setActiveCall: (call: CallState | null) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setScreenStream: (stream: MediaStream | null) => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleScreenShare: () => void;
  setIncomingCall: (incoming: IncomingCallInfo | null) => void;
  clearIncomingCall: () => void;
  setHuddle: (channelId: string, huddle: HuddleState | null) => void;
  setActiveHuddleChannelId: (channelId: string | null) => void;
  addToCallHistory: (entry: CallHistoryEntry) => void;
  updateParticipant: (userId: string, updates: Partial<CallParticipant>) => void;
  updateHuddleParticipant: (channelId: string, userId: string, updates: Partial<CallParticipant>) => void;
  setMediaDevices: (devices: Partial<MediaDevicesState>) => void;
  setSelectedDevice: (type: 'camera' | 'microphone' | 'speaker', deviceId: string) => void;
}
