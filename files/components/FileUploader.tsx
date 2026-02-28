'use client';

/**
 * files/components/FileUploader.tsx
 *
 * Drag-and-drop file upload component with progress tracking.
 * Validates files client-side before uploading and shows per-file progress bars.
 *
 * Usage:
 *   <FileUploader onUploadComplete={(fileIds) => console.log(fileIds)} />
 */

import { useCallback, useRef, useState } from 'react';
import { Upload, X, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { formatFileSize } from '@/shared/lib/utils';
import { MAX_FILE_SIZE } from '@/shared/lib/constants';
import { ALLOWED_MIME_TYPES, isAllowedMimeType } from '@/files/types';
import type { UploadProgress, FileUploadResult } from '@/files/types';

interface FileUploaderProps {
  onUploadComplete?: (files: FileUploadResult[]) => void;
  className?: string;
  accept?: string;
  multiple?: boolean;
}

export function FileUploader({
  onUploadComplete,
  className,
  accept,
  multiple = true,
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<
    Map<string, UploadProgress & { name: string }>
  >(new Map());
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const completedFilesRef = useRef<FileUploadResult[]>([]);

  const acceptTypes = accept || ALLOWED_MIME_TYPES.join(',');

  // Validate a single file before upload
  const validateFile = useCallback((file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `"${file.name}" is too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`;
    }
    if (!isAllowedMimeType(file.type)) {
      return `"${file.name}" has an unsupported file type (${file.type || 'unknown'}).`;
    }
    return null;
  }, []);

  // Upload a single file via XMLHttpRequest for progress tracking
  const uploadSingleFile = useCallback(
    async (file: File): Promise<FileUploadResult | null> => {
      const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      setUploads((prev) => {
        const next = new Map(prev);
        next.set(fileId, {
          fileId,
          progress: 0,
          status: 'uploading',
          name: file.name,
        });
        return next;
      });

      return new Promise<FileUploadResult | null>((resolve) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append('file', file);

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploads((prev) => {
              const next = new Map(prev);
              const entry = next.get(fileId);
              if (entry) {
                next.set(fileId, { ...entry, progress, status: 'uploading' });
              }
              return next;
            });
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              const result: FileUploadResult = response.data;
              setUploads((prev) => {
                const next = new Map(prev);
                const entry = next.get(fileId);
                if (entry) {
                  next.set(fileId, {
                    ...entry,
                    progress: 100,
                    status: 'complete',
                  });
                }
                return next;
              });
              resolve(result);
            } catch {
              setUploads((prev) => {
                const next = new Map(prev);
                const entry = next.get(fileId);
                if (entry) {
                  next.set(fileId, {
                    ...entry,
                    status: 'error',
                    error: 'Invalid server response',
                  });
                }
                return next;
              });
              resolve(null);
            }
          } else {
            let errorMsg = 'Upload failed';
            try {
              const response = JSON.parse(xhr.responseText);
              errorMsg = response.error || errorMsg;
            } catch {
              // use default error message
            }
            setUploads((prev) => {
              const next = new Map(prev);
              const entry = next.get(fileId);
              if (entry) {
                next.set(fileId, {
                  ...entry,
                  status: 'error',
                  error: errorMsg,
                });
              }
              return next;
            });
            resolve(null);
          }
        });

        xhr.addEventListener('error', () => {
          setUploads((prev) => {
            const next = new Map(prev);
            const entry = next.get(fileId);
            if (entry) {
              next.set(fileId, {
                ...entry,
                status: 'error',
                error: 'Network error',
              });
            }
            return next;
          });
          resolve(null);
        });

        xhr.open('POST', '/api/files');
        xhr.send(formData);
      });
    },
    []
  );

  // Process multiple files
  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      const newErrors: string[] = [];
      const validFiles: File[] = [];

      // Client-side validation
      for (const file of files) {
        const error = validateFile(file);
        if (error) {
          newErrors.push(error);
        } else {
          validFiles.push(file);
        }
      }

      setErrors(newErrors);

      if (validFiles.length === 0) return;

      // Upload all valid files concurrently
      completedFilesRef.current = [];
      const results = await Promise.all(
        validFiles.map((file) => uploadSingleFile(file))
      );

      const successfulResults = results.filter(
        (r): r is FileUploadResult => r !== null
      );

      if (successfulResults.length > 0 && onUploadComplete) {
        onUploadComplete(successfulResults);
      }
    },
    [validateFile, uploadSingleFile, onUploadComplete]
  );

  // Drag event handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if leaving the drop zone (not entering a child)
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
        // Reset input so the same file can be uploaded again
        e.target.value = '';
      }
    },
    [handleFiles]
  );

  const dismissUpload = useCallback((fileId: string) => {
    setUploads((prev) => {
      const next = new Map(prev);
      next.delete(fileId);
      return next;
    });
  }, []);

  const dismissError = useCallback((index: number) => {
    setErrors((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const uploadEntries = Array.from(uploads.values());

  return (
    <div className={cn('space-y-3', className)}>
      {/* Drop zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 transition-colors',
          isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
            : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
        )}
      >
        <Upload
          className={cn(
            'mb-2 h-8 w-8',
            isDragging
              ? 'text-blue-500'
              : 'text-gray-400 dark:text-gray-500'
          )}
        />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Drag files here or click to upload
        </p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          Max {MAX_FILE_SIZE / (1024 * 1024)}MB per file
        </p>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptTypes}
        multiple={multiple}
        onChange={handleInputChange}
        className="hidden"
        aria-label="Upload files"
      />

      {/* Validation errors */}
      {errors.map((error, index) => (
        <div
          key={index}
          className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => dismissError(index)}
            className="shrink-0 text-red-500 hover:text-red-700"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      {/* Upload progress list */}
      {uploadEntries.length > 0 && (
        <div className="space-y-2">
          {uploadEntries.map((upload) => (
            <div
              key={upload.fileId}
              className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700"
            >
              {upload.status === 'complete' ? (
                <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
              ) : upload.status === 'error' ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              ) : (
                <Upload className="h-4 w-4 shrink-0 animate-pulse text-blue-500" />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-700 dark:text-gray-300">
                  {upload.name}
                </p>
                {upload.status === 'uploading' && (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-200"
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                )}
                {upload.status === 'error' && upload.error && (
                  <p className="mt-0.5 text-xs text-red-500">
                    {upload.error}
                  </p>
                )}
              </div>

              {(upload.status === 'complete' || upload.status === 'error') && (
                <button
                  onClick={() => dismissUpload(upload.fileId)}
                  className="shrink-0 text-gray-400 hover:text-gray-600"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
