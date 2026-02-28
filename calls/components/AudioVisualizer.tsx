/**
 * calls/components/AudioVisualizer.tsx
 *
 * Canvas-based audio waveform bar visualizer.
 * Renders animated vertical bars whose height is proportional to audio level.
 *
 * Usage:
 *   <AudioVisualizer level={audioLevel} barCount={5} />
 *   where audioLevel is 0–1 from useAudioLevel()
 */

'use client';

import { useRef, useEffect } from 'react';

interface AudioVisualizerProps {
  /** Audio level 0–1 from useAudioLevel hook */
  level: number;
  /** Number of vertical bars to render */
  barCount?: number;
  /** Canvas width in px */
  width?: number;
  /** Canvas height in px */
  height?: number;
  /** Bar color (CSS color string) */
  color?: string;
  className?: string;
}

export function AudioVisualizer({
  level,
  barCount = 5,
  width = 40,
  height = 24,
  color = '#22c55e',
  className,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const levelRef = useRef(level);
  levelRef.current = level;

  // Phase offsets so bars animate at slightly different rates (liveness effect)
  const phaseRef = useRef<number[]>(
    Array.from({ length: barCount }, (_, i) => (i / barCount) * Math.PI * 2)
  );
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const barWidth = Math.floor((width - (barCount - 1) * 2) / barCount);
    const gap = 2;

    const draw = () => {
      frameRef.current += 0.06;
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < barCount; i++) {
        // Each bar oscillates slightly around the base level
        const phase = phaseRef.current[i] + frameRef.current;
        const oscillation = Math.sin(phase) * 0.2;
        const rawLevel = Math.max(0, Math.min(1, levelRef.current + oscillation));
        const barHeight = Math.max(4, rawLevel * height);

        const x = i * (barWidth + gap);
        const y = height - barHeight;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [barCount, width, height, color]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
