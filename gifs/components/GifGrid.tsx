'use client';

/**
 * gifs/components/GifGrid.tsx
 *
 * Masonry-style 2-column GIF grid.
 * Static thumbnail shown by default; auto-plays animated GIF on hover.
 * Clicking a GIF calls onSelect with the TenorGif object.
 */

import { useRef, useState } from 'react';
import type { TenorGif } from '../types';

interface GifGridProps {
  gifs: TenorGif[];
  onSelect: (gif: TenorGif) => void;
  loading?: boolean;
}

function GifTile({
  gif,
  onSelect,
}: {
  gif: TenorGif;
  onSelect: (gif: TenorGif) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [hovered, setHovered] = useState(false);

  function handleMouseEnter() {
    setHovered(true);
    if (imgRef.current) {
      imgRef.current.src = gif.url; // Switch to animated GIF
    }
  }

  function handleMouseLeave() {
    setHovered(false);
    if (imgRef.current) {
      imgRef.current.src = gif.previewUrl; // Back to static preview
    }
  }

  const aspectRatio =
    gif.height > 0 && gif.width > 0 ? (gif.height / gif.width) * 100 : 75;

  return (
    <button
      className="relative w-full overflow-hidden rounded-md bg-muted cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary transition-opacity hover:opacity-90"
      onClick={() => onSelect(gif)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title={gif.title || 'GIF'}
      aria-label={`Insert GIF: ${gif.title || 'GIF'}`}
    >
      <div style={{ paddingBottom: `${Math.min(aspectRatio, 150)}%` }} />
      <img
        ref={imgRef}
        src={gif.previewUrl}
        alt={gif.title || 'GIF'}
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover"
      />
    </button>
  );
}

export function GifGrid({ gifs, onSelect, loading }: GifGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-1 p-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-md bg-muted animate-pulse"
            style={{ paddingBottom: '75%' }}
          />
        ))}
      </div>
    );
  }

  if (gifs.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        No GIFs found
      </div>
    );
  }

  // Split into two columns for masonry layout
  const col1: TenorGif[] = [];
  const col2: TenorGif[] = [];
  gifs.forEach((gif, i) => {
    if (i % 2 === 0) col1.push(gif);
    else col2.push(gif);
  });

  return (
    <div className="flex gap-1 p-1">
      <div className="flex-1 flex flex-col gap-1">
        {col1.map((gif) => (
          <GifTile key={gif.id} gif={gif} onSelect={onSelect} />
        ))}
      </div>
      <div className="flex-1 flex flex-col gap-1">
        {col2.map((gif) => (
          <GifTile key={gif.id} gif={gif} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
