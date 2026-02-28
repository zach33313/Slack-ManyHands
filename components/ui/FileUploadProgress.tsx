'use client';

/**
 * components/ui/FileUploadProgress.tsx
 *
 * Circular SVG progress ring that fills clockwise as a file uploads.
 * Transforms into a checkmark icon on completion (progress = 100).
 * Uses Framer Motion for smooth strokeDashoffset animation.
 *
 * Usage:
 *   import { FileUploadProgress } from '@/components/ui/FileUploadProgress';
 *   <FileUploadProgress progress={uploadPercent} size={48} />
 */

import { m, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';

interface FileUploadProgressProps {
  /** Upload completion percentage (0–100) */
  progress: number;
  /** Container size in pixels (default: 48) */
  size?: number;
  /** Stroke width (default: 4) */
  strokeWidth?: number;
}

export function FileUploadProgress({
  progress,
  size = 48,
  strokeWidth = 4,
}: FileUploadProgressProps) {
  const center = size / 2;
  const radius = center - strokeWidth * 2;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const dashOffset = circumference - (clampedProgress / 100) * circumference;
  const isComplete = clampedProgress >= 100;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={clampedProgress}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/* SVG ring */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <m.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </svg>

      {/* Checkmark on completion */}
      <AnimatePresence>
        {isComplete && (
          <m.div
            key="checkmark"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Check
              className="text-primary"
              style={{ width: size * 0.4, height: size * 0.4 }}
            />
          </m.div>
        )}
      </AnimatePresence>

      {/* Percentage text (shown while in progress) */}
      <AnimatePresence>
        {!isComplete && (
          <m.span
            key="percentage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-primary"
          >
            {Math.round(clampedProgress)}%
          </m.span>
        )}
      </AnimatePresence>
    </div>
  );
}
