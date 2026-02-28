'use client';

/**
 * messages/components/AudioPlayer.tsx
 *
 * Custom audio player component for voice messages in the message feed.
 * Features: waveform visualization, play/pause, current/total time, speed selector.
 */

import { useRef, useState, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AudioPlayerProps {
  src: string;
  duration?: number;
  /** Filename for display */
  label?: string;
}

const SPEEDS = [1, 1.5, 2] as const;
type Speed = (typeof SPEEDS)[number];

// Generate placeholder waveform bars since we can't decode the audio client-side
// on initial render. In a real app you'd store the waveform data with the file.
const NUM_BARS = 40;

function generatePlaceholderBars(): number[] {
  const bars: number[] = [];
  for (let i = 0; i < NUM_BARS; i++) {
    // Pseudo-random based on position — deterministic so it doesn't flicker
    const t = i / NUM_BARS;
    bars.push(
      0.2 +
        0.6 *
          Math.abs(
            Math.sin(t * Math.PI * 4) * 0.5 +
              Math.sin(t * Math.PI * 7 + 1) * 0.3 +
              Math.sin(t * Math.PI * 13 + 2) * 0.2
          )
    );
  }
  return bars;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioPlayer({ src, duration: initialDuration, label }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(initialDuration ?? 0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [bars] = useState(() => generatePlaceholderBars());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    audio.onloadedmetadata = () => {
      setDuration(Math.round(audio.duration));
    };

    audio.ontimeupdate = () => {
      setCurrent(audio.currentTime);
    };

    audio.onended = () => {
      setIsPlaying(false);
      setCurrent(0);
      audio.currentTime = 0;
    };

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, [src]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.playbackRate = speed;
      audio.play().catch(() => {});
      setIsPlaying(true);
    }
  }

  function cycleSpeed() {
    const idx = SPEEDS.indexOf(speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length]!;
    setSpeed(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
  }

  function handleBarClick(index: number) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const time = (index / NUM_BARS) * duration;
    audio.currentTime = time;
    setCurrent(time);
  }

  const progress = duration > 0 ? current / duration : 0;
  const playedBars = Math.floor(progress * NUM_BARS);

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30 max-w-xs">
      {/* Play/Pause button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 flex-shrink-0 rounded-full bg-primary/10 hover:bg-primary/20"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <Pause className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Play className="h-3.5 w-3.5 text-primary fill-primary ml-0.5" />
        )}
      </Button>

      {/* Waveform bars (clickable for seeking) */}
      <div
        className="flex items-center gap-px h-8 flex-1 cursor-pointer"
        role="slider"
        aria-label="Seek audio"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={Math.round(current)}
      >
        {bars.map((h, i) => (
          <div
            key={i}
            className={`flex-1 rounded-full transition-colors ${
              i < playedBars ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
            style={{ height: `${Math.max(3, h * 100)}%` }}
            onClick={() => handleBarClick(i)}
          />
        ))}
      </div>

      {/* Time */}
      <span className="text-xs font-mono text-muted-foreground tabular-nums flex-shrink-0">
        {isPlaying || current > 0
          ? formatTime(current)
          : formatTime(duration)}
      </span>

      {/* Speed button */}
      <button
        type="button"
        className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 w-7 text-center"
        onClick={cycleSpeed}
        title="Change playback speed"
      >
        {speed}x
      </button>
    </div>
  );
}
