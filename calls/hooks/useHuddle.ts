/**
 * calls/hooks/useHuddle.ts
 *
 * Manages a group huddle using mesh topology (each peer connects to every other peer).
 * Supports up to 6 participants (limited by mesh bandwidth constraints).
 *
 * Initiator selection: the peer with the lexicographically lower userId initiates
 * to avoid race conditions where both sides create an offer simultaneously.
 *
 * Usage:
 *   const { joinHuddle, leaveHuddle, participants, isInHuddle, toggleAudio, toggleVideo } = useHuddle()
 */

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useSession } from 'next-auth/react';
import SimplePeer from 'simple-peer';
import { useSocket } from '@/shared/hooks/useSocket';
import { useCallStore } from '@/calls/store';
import type { CallParticipant } from '@/calls/types';
import type {
  HuddleUserJoinedPayload,
  HuddleUserLeftPayload,
  HuddleSignalFromServerPayload,
  HuddleParticipantsPayload,
  HuddleMediaToggledPayload,
  HuddleEndedPayload,
  HuddleStartedPayload,
  HuddleParticipant,
} from '@/shared/types/socket';
import {
  emitHuddleJoin,
  emitHuddleLeave,
  emitHuddleSignal,
  emitHuddleToggleMedia,
} from '@/calls/lib/signaling';
import { toast } from 'sonner';
import { ICE_CONFIG } from '@/calls/lib/iceConfig';

const MAX_HUDDLE_PARTICIPANTS = 6;

// ---------------------------------------------------------------------------
// Helpers (module-level — no closures over component state)
// ---------------------------------------------------------------------------

function buildParticipant(p: HuddleParticipant): CallParticipant {
  return {
    userId: p.userId,
    user: p.user,
    status: 'joining',
    isMuted: p.isMuted,
    isCameraOn: p.isCameraOn,
    isScreenSharing: false,
    audioLevel: 0,
    joinedAt: p.joinedAt instanceof Date ? p.joinedAt : new Date(p.joinedAt),
    stream: null,
  };
}

// ---------------------------------------------------------------------------
// Hook types
// ---------------------------------------------------------------------------

export interface UseHuddleReturn {
  joinHuddle: (channelId: string) => Promise<void>;
  leaveHuddle: () => void;
  participants: CallParticipant[];
  isInHuddle: boolean;
  remoteStreams: Map<string, MediaStream>;
  toggleAudio: () => void;
  toggleVideo: () => void;
}

// ---------------------------------------------------------------------------
// useHuddle hook
// ---------------------------------------------------------------------------

export function useHuddle(): UseHuddleReturn {
  const socket = useSocket();
  const { data: session } = useSession();
  const myUserId = session?.user?.id ?? '';

  // Stable action selectors (never change between renders)
  const setLocalStream = useCallStore((s) => s.setLocalStream);
  const setHuddle = useCallStore((s) => s.setHuddle);
  const setActiveHuddleChannelId = useCallStore((s) => s.setActiveHuddleChannelId);
  const updateHuddleParticipant = useCallStore((s) => s.updateHuddleParticipant);
  const toggleMute = useCallStore((s) => s.toggleMute);
  const toggleCamera = useCallStore((s) => s.toggleCamera);

  // Map of remoteUserId → SimplePeer instance
  const peersRef = useRef<Map<string, SimplePeer.Instance>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const currentChannelRef = useRef<string | null>(null);

  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  // ---------------------------------------------------------------------------
  // leaveHuddle — defined first so joinHuddle can call it
  // ---------------------------------------------------------------------------

  const leaveHuddle = useCallback(() => {
    const channelId = currentChannelRef.current;
    if (!channelId) return;

    emitHuddleLeave(socket, channelId);

    // Destroy all peer connections
    peersRef.current.forEach((peer) => peer.destroy());
    peersRef.current.clear();

    // Stop local stream
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);

    setRemoteStreams(new Map());
    setActiveHuddleChannelId(null);
    currentChannelRef.current = null;

    setHuddle(channelId, null);
  }, [socket, setLocalStream, setHuddle, setActiveHuddleChannelId]);

  // ---------------------------------------------------------------------------
  // createPeerForUser — creates/manages a peer connection to one remote user
  // ---------------------------------------------------------------------------

  const createPeerForUser = useCallback(
    (remoteUserId: string, channelId: string) => {
      const localStream = localStreamRef.current;
      if (!localStream) return;
      if (peersRef.current.has(remoteUserId)) return;
      if (!myUserId) return;

      // Lower userId acts as initiator to prevent double-offer race condition
      const initiator = myUserId < remoteUserId;

      console.log(`[useHuddle] Creating peer for ${remoteUserId} (initiator: ${initiator})`);

      const peer = new SimplePeer({
        initiator,
        trickle: true,
        stream: localStream,
        config: ICE_CONFIG,
      });

      peer.on('signal', (signal: SimplePeer.SignalData) => {
        emitHuddleSignal(socket, channelId, remoteUserId, signal);
      });

      peer.on('stream', (stream: MediaStream) => {
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.set(remoteUserId, stream);
          return next;
        });
        updateHuddleParticipant(channelId, remoteUserId, { stream, status: 'connected' });
      });

      peer.on('connect', () => {
        console.log(`[useHuddle] Connected to ${remoteUserId}`);
        updateHuddleParticipant(channelId, remoteUserId, { status: 'connected' });
      });

      peer.on('error', (err: Error) => {
        console.error(`[useHuddle] peer error with ${remoteUserId}:`, err);
        peer.destroy();
        peersRef.current.delete(remoteUserId);
      });

      peer.on('close', () => {
        peersRef.current.delete(remoteUserId);
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(remoteUserId);
          return next;
        });
      });

      peersRef.current.set(remoteUserId, peer);
    },
    [socket, updateHuddleParticipant, myUserId]
  );

  // ---------------------------------------------------------------------------
  // joinHuddle
  // ---------------------------------------------------------------------------

  const joinHuddle = useCallback(
    async (channelId: string) => {
      if (currentChannelRef.current === channelId) return;

      // Leave current huddle before joining a different one
      if (currentChannelRef.current) {
        leaveHuddle();
      }

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            'Microphone access requires a secure connection (HTTPS or localhost).'
          );
        }

        // Huddles are audio-only by default
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;
        setLocalStream(stream);
        currentChannelRef.current = channelId;

        emitHuddleJoin(socket, channelId);
        setActiveHuddleChannelId(channelId);

        setHuddle(channelId, {
          channelId,
          participants: [],
          startedAt: new Date(),
          isActive: true,
        });
      } catch (err) {
        console.error('[useHuddle] joinHuddle failed:', err);
        const msg = err instanceof Error ? err.message : 'Failed to join huddle';
        toast.error(msg);
      }
    },
    [socket, setLocalStream, setHuddle, leaveHuddle]
  );

  // ---------------------------------------------------------------------------
  // Socket event listeners
  // ---------------------------------------------------------------------------

  useEffect(() => {
    console.log('[useHuddle] Registering huddle event listeners');

    const onStarted = ({ channelId, participants }: HuddleStartedPayload) => {
      if (channelId !== currentChannelRef.current) return;
      // Read current state fresh (not from stale closure)
      const existing = useCallStore.getState().huddlesByChannel[channelId];
      if (existing) {
        setHuddle(channelId, { ...existing, participants: participants.map(buildParticipant) });
      }
    };

    const onParticipants = ({ channelId, participants }: HuddleParticipantsPayload) => {
      if (channelId !== currentChannelRef.current) return;

      const callParticipants = participants.map(buildParticipant);
      const existing = useCallStore.getState().huddlesByChannel[channelId];
      setHuddle(channelId, {
        channelId,
        participants: callParticipants,
        startedAt: existing?.startedAt ?? new Date(),
        isActive: true,
      });

      // Create peer connections to all existing participants
      participants.forEach((p) => {
        if (p.userId !== myUserId) {
          createPeerForUser(p.userId, channelId);
        }
      });
    };

    const onUserJoined = ({ channelId, participant }: HuddleUserJoinedPayload) => {
      if (channelId !== currentChannelRef.current) return;
      if (participant.userId === myUserId) return;

      // Read current state fresh
      const huddle = useCallStore.getState().huddlesByChannel[channelId];
      if (huddle) {
        const alreadyIn = huddle.participants.some((p) => p.userId === participant.userId);
        if (!alreadyIn) {
          setHuddle(channelId, {
            ...huddle,
            participants: [...huddle.participants, buildParticipant(participant)],
          });
        }
      }

      // Enforce max participant limit
      const currentHuddle = useCallStore.getState().huddlesByChannel[channelId];
      const participantCount = currentHuddle?.participants?.length ?? 0;
      if (participantCount > MAX_HUDDLE_PARTICIPANTS) {
        return;
      }

      createPeerForUser(participant.userId, channelId);
    };

    const onUserLeft = ({ channelId, userId }: HuddleUserLeftPayload) => {
      if (channelId !== currentChannelRef.current) return;

      const peer = peersRef.current.get(userId);
      if (peer) {
        peer.destroy();
        peersRef.current.delete(userId);
      }

      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });

      const huddle = useCallStore.getState().huddlesByChannel[channelId];
      if (huddle) {
        setHuddle(channelId, {
          ...huddle,
          participants: huddle.participants.filter((p) => p.userId !== userId),
        });
      }
    };

    const onSignal = ({ channelId, fromUserId, signal }: HuddleSignalFromServerPayload) => {
      if (channelId !== currentChannelRef.current) return;

      const peer = peersRef.current.get(fromUserId);
      if (peer) {
        peer.signal(signal as SimplePeer.SignalData);
      } else if (localStreamRef.current) {
        // Peer not yet created — create it then signal on next tick
        createPeerForUser(fromUserId, channelId);
        // Use queueMicrotask so the peer is in peersRef before we signal
        queueMicrotask(() => {
          peersRef.current.get(fromUserId)?.signal(signal as SimplePeer.SignalData);
        });
      }
    };

    const onMediaToggled = ({
      channelId,
      userId,
      isMuted,
      isCameraOn,
    }: HuddleMediaToggledPayload) => {
      updateHuddleParticipant(channelId, userId, { isMuted, isCameraOn });
    };

    const onEnded = ({ channelId }: HuddleEndedPayload) => {
      if (channelId !== currentChannelRef.current) return;
      leaveHuddle();
    };

    socket.on('huddle:started', onStarted);
    socket.on('huddle:participants', onParticipants);
    socket.on('huddle:user-joined', onUserJoined);
    socket.on('huddle:user-left', onUserLeft);
    socket.on('huddle:signal', onSignal);
    socket.on('huddle:media-toggled', onMediaToggled);
    socket.on('huddle:ended', onEnded);

    return () => {
      console.log('[useHuddle] Cleaning up huddle event listeners');
      socket.off('huddle:started', onStarted);
      socket.off('huddle:participants', onParticipants);
      socket.off('huddle:user-joined', onUserJoined);
      socket.off('huddle:user-left', onUserLeft);
      socket.off('huddle:signal', onSignal);
      socket.off('huddle:media-toggled', onMediaToggled);
      socket.off('huddle:ended', onEnded);
    };
  }, [socket, setHuddle, updateHuddleParticipant, createPeerForUser, myUserId, leaveHuddle]);

  // ---------------------------------------------------------------------------
  // Media toggles
  // ---------------------------------------------------------------------------

  const toggleAudio = useCallback(() => {
    const channelId = currentChannelRef.current;
    if (!channelId || !localStreamRef.current) return;

    const state = useCallStore.getState();
    const newMuted = !state.isMuted;
    toggleMute();
    localStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !newMuted;
    });
    emitHuddleToggleMedia(socket, channelId, newMuted, state.isCameraOn);
  }, [socket, toggleMute]);

  const toggleVideo = useCallback(() => {
    const channelId = currentChannelRef.current;
    if (!channelId || !localStreamRef.current) return;

    const state = useCallStore.getState();
    const newCameraOn = !state.isCameraOn;
    toggleCamera();
    localStreamRef.current.getVideoTracks().forEach((t) => {
      t.enabled = newCameraOn;
    });
    emitHuddleToggleMedia(socket, channelId, state.isMuted, newCameraOn);
  }, [socket, toggleCamera]);

  // Derive from store
  const activeHuddleChannelId = useCallStore((s) => s.activeHuddleChannelId);
  const huddlesByChannel = useCallStore((s) => s.huddlesByChannel);
  const isInHuddle = activeHuddleChannelId !== null;
  const participants = activeHuddleChannelId
    ? (huddlesByChannel[activeHuddleChannelId]?.participants ?? [])
    : [];

  return {
    joinHuddle,
    leaveHuddle,
    participants,
    isInHuddle,
    remoteStreams,
    toggleAudio,
    toggleVideo,
  };
}
