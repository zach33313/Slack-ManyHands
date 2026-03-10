/**
 * calls/hooks/useCall.ts
 *
 * Manages the full lifecycle of a 1:1 voice/video call.
 * Listens to Socket.IO call events, manages simple-peer connections,
 * and updates the call store.
 *
 * State machine: idle → ringing → connecting → connected → ended
 *
 * Usage:
 *   const { startCall, acceptCall, declineCall, hangup, toggleMedia } = useCall()
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import SimplePeer from 'simple-peer';
import { useSocket } from '@/shared/hooks/useSocket';
import { useCallStore } from '@/calls/store';
import type { CallType, CallParticipant } from '@/calls/types';
import type {
  CallIncomingPayload,
  CallAcceptedPayload,
  CallDeclinedPayload,
  CallSignalFromServerPayload,
  CallEndedPayload,
  CallMediaToggledPayload,
} from '@/shared/types/socket';
import {
  emitCallInitiate,
  emitCallAccept,
  emitCallDecline,
  emitCallHangup,
  emitCallSignal,
  emitCallToggleMedia,
} from '@/calls/lib/signaling';
import { toast } from 'sonner';
import { ICE_CONFIG } from '@/calls/lib/iceConfig';

export interface UseCallReturn {
  startCall: (targetUserId: string, channelId: string, type: CallType) => Promise<void>;
  acceptCall: (callId: string) => Promise<void>;
  declineCall: (callId: string) => void;
  hangup: () => void;
  toggleMedia: (mediaType: 'audio' | 'video' | 'screen') => Promise<void>;
}

/** Acquires local camera+mic or mic-only for voice calls */
async function getUserMedia(type: CallType): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      'Camera/microphone access requires a secure connection (HTTPS or localhost). ' +
      'If accessing over LAN, use https:// or open localhost:3000 directly.'
    );
  }
  return navigator.mediaDevices.getUserMedia({
    audio: true,
    video:
      type === '1:1'
        ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        : false,
  });
}

/** Skeleton CallParticipant for a remote user before media arrives */
function buildParticipant(userId: string): CallParticipant {
  return {
    userId,
    user: { id: userId, name: userId, image: null },
    status: 'joining',
    isMuted: false,
    isCameraOn: true,
    isScreenSharing: false,
    audioLevel: 0,
    joinedAt: new Date(),
    stream: null,
  };
}

export function useCall(): UseCallReturn {
  const socket = useSocket();
  const { data: session } = useSession();
  const myUserId = session?.user?.id ?? '';

  // Use individual stable action selectors instead of useCallStore() (which
  // subscribes to the entire store and causes unnecessary re-renders / effect re-runs)
  const setIncomingCall = useCallStore((s) => s.setIncomingCall);
  const clearIncomingCall = useCallStore((s) => s.clearIncomingCall);
  const setLocalStream = useCallStore((s) => s.setLocalStream);
  const setScreenStream = useCallStore((s) => s.setScreenStream);
  const setActiveCall = useCallStore((s) => s.setActiveCall);
  const toggleMute = useCallStore((s) => s.toggleMute);
  const toggleCamera = useCallStore((s) => s.toggleCamera);
  const toggleScreenShareAction = useCallStore((s) => s.toggleScreenShare);
  const updateParticipant = useCallStore((s) => s.updateParticipant);
  const addToCallHistory = useCallStore((s) => s.addToCallHistory);

  const peerRef = useRef<SimplePeer.Instance | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const activeCallIdRef = useRef<string | null>(null);

  // ---------------------------------------------------------------------------
  // Core cleanup (called on peer errors, call end, hangup)
  // ---------------------------------------------------------------------------

  const cleanupCall = useCallback(() => {
    // Destroy WebRTC peer
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    // Stop local media
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    // Stop screen share
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    // Reset store flags
    if (useCallStore.getState().isScreenSharing) toggleScreenShareAction();
    setActiveCall(null);
    activeCallIdRef.current = null;
  }, [setLocalStream, setScreenStream, setActiveCall, toggleScreenShareAction]);

  // ---------------------------------------------------------------------------
  // Wire events on a SimplePeer instance
  // ---------------------------------------------------------------------------

  const wirePeerEvents = useCallback(
    (peer: SimplePeer.Instance, callId: string, remoteUserId: string) => {
      peer.on('signal', (signal: SimplePeer.SignalData) => {
        emitCallSignal(socket, callId, remoteUserId, signal);
      });

      peer.on('stream', (remoteStream: MediaStream) => {
        updateParticipant(remoteUserId, { stream: remoteStream, status: 'connected' });
      });

      peer.on('connect', () => {
        const current = useCallStore.getState().activeCall;
        if (current) {
          setActiveCall({ ...current, status: 'connected' });
        }
      });

      // Peer-level error: clean up silently (server already knows if connection dropped)
      peer.on('error', (err: Error) => {
        console.error('[useCall] peer error:', err);
        cleanupCall();
      });

      peer.on('close', () => {
        // Only clean up if this is still the active call
        if (activeCallIdRef.current === callId) {
          cleanupCall();
        }
      });
    },
    [socket, updateParticipant, setActiveCall, cleanupCall]
  );

  // ---------------------------------------------------------------------------
  // Socket event listeners
  // ---------------------------------------------------------------------------

  useEffect(() => {
    console.log('[useCall] Registering call event listeners (socket connected:', socket.connected, ')');

    const onIncoming = (payload: CallIncomingPayload) => {
      console.log('[useCall] call:incoming received:', payload);
      setIncomingCall({
        callId: payload.callId,
        channelId: payload.channelId,
        callerId: payload.callerId,
        callerName: payload.callerName,
        type: payload.type,
      });
    };

    // Fired on the INITIATOR's side when callee accepts.
    // The server broadcasts call:accepted to all participants, so the callee
    // receives it too — skip if we're the callee (we already set up our peer
    // in acceptCall()). The initiator has a 'pending_' call ID prefix.
    const onAccepted = async ({ callId, userId }: CallAcceptedPayload) => {
      if (!activeCallIdRef.current?.startsWith('pending_')) {
        // We're the callee — already have a peer from acceptCall(), just
        // update our call ID to the real one and move on.
        return;
      }

      // We're the initiator — create the peer and start WebRTC negotiation
      activeCallIdRef.current = callId;

      const localStream = localStreamRef.current;
      if (!localStream) return;

      const peer = new SimplePeer({
        initiator: true,
        trickle: true,
        stream: localStream,
        config: ICE_CONFIG,
      });
      wirePeerEvents(peer, callId, userId);
      peerRef.current = peer;

      const current = useCallStore.getState().activeCall;
      if (current) {
        setActiveCall({
          ...current,
          id: callId,
          status: 'connecting',
          participants: [buildParticipant(userId)],
        });
      }
    };

    const onDeclined = ({ callId }: CallDeclinedPayload) => {
      const current = useCallStore.getState().activeCall;
      if (current) {
        addToCallHistory({
          callId,
          channelId: current.channelId,
          type: current.type,
          status: 'declined',
          duration: 0,
          participantIds: current.participants.map((p) => p.userId),
          startedAt: current.startedAt,
          endedAt: new Date(),
        });
      }
      cleanupCall();
    };

    const onSignal = ({ callId, fromUserId, signal }: CallSignalFromServerPayload) => {
      if (callId !== activeCallIdRef.current) return;
      peerRef.current?.signal(signal as SimplePeer.SignalData);
    };

    const onEnded = ({ callId, reason }: CallEndedPayload) => {
      if (callId !== activeCallIdRef.current) return;
      const current = useCallStore.getState().activeCall;
      if (current) {
        const durationMs = current.startedAt ? Date.now() - current.startedAt.getTime() : 0;
        addToCallHistory({
          callId,
          channelId: current.channelId,
          type: current.type,
          status: reason === 'missed' ? 'missed' : 'completed',
          duration: Math.floor(durationMs / 1000),
          participantIds: current.participants.map((p) => p.userId),
          startedAt: current.startedAt,
          endedAt: new Date(),
        });
      }
      cleanupCall();
    };

    const onMediaToggled = ({ callId, userId, isMuted, isCameraOn }: CallMediaToggledPayload) => {
      if (callId !== activeCallIdRef.current) return;
      updateParticipant(userId, { isMuted, isCameraOn });
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:declined', onDeclined);
    socket.on('call:signal', onSignal);
    socket.on('call:ended', onEnded);
    socket.on('call:media-toggled', onMediaToggled);

    return () => {
      console.log('[useCall] Cleaning up call event listeners');
      socket.off('call:incoming', onIncoming);
      socket.off('call:accepted', onAccepted);
      socket.off('call:declined', onDeclined);
      socket.off('call:signal', onSignal);
      socket.off('call:ended', onEnded);
      socket.off('call:media-toggled', onMediaToggled);
    };
  }, [socket, setIncomingCall, setActiveCall, addToCallHistory, updateParticipant, cleanupCall, wirePeerEvents]);

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const startCall = useCallback(
    async (targetUserId: string, channelId: string, type: CallType) => {
      console.log('[useCall] startCall:', { targetUserId, channelId, type, socketConnected: socket.connected });
      try {
        const localStream = await getUserMedia(type);
        localStreamRef.current = localStream;
        setLocalStream(localStream);

        // Emit — server assigns callId and notifies callee
        console.log('[useCall] Emitting call:initiate to server');
        emitCallInitiate(socket, channelId, type);

        // Set a temporary call ID; updated to real ID when call:accepted fires
        const tempId = `pending_${Date.now()}`;
        activeCallIdRef.current = tempId;

        setActiveCall({
          id: tempId,
          channelId,
          type,
          status: 'ringing',
          initiatorId: myUserId,
          participants: [buildParticipant(targetUserId)],
          startedAt: new Date(),
          endedAt: null,
          isScreenSharing: false,
          screenSharingUserId: null,
        });
      } catch (err) {
        console.error('[useCall] startCall failed:', err);
        const msg = err instanceof Error ? err.message : 'Failed to start call';
        toast.error(msg);
        cleanupCall();
      }
    },
    [socket, setLocalStream, setActiveCall, myUserId, cleanupCall]
  );

  const acceptCall = useCallback(
    async (callId: string) => {
      const incoming = useCallStore.getState().incomingCall;
      if (!incoming) return;

      try {
        const localStream = await getUserMedia(incoming.type);
        localStreamRef.current = localStream;
        setLocalStream(localStream);

        activeCallIdRef.current = callId;

        // Non-initiator: wait for offer from the caller
        const peer = new SimplePeer({
          initiator: false,
          trickle: true,
          stream: localStream,
          config: ICE_CONFIG,
        });
        wirePeerEvents(peer, callId, incoming.callerId);
        peerRef.current = peer;

        emitCallAccept(socket, callId);

        setActiveCall({
          id: callId,
          channelId: incoming.channelId,
          type: incoming.type,
          status: 'ringing',
          initiatorId: incoming.callerId,
          participants: [buildParticipant(incoming.callerId)],
          startedAt: new Date(),
          endedAt: null,
          isScreenSharing: false,
          screenSharingUserId: null,
        });
        clearIncomingCall();
      } catch (err) {
        console.error('[useCall] acceptCall failed:', err);
        const msg = err instanceof Error ? err.message : 'Failed to accept call';
        toast.error(msg);
        cleanupCall();
      }
    },
    [socket, setLocalStream, setActiveCall, clearIncomingCall, cleanupCall, wirePeerEvents]
  );

  const declineCall = useCallback(
    (callId: string) => {
      emitCallDecline(socket, callId);
      clearIncomingCall();
    },
    [socket, clearIncomingCall]
  );

  const hangup = useCallback(() => {
    const callId = activeCallIdRef.current;
    const current = useCallStore.getState().activeCall;

    if (callId && !callId.startsWith('pending_')) {
      emitCallHangup(socket, callId);
    }

    if (current) {
      const durationMs = current.startedAt ? Date.now() - current.startedAt.getTime() : 0;
      addToCallHistory({
        callId: current.id,
        channelId: current.channelId,
        type: current.type,
        status: 'completed',
        duration: Math.floor(durationMs / 1000),
        participantIds: current.participants.map((p) => p.userId),
        startedAt: current.startedAt,
        endedAt: new Date(),
      });
    }

    cleanupCall();
  }, [socket, addToCallHistory, cleanupCall]);

  const toggleMedia = useCallback(
    async (mediaType: 'audio' | 'video' | 'screen') => {
      const callId = activeCallIdRef.current;
      const state = useCallStore.getState();

      if (mediaType === 'audio') {
        const newMuted = !state.isMuted;
        toggleMute();
        localStreamRef.current?.getAudioTracks().forEach((t) => {
          t.enabled = !newMuted;
        });
        if (callId && !callId.startsWith('pending_')) {
          emitCallToggleMedia(socket, callId, newMuted, state.isCameraOn);
        }
      } else if (mediaType === 'video') {
        const newCameraOn = !state.isCameraOn;
        toggleCamera();
        localStreamRef.current?.getVideoTracks().forEach((t) => {
          t.enabled = newCameraOn;
        });
        if (callId && !callId.startsWith('pending_')) {
          emitCallToggleMedia(socket, callId, state.isMuted, newCameraOn);
        }
      } else if (mediaType === 'screen') {
        await handleScreenShare(state);
      }
    },
    [socket, toggleMute, toggleCamera] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ---------------------------------------------------------------------------
  // Screen share (internal — not a useCallback, called from toggleMedia)
  // ---------------------------------------------------------------------------

  async function handleScreenShare(state: ReturnType<typeof useCallStore.getState>) {
    if (!state.isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' } as MediaTrackConstraints,
          audio: false,
        });

        screenStreamRef.current = screenStream;
        setScreenStream(screenStream);
        toggleScreenShareAction();

        const screenTrack = screenStream.getVideoTracks()[0];

        // Replace video track in the peer connection without renegotiation
        if (peerRef.current) {
          const pc = (peerRef.current as SimplePeer.Instance & { _pc: RTCPeerConnection })._pc;
          const sender = pc?.getSenders().find((s) => s.track?.kind === 'video');
          if (sender && screenTrack) {
            await sender.replaceTrack(screenTrack);
          }
        }

        // Restore camera when user stops sharing via browser chrome
        screenTrack?.addEventListener('ended', () => {
          restoreCameraTrack();
        });
      } catch (err) {
        if ((err as Error).name !== 'NotAllowedError') {
          console.error('[useCall] getDisplayMedia failed:', err);
        }
      }
    } else {
      restoreCameraTrack();
    }
  }

  function restoreCameraTrack() {
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
    if (peerRef.current && cameraTrack) {
      const pc = (peerRef.current as SimplePeer.Instance & { _pc: RTCPeerConnection })._pc;
      const sender = pc?.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        sender.replaceTrack(cameraTrack).catch(console.error);
      }
    }
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    const currentState = useCallStore.getState();
    if (currentState.isScreenSharing) toggleScreenShareAction();
  }

  return { startCall, acceptCall, declineCall, hangup, toggleMedia };
}
