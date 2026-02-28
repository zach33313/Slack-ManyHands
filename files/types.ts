/**
 * files/types.ts
 *
 * Types and constants for the file upload and storage domain.
 */

// ---------------------------------------------------------------------------
// Upload result — returned by the upload API endpoint
// ---------------------------------------------------------------------------

export interface FileUploadResult {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
}

// ---------------------------------------------------------------------------
// Upload progress — tracked client-side during file uploads
// ---------------------------------------------------------------------------

export type UploadStatus = 'uploading' | 'complete' | 'error';

export interface UploadProgress {
  fileId: string;
  progress: number;
  status: UploadStatus;
  error?: string;
}

// ---------------------------------------------------------------------------
// Allowed MIME types for upload
// ---------------------------------------------------------------------------

/** Image MIME types that can be uploaded and displayed inline */
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

/** Document MIME types */
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'text/plain',
] as const;

/** Archive MIME types */
export const ALLOWED_ARCHIVE_MIME_TYPES = [
  'application/zip',
] as const;

/** All allowed MIME types for upload */
export const ALLOWED_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_DOCUMENT_MIME_TYPES,
  ...ALLOWED_ARCHIVE_MIME_TYPES,
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/**
 * Check if a MIME type is in the allowed list.
 */
export function isAllowedMimeType(mimeType: string): mimeType is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Check if a MIME type is an image type that supports thumbnails.
 */
export function isImageMimeType(mimeType: string): boolean {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}
