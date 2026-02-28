/**
 * calls/components/ScreenShareView.tsx
 *
 * Full-width display of a shared screen stream.
 * Shows a "Stop Sharing" button overlay for the presenter.
 *
 * Usage:
 *   <ScreenShareView stream={screenStream} isPresenter={true} onStopSharing={...} />
 */

'use client';

import { useEffect, useRef } from 'react';
import { Monitor } from 'lucide-react';
import { motion } from 'framer-motion';
import { springSnappy, tapScale } from '@/shared/lib/animations';

interface ScreenShareViewProps {
  /** The screen capture MediaStream */
  stream: MediaStream;
  /** Whether the current user is the one sharing their screen */
  isPresenter: boolean;
  /** Called when the presenter clicks "Stop Sharing" */
  onStopSharing?: () => void;
  presenterName?: string;
}

export function ScreenShareView({
  stream,
  isPresenter,
  onStopSharing,
  presenterName,
}: ScreenShareViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="h-full w-full object-contain"
      />

      {/* Presenter label */}
      {presenterName && !isPresenter && (
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
          <Monitor className="h-3.5 w-3.5" />
          {presenterName}&apos;s screen
        </div>
      )}

      {/* Stop Sharing overlay for the presenter */}
      {isPresenter && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <motion.button
            onClick={onStopSharing}
            whileHover={{ scale: 1.04 }}
            whileTap={tapScale}
            transition={springSnappy}
            className="flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-red-700"
          >
            <Monitor className="h-4 w-4" />
            Stop Sharing
          </motion.button>
        </div>
      )}
    </div>
  );
}
