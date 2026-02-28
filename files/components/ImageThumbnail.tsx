'use client';

/**
 * files/components/ImageThumbnail.tsx
 *
 * Inline image thumbnail in a message. Renders at max 300x300 with rounded corners.
 * Click opens a full-size lightbox overlay.
 *
 * Usage:
 *   <ImageThumbnail file={fileAttachment} />
 */

import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { FileAttachment } from '@/shared/types';

interface ImageThumbnailProps {
  file: FileAttachment;
  className?: string;
}

export function ImageThumbnail({ file, className }: ImageThumbnailProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const openLightbox = useCallback(() => {
    setIsLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setIsLightboxOpen(false);
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!isLightboxOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeLightbox();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    // Prevent body scrolling while lightbox is open
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isLightboxOpen, closeLightbox]);

  return (
    <>
      {/* Thumbnail */}
      <button
        onClick={openLightbox}
        className={cn(
          'group relative block overflow-hidden rounded-lg',
          className
        )}
        aria-label={`View full image: ${file.name}`}
      >
        {/* Placeholder while loading */}
        {!isLoaded && (
          <div className="flex h-40 w-56 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
          </div>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={file.url}
          alt={file.name}
          loading="lazy"
          onLoad={() => setIsLoaded(true)}
          className={cn(
            'max-h-[300px] max-w-[300px] rounded-lg object-cover transition-opacity',
            isLoaded ? 'opacity-100' : 'h-0 w-0 opacity-0'
          )}
        />

        {/* Hover overlay */}
        {isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 transition-colors group-hover:bg-black/10" />
        )}
      </button>

      {/* Lightbox overlay */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={closeLightbox}
          role="dialog"
          aria-modal="true"
          aria-label={`Full image: ${file.name}`}
        >
          {/* Close button */}
          <button
            onClick={closeLightbox}
            className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
            aria-label="Close lightbox"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Full-size image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={file.url}
            alt={file.name}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
