'use client';

/**
 * files/components/FileAttachmentRow.tsx
 *
 * Displays a non-image file attachment as a bordered pill/card below message content.
 * Shows file type icon, filename, file size, and download link.
 *
 * Usage:
 *   <FileAttachmentRow file={fileAttachment} />
 */

import { FileText, FileArchive, File as FileIcon, Download } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { formatFileSize } from '@/shared/lib/utils';
import type { FileAttachment } from '@/shared/types';

interface FileAttachmentRowProps {
  file: FileAttachment;
  className?: string;
}

/**
 * Get the appropriate icon for a given MIME type.
 */
function getFileIcon(mimeType: string) {
  if (mimeType === 'application/pdf' || mimeType === 'text/plain') {
    return FileText;
  }
  if (mimeType === 'application/zip') {
    return FileArchive;
  }
  return FileIcon;
}

/**
 * Get a human-readable file type label.
 */
function getFileTypeLabel(mimeType: string): string {
  switch (mimeType) {
    case 'application/pdf':
      return 'PDF';
    case 'text/plain':
      return 'Text';
    case 'application/zip':
      return 'ZIP';
    default:
      return 'File';
  }
}

export function FileAttachmentRow({ file, className }: FileAttachmentRowProps) {
  const Icon = getFileIcon(file.mimeType);
  const typeLabel = getFileTypeLabel(file.mimeType);

  return (
    <div
      className={cn(
        'inline-flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/50',
        className
      )}
    >
      {/* File type icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-gray-200 dark:bg-gray-700">
        <Icon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
      </div>

      {/* Filename + metadata */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
          {file.name}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {typeLabel} &middot; {formatFileSize(file.size)}
        </p>
      </div>

      {/* Download link */}
      <a
        href={file.url}
        download={file.name}
        className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        aria-label={`Download ${file.name}`}
      >
        <Download className="h-4 w-4" />
      </a>
    </div>
  );
}
