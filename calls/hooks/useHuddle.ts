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

const MAX_HUDDLE_PARTICIPANTS = 6;

const STUN_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

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

function buildSkeletonParticipant(userId: string): CallParticipant {
  return {
    userId,
    user: { id: userId, name: userId, image: null },
    status: 'joining',
    isMuted: false,
    isCameraOn: false,
    isScreenSharing: false,
    audioLevel: 0,
    joinedAt: new Date(),
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

  const store = useCallStore();

  // Map of remoteUserId → SimplePeer instance
  const peersRef = useRef<Map<string, SimplePeer.Instance>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const currentChannelRef = useRef<string | null>(null);

  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isInHuddle, setIsInHuddle] = useState(false);

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
    store.setLocalStream(null);

    setRemoteStreams(new Map());
    setIsInHuddle(false);
    currentChannelRef.current = null;

    store.setHuddle(channelId, null);
  }, [socket, store]);

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

      const peer = new SimplePeer({
        initiator,
        trickle: true,
        stream: localStream,
        config: STUN_CONFIG,
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
        store.updateHuddleParticipant(channelId, remoteUserId, { stream, status: 'connected' });
      });

      peer.on('connect', () => {
        store.updateHuddleParticipant(channelId, remoteUserId, { status: 'connected' });
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
    [socket, store, myUserId]
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
        // Huddles are audio-only by default
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;
        store.setLocalStream(stream);
        currentChannelRef.current = channelId;

        emitHuddleJoin(socket, channelId);
        setIsInHuddle(true);

        store.setHuddle(channelId, {
          channelId,
          participants: [],
          startedAt: new Date(),
          isActive: true,
        });
      } catch (err) {
        console.error('[useHuddle] joinHuddle failed:', err);
      }
    },
    [socket, store, leaveHuddle]
  );

  // ---------------------------------------------------------------------------
  // Socket event listeners
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const onStarted = ({ channelId, participants }: HuddleStartedPayload) => {
      if (channelId !== currentChannelRef.current) return;
      const existing = store.huddlesByChannel[channelId];
      if (existing) {
        store.setHuddle(channelId, { ...existing, participants: participants.map(buildParticipant) });
      }
    };

    const onParticipants = ({ channelId, participants }: HuddleParticipantsPayload) => {
      if (channelId !== currentChannelRef.current) return;

      const callParticipants = participants.map(buildParticipant);
      const existing = store.huddlesByChannel[channelId];
      store.setHuddle(channelId, {
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

      // Add to huddle state
      const huddle = store.huddlesByChannel[channelId];
      if (huddle) {
        const alreadyIn = huddle.participants.some((p) => p.userId === participant.userId);
        if (!alreadyIn) {
          store.setHuddle(channelId, {
            ...huddle,
            participants: [...huddle.participants, buildParticipant(participant)],
          });
        }
      }

      // Enforce max participant limit
      const participantCount = (store.huddlesByChannel[channelId]?.participants ?? []).length;
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

      const huddle = store.huddlesByChannel[channelId];
      if (huddle) {
        store.setHuddle(channelId, {
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
        // Peer not yet created — create it then signal
        createPeerForUser(fromUserId, channelId);
        setTimeout(() => {
          peersRef.current.get(fromUserId)?.signal(signal as SimplePeer.SignalData);
        }, 0);
      }
    };

    const onMediaToggled = ({
      channelId,
      userId,
      isMuted,
      isCameraOn,
    }: HuddleMediaToggledPayload) => {
      store.updateHuddleParticipant(channelId, userId, { isMuted, isCameraOn });
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
      socket.off('huddle:started', onStarted);
      socket.off('huddle:participants', onParticipants);
      socket.off('huddle:user-joined', onUserJoined);
      socket.off('huddle:user-left', onUserLeft);
      socket.off('huddle:signal', onSignal);
      socket.off('huddle:media-toggled', onMediaToggled);
      socket.off('huddle:ended', onEnded);
    };
  }, [socket, store, createPeerForUser, myUserId, leaveHuddle]);

  // ---------------------------------------------------------------------------
  // Media toggles
  // ---------------------------------------------------------------------------

  const toggleAudio = useCallback(() => {
    const channelId = currentChannelRef.current;
    if (!channelId || !localStreamRef.current) return;

    const newMuted = !store.isMuted;
    store.toggleMute();
    localStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !newMuted;
    });
    emitHuddleToggleMedia(socket, channelId, newMuted, store.isCameraOn);
  }, [socket, store]);

  const toggleVideo = useCallback(() => {
    const channelId = currentChannelRef.current;
    if (!channelId || !localStreamRef.current) return;

    const newCameraOn = !store.isCameraOn;
    store.toggleCamera();
    localStreamRef.current.getVideoTracks().forEach((t) => {
      t.enabled = newCameraOn;
    });
    emitHuddleToggleMedia(socket, channelId, store.isMuted, newCameraOn);
  }, [socket, store]);

  // Derive participants from store for the current channel
  const participants = currentChannelRef.current
    ? (store.huddlesByChannel[currentChannelRef.current]?.participants ?? [])
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
