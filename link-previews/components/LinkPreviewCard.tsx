'use client';

/**
 * link-previews/components/LinkPreviewCard.tsx
 *
 * Rich Open Graph preview card displayed below a message.
 * Features: left accent border, favicon + site name, bold title, truncated description,
 * thumbnail, and special rendering for YouTube and GitHub.
 */

import { motion } from 'framer-motion';
import { ExternalLink, Play, Star, GitFork } from 'lucide-react';
import type { LinkPreviewData } from '../types';

interface LinkPreviewCardProps {
  preview: LinkPreviewData;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isYouTube(url: string): boolean {
  return /youtube\.com\/watch|youtu\.be\//.test(url);
}

function isGitHub(url: string): boolean {
  return /github\.com\//.test(url);
}

function getYouTubeVideoId(url: string): string | null {
  const match =
    url.match(/youtube\.com\/watch\?v=([^&]+)/) ??
    url.match(/youtu\.be\/([^?]+)/);
  return match?.[1] ?? null;
}

function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function YouTubePreview({ preview }: { preview: LinkPreviewData }) {
  const videoId = getYouTubeVideoId(preview.url);
  const thumbnail = videoId
    ? getYouTubeThumbnail(videoId)
    : preview.imageUrl ?? undefined;

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 p-3 rounded-md border border-l-4 border-l-red-500 bg-muted/40 hover:bg-muted/60 transition-colors group"
    >
      {thumbnail && (
        <div className="relative flex-shrink-0 w-28 h-16 rounded overflow-hidden bg-black">
          <img
            src={thumbnail}
            alt={preview.title ?? 'YouTube video'}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
            <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
              <Play className="h-4 w-4 text-white fill-white ml-0.5" />
            </div>
          </div>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-1">
          {preview.favicon && (
            <img
              src={preview.favicon}
              alt=""
              className="w-3.5 h-3.5 rounded-sm"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <span className="text-xs text-muted-foreground">YouTube</span>
        </div>
        {preview.title && (
          <p className="text-sm font-semibold line-clamp-2 text-foreground">
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
            {preview.description}
          </p>
        )}
      </div>
    </a>
  );
}

function GitHubPreview({ preview }: { preview: LinkPreviewData }) {
  // Extract org/repo from URL
  const match = preview.url.match(/github\.com\/([^/]+\/[^/?#]+)/);
  const repoPath = match?.[1];

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 p-3 rounded-md border border-l-4 border-l-gray-700 bg-muted/40 hover:bg-muted/60 transition-colors"
    >
      <div className="flex-shrink-0 w-8 h-8 mt-0.5">
        {preview.favicon ? (
          <img
            src={preview.favicon}
            alt="GitHub"
            className="w-8 h-8 rounded"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center">
            <GitFork className="w-4 h-4 text-white" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-0.5">
          <span className="text-xs text-muted-foreground">github.com</span>
        </div>
        <p className="text-sm font-semibold text-foreground truncate">
          {repoPath ?? preview.title ?? preview.url}
        </p>
        {preview.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {preview.description}
          </p>
        )}
      </div>
      {preview.imageUrl && (
        <div className="flex-shrink-0">
          <img
            src={preview.imageUrl}
            alt=""
            className="w-16 h-12 rounded object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
    </a>
  );
}

function GenericPreview({ preview }: { preview: LinkPreviewData }) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 p-3 rounded-md border border-l-4 border-l-primary bg-muted/40 hover:bg-muted/60 transition-colors"
    >
      <div className="flex-1 min-w-0">
        {/* Site name header */}
        <div className="flex items-center gap-1 mb-1">
          {preview.favicon && (
            <img
              src={preview.favicon}
              alt=""
              className="w-3.5 h-3.5 rounded-sm"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <span className="text-xs text-muted-foreground truncate">
            {preview.domain}
          </span>
          <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        </div>

        {/* Title */}
        {preview.title && (
          <p className="text-sm font-semibold text-foreground line-clamp-2">
            {preview.title}
          </p>
        )}

        {/* Description */}
        {preview.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {preview.description}
          </p>
        )}
      </div>

      {/* Thumbnail */}
      {preview.imageUrl && (
        <div className="flex-shrink-0">
          <img
            src={preview.imageUrl}
            alt=""
            className="w-[120px] max-h-[80px] rounded object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function LinkPreviewCard({ preview }: LinkPreviewCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="mt-2 max-w-lg"
    >
      {isYouTube(preview.url) ? (
        <YouTubePreview preview={preview} />
      ) : isGitHub(preview.url) ? (
        <GitHubPreview preview={preview} />
      ) : (
        <GenericPreview preview={preview} />
      )}
    </motion.div>
  );
}
