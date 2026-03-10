/**
 * calls/components/ParticipantTile.tsx
 *
 * Single participant in a call grid.
 * Shows <video> element with stream, or avatar + name when video is off.
 * Mute indicator overlay + audio-level green glow ring.
 *
 * Usage:
 *   <ParticipantTile participant={participant} />
 */

'use client';

import { useEffect, useRef } from 'react';
import { MicOff } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useAudioLevel } from '@/calls/hooks/useAudioLevel';
import type { CallParticipant } from '@/calls/types';

interface ParticipantTileProps {
  participant: CallParticipant;
  /** Whether this is the local user's tile */
  isLocal?: boolean;
  className?: string;
}

export function ParticipantTile({ participant, isLocal = false, className }: ParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioLevel = useAudioLevel(participant.stream ?? null);

  // Attach video stream (always muted — audio handled by FloatingCallWindow)
  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {});
    }
  }, [participant.stream]);

  const hasVideo = participant.isCameraOn && !!participant.stream;
  const isTalking = audioLevel > 0.08;

  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden rounded-xl bg-zinc-900',
        // Audio level glow ring — subtle green border when talking
        isTalking && !participant.isMuted && 'ring-2 ring-green-500 ring-offset-2 ring-offset-zinc-950',
        className
      )}
    >
      {/* Video stream (always muted — audio handled by FloatingCallWindow's <audio> elements) */}
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
      ) : (
        /* Avatar fallback when camera is off */
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-700 text-2xl font-semibold text-white">
            {participant.user.image ? (
              <img
                src={participant.user.image}
                alt={participant.user.name}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <span>{participant.user.name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <span className="text-sm font-medium text-white/80">
            {isLocal ? 'You' : participant.user.name}
          </span>
        </div>
      )}

      {/* Name label at bottom (shown when video is on) */}
      {hasVideo && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/50 px-2 py-0.5 backdrop-blur-sm">
          <span className="text-xs font-medium text-white">
            {isLocal ? 'You' : participant.user.name}
          </span>
        </div>
      )}

      {/* Mute indicator */}
      {participant.isMuted && (
        <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-600/90 backdrop-blur-sm">
          <MicOff className="h-3.5 w-3.5 text-white" />
        </div>
      )}

      {/* Screen sharing badge */}
      {participant.isScreenSharing && (
        <div className="absolute left-2 top-2 rounded-md bg-blue-600/90 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
          Sharing
        </div>
      )}
    </div>
  );
}
