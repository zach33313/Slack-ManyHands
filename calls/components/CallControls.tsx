/**
 * calls/components/CallControls.tsx
 *
 * Bottom button bar for an active call: mute, camera, screen share, hang up.
 * Each button uses Framer Motion whileHover/whileTap for tactile feedback.
 *
 * Usage:
 *   <CallControls onHangup={hangup} onToggleMute={...} onToggleCamera={...} onScreenShare={...} />
 */

'use client';

import { motion } from 'framer-motion';
import {
  Mic,
  MicOff,
  Camera,
  CameraOff,
  Monitor,
  PhoneOff,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { springSnappy, tapScale } from '@/shared/lib/animations';

interface CallControlsProps {
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onHangup: () => void;
  /** Hide camera controls (for audio-only calls) */
  audioOnly?: boolean;
  className?: string;
}

interface ControlButtonProps {
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  label: string;
  children: React.ReactNode;
}

function ControlButton({ onClick, active = true, danger = false, label, children }: ControlButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.08 }}
      whileTap={tapScale}
      transition={springSnappy}
      aria-label={label}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-full transition-colors',
        danger
          ? 'bg-red-600 text-white hover:bg-red-700'
          : active
            ? 'bg-white/20 text-white hover:bg-white/30'
            : 'bg-white/10 text-white/50 hover:bg-white/20'
      )}
    >
      {children}
    </motion.button>
  );
}

export function CallControls({
  isMuted,
  isCameraOn,
  isScreenSharing,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onHangup,
  audioOnly = false,
  className,
}: CallControlsProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-3 rounded-full bg-black/60 px-4 py-2 backdrop-blur-md',
        className
      )}
    >
      {/* Mute / Unmute */}
      <ControlButton
        onClick={onToggleMute}
        active={!isMuted}
        label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
      >
        {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
      </ControlButton>

      {/* Camera toggle (hidden for audio-only calls) */}
      {!audioOnly && (
        <ControlButton
          onClick={onToggleCamera}
          active={isCameraOn}
          label={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {isCameraOn ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
        </ControlButton>
      )}

      {/* Screen share */}
      {!audioOnly && (
        <ControlButton
          onClick={onToggleScreenShare}
          active={!isScreenSharing}
          label={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
        >
          <Monitor className={cn('h-5 w-5', isScreenSharing && 'text-blue-400')} />
        </ControlButton>
      )}

      {/* Hang up */}
      <ControlButton onClick={onHangup} danger label="Hang up">
        <PhoneOff className="h-5 w-5" />
      </ControlButton>
    </div>
  );
}
