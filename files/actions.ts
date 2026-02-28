'use server';

/**
 * files/actions.ts
 *
 * Server Actions for file upload and deletion.
 * These are called from the API route handler and potentially from client components.
 *
 * Usage:
 *   import { uploadFile, deleteFile } from '@/files/actions'
 */

import { auth } from '@/auth/auth';
import { prisma } from '@/shared/lib/prisma';
import { MAX_FILE_SIZE } from '@/shared/lib/constants';
import { storage, FileValidationError } from './storage';
import { isAllowedMimeType, isImageMimeType } from './types';
import type { FileUploadResult } from './types';

// ---------------------------------------------------------------------------
// uploadFile — handles file upload from FormData
// ---------------------------------------------------------------------------

export async function uploadFile(
  formData: FormData
): Promise<FileUploadResult> {
  // Authenticate
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const userId = session.user.id;

  // Extract file from FormData
  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    throw new Error('No file provided');
  }

  // Client-side validation (belt and suspenders — storage also validates)
  if (file.size > MAX_FILE_SIZE) {
    throw new FileValidationError(
      `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`
    );
  }

  if (!isAllowedMimeType(file.type)) {
    throw new FileValidationError(
      `File type "${file.type}" is not allowed.`
    );
  }

  // Convert File to Buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Upload to storage
  const { url, thumbnailUrl } = await storage.upload(
    buffer,
    file.name,
    file.type
  );

  // Determine image dimensions if applicable
  let width: number | null = null;
  let height: number | null = null;

  if (isImageMimeType(file.type)) {
    try {
      const sharp = (await import('sharp')).default;
      const metadata = await sharp(buffer).metadata();
      width = metadata.width ?? null;
      height = metadata.height ?? null;
    } catch {
      // Non-critical — dimensions are optional
    }
  }

  // Create DB record
  const record = await prisma.fileAttachment.create({
    data: {
      userId,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      url,
      width,
      height,
    },
  });

  return {
    id: record.id,
    filename: record.name,
    mimeType: record.mimeType,
    size: record.size,
    url: record.url,
    thumbnailUrl: thumbnailUrl ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// deleteFile — removes a file by ID (ownership check)
// ---------------------------------------------------------------------------

export async function deleteFile(fileId: string): Promise<void> {
  // Authenticate
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const userId = session.user.id;

  // Find the file record
  const record = await prisma.fileAttachment.findUnique({
    where: { id: fileId },
  });

  if (!record) {
    throw new Error('File not found');
  }

  // Ownership check
  if (record.userId !== userId) {
    throw new Error('Forbidden: you do not own this file');
  }

  // Delete from storage
  await storage.delete(record.url);

  // Delete DB record
  await prisma.fileAttachment.delete({
    where: { id: fileId },
  });
}
