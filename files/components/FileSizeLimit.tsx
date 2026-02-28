'use client';

/**
 * files/components/FileSizeLimit.tsx
 *
 * Error display component shown when a file exceeds the upload size limit.
 *
 * Usage:
 *   <FileSizeLimit />
 *   <FileSizeLimit maxSizeMB={10} />
 */

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { MAX_FILE_SIZE } from '@/shared/lib/constants';

interface FileSizeLimitProps {
  maxSizeMB?: number;
  className?: string;
}

export function FileSizeLimit({ maxSizeMB, className }: FileSizeLimitProps) {
  const limitMB = maxSizeMB ?? MAX_FILE_SIZE / (1024 * 1024);

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400',
        className
      )}
      role="alert"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>File too large. Maximum size is {limitMB}MB.</span>
    </div>
  );
}
