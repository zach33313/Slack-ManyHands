/**
 * calls/components/FloatingCallWindow.tsx
 *
 * Framer Motion draggable floating window shown during an active call.
 * Contains VideoGrid (video/huddle) or caller avatars (voice).
 * CallControls bar at bottom. CallTimer in corner.
 * Minimize button collapses to a small PiP bubble (64x64).
 *
 * Audio is decoupled from video: hidden <audio> elements handle remote audio
 * playback (inside the motion.div so AnimatePresence still works), while
 * <video> elements are always muted and only display video.
 *
 * Usage:
 *   <FloatingCallWindow onHangup={hangup} onToggleMute={...} ... />
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minimize2, Maximize2, PhoneOff } from 'lucide-react';
import { useCallStore } from '@/calls/store';
import { VideoGrid } from './VideoGrid';
import { CallControls } from './CallControls';
import { CallTimer } from './CallTimer';
import { ScreenShareView } from './ScreenShareView';
import { springGentle, tapScale } from '@/shared/lib/animations';
import type { CallParticipant } from '@/calls/types';
import { useSession } from 'next-auth/react';

/** Hidden audio element for remote audio playback */
function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      ref.current.play().catch(() => {});
    }
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline />;
}

interface FloatingCallWindowProps {
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
}

export function FloatingCallWindow({
  onHangup,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
}: FloatingCallWindowProps) {
  const { data: session } = useSession();
  const myUserId = session?.user?.id ?? '';

  const activeCall = useCallStore((s) => s.activeCall);
  const localStream = useCallStore((s) => s.localStream);
  const screenStream = useCallStore((s) => s.screenStream);
  const isMuted = useCallStore((s) => s.isMuted);
  const isCameraOn = useCallStore((s) => s.isCameraOn);
  const isScreenSharing = useCallStore((s) => s.isScreenSharing);

  const [minimized, setMinimized] = useState(false);

  if (!activeCall) return null;

  const isVoiceOnly = activeCall.type === '1:1' && !isCameraOn;
  const showVideo = !isVoiceOnly || activeCall.type === 'huddle';
  const showScreenShare = isScreenSharing && screenStream;

  // Build local participant for VideoGrid
  const localParticipant: CallParticipant | undefined = localStream
    ? {
        userId: myUserId,
        user: {
          id: myUserId,
          name: session?.user?.name ?? 'You',
          image: session?.user?.image ?? null,
        },
        status: 'connected',
        isMuted,
        isCameraOn,
        isScreenSharing,
        audioLevel: 0,
        joinedAt: activeCall.startedAt,
        stream: localStream,
      }
    : undefined;

  // Hidden audio elements for all remote participants — rendered inside the
  // motion.div so AnimatePresence can still track this component properly
  const remoteAudioElements = activeCall.participants
    .filter((p) => p.stream)
    .map((p) => <RemoteAudio key={`audio-${p.userId}`} stream={p.stream!} />);

  // PiP bubble (minimized state)
  if (minimized) {
    return (
      <motion.div
        drag
        dragMomentum={false}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={springGentle}
        className="fixed bottom-20 right-6 z-50 cursor-move touch-none select-none"
      >
        {/* Audio elements (invisible, persists in minimized mode) */}
        {remoteAudioElements}

        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 shadow-2xl ring-2 ring-zinc-700">
          {/* Timer */}
          {activeCall.status === 'connected' && (
            <CallTimer
              startedAt={activeCall.startedAt}
              className="text-xs font-mono text-white/90 tabular-nums"
            />
          )}
          {activeCall.status !== 'connected' && (
            <div className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
          )}

          {/* Expand button */}
          <button
            onClick={() => setMinimized(false)}
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-600 text-white hover:bg-zinc-500"
            aria-label="Expand call window"
          >
            <Maximize2 className="h-2.5 w-2.5" />
          </button>

          {/* Hangup button */}
          <button
            onClick={onHangup}
            className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700"
            aria-label="Hang up"
          >
            <PhoneOff className="h-2.5 w-2.5" />
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      drag
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      transition={springGentle}
      className="fixed bottom-20 right-6 z-50 flex cursor-move touch-none select-none flex-col overflow-hidden rounded-2xl bg-zinc-900 shadow-2xl"
      style={{ width: 340, height: showVideo ? 380 : 160 }}
    >
      {/* Audio elements (invisible, persists across all visual modes) */}
      {remoteAudioElements}

      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
          <span className="text-xs font-medium text-white/80">
            {activeCall.status === 'connected' ? 'Connected' : 'Connecting…'}
          </span>
          {activeCall.status === 'connected' && (
            <CallTimer startedAt={activeCall.startedAt} />
          )}
        </div>

        <button
          onClick={() => setMinimized(true)}
          className="text-zinc-400 hover:text-white"
          aria-label="Minimize call window"
        >
          <Minimize2 className="h-4 w-4" />
        </button>
      </div>

      {/* Content area */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {showScreenShare ? (
            <ScreenShareView
              key="screen"
              stream={screenStream!}
              isPresenter={isScreenSharing}
              onStopSharing={onToggleScreenShare}
            />
          ) : showVideo ? (
            <VideoGrid
              key="video"
              participants={activeCall.participants}
              localParticipant={localParticipant}
              className="h-full"
            />
          ) : (
            /* Voice-only: show participant avatars */
            <div key="voice" className="flex h-full items-center justify-center gap-4 px-4">
              {activeCall.participants.map((p) => (
                <div key={p.userId} className="flex flex-col items-center gap-1">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-700 text-lg font-semibold text-white">
                    {p.user.image ? (
                      <img src={p.user.image} alt={p.user.name} className="h-full w-full rounded-full object-cover" />
                    ) : (
                      p.user.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="text-xs text-zinc-400">{p.user.name}</span>
                </div>
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls bar */}
      <div className="flex justify-center pb-3 pt-2">
        <CallControls
          isMuted={isMuted}
          isCameraOn={isCameraOn}
          isScreenSharing={isScreenSharing}
          onToggleMute={onToggleMute}
          onToggleCamera={onToggleCamera}
          onToggleScreenShare={onToggleScreenShare}
          onHangup={onHangup}
          audioOnly={isVoiceOnly}
        />
      </div>
    </motion.div>
  );
}
