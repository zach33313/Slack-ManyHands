/**
 * files/storage.ts
 *
 * Storage adapter for file uploads. Abstracts the underlying storage mechanism
 * so we can switch between local filesystem (dev) and S3 (production).
 *
 * Usage:
 *   import { storage } from '@/files/storage'
 *   const result = await storage.upload(buffer, 'photo.jpg', 'image/jpeg')
 */

import { randomUUID } from 'crypto';
import { mkdir, writeFile, unlink, access } from 'fs/promises';
import path from 'path';
import { MAX_FILE_SIZE } from '@/shared/lib/constants';
import { isAllowedMimeType, isImageMimeType } from './types';

// ---------------------------------------------------------------------------
// Storage interface
// ---------------------------------------------------------------------------

export interface StorageUploadResult {
  url: string;
  thumbnailUrl?: string;
}

export interface StorageAdapter {
  upload(
    file: Buffer,
    filename: string,
    mimeType: string
  ): Promise<StorageUploadResult>;
  delete(url: string): Promise<void>;
  getSignedUrl(url: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// File validation
// ---------------------------------------------------------------------------

export class FileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileValidationError';
  }
}

function validateFile(file: Buffer, filename: string, mimeType: string): void {
  if (file.length > MAX_FILE_SIZE) {
    throw new FileValidationError(
      `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`
    );
  }
  if (!isAllowedMimeType(mimeType)) {
    throw new FileValidationError(
      `File type "${mimeType}" is not allowed. Allowed types: images (jpg, png, gif, webp), documents (pdf, txt), archives (zip).`
    );
  }
}

/**
 * Generate a UUID-prefixed filename to avoid collisions.
 * e.g. "photo.jpg" → "a1b2c3d4-photo.jpg"
 */
function uniqueFilename(originalName: string): string {
  const uuid = randomUUID();
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${uuid}-${safeName}`;
}

// ---------------------------------------------------------------------------
// Local filesystem storage (development)
// ---------------------------------------------------------------------------

class LocalStorage implements StorageAdapter {
  private uploadDir: string;
  private thumbDir: string;

  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || './public/uploads';
    this.thumbDir = path.join(this.uploadDir, 'thumbs');
  }

  /**
   * Ensure upload directories exist, creating them if necessary.
   */
  private async ensureDirs(): Promise<void> {
    await mkdir(this.uploadDir, { recursive: true });
    await mkdir(this.thumbDir, { recursive: true });
  }

  async upload(
    file: Buffer,
    filename: string,
    mimeType: string
  ): Promise<StorageUploadResult> {
    validateFile(file, filename, mimeType);
    await this.ensureDirs();

    const storedName = uniqueFilename(filename);
    const filePath = path.join(this.uploadDir, storedName);

    await writeFile(filePath, file);

    const result: StorageUploadResult = {
      url: `/uploads/${storedName}`,
    };

    // Generate thumbnail for images
    if (isImageMimeType(mimeType)) {
      try {
        const sharp = (await import('sharp')).default;
        const thumbBuffer = await sharp(file)
          .resize(200, 200, { fit: 'cover', position: 'centre' })
          .toBuffer();

        const thumbPath = path.join(this.thumbDir, storedName);
        await writeFile(thumbPath, thumbBuffer);
        result.thumbnailUrl = `/uploads/thumbs/${storedName}`;
      } catch (err) {
        // Thumbnail generation is non-critical; log and continue
        console.error('Thumbnail generation failed:', err);
      }
    }

    return result;
  }

  async delete(url: string): Promise<void> {
    // Extract filename from URL like /uploads/uuid-filename.ext
    const filename = path.basename(url);
    const filePath = path.join(this.uploadDir, filename);
    const thumbPath = path.join(this.thumbDir, filename);

    // Delete main file
    try {
      await access(filePath);
      await unlink(filePath);
    } catch {
      // File doesn't exist — already deleted or never existed
    }

    // Delete thumbnail if it exists
    try {
      await access(thumbPath);
      await unlink(thumbPath);
    } catch {
      // No thumbnail to delete
    }
  }

  async getSignedUrl(url: string): Promise<string> {
    // Local files are served statically via Next.js public directory.
    // No signing needed — just return the URL as-is.
    return url;
  }
}

// ---------------------------------------------------------------------------
// S3 storage (production)
// ---------------------------------------------------------------------------

class S3Storage implements StorageAdapter {
  private bucket: string;
  private region: string;

  constructor() {
    this.bucket = process.env.AWS_S3_BUCKET || '';
    this.region = process.env.AWS_REGION || 'us-east-1';
  }

  async upload(
    file: Buffer,
    filename: string,
    mimeType: string
  ): Promise<StorageUploadResult> {
    validateFile(file, filename, mimeType);

    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

    const client = new S3Client({ region: this.region });
    const storedName = uniqueFilename(filename);
    const key = `uploads/${storedName}`;

    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file,
        ContentType: mimeType,
      })
    );

    const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    const result: StorageUploadResult = { url };

    // Generate and upload thumbnail for images
    if (isImageMimeType(mimeType)) {
      try {
        const sharp = (await import('sharp')).default;
        const thumbBuffer = await sharp(file)
          .resize(200, 200, { fit: 'cover', position: 'centre' })
          .toBuffer();

        const thumbKey = `uploads/thumbs/${storedName}`;
        await client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: thumbKey,
            Body: thumbBuffer,
            ContentType: mimeType,
          })
        );

        result.thumbnailUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${thumbKey}`;
      } catch (err) {
        console.error('S3 thumbnail generation failed:', err);
      }
    }

    return result;
  }

  async delete(url: string): Promise<void> {
    const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({ region: this.region });

    // Extract key from S3 URL
    const urlObj = new URL(url);
    const key = urlObj.pathname.slice(1); // remove leading "/"

    await client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );

    // Also try to delete thumbnail
    const thumbKey = key.replace('uploads/', 'uploads/thumbs/');
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: thumbKey,
        })
      );
    } catch {
      // Thumbnail might not exist
    }
  }

  async getSignedUrl(url: string): Promise<string> {
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl: s3GetSignedUrl } = await import(
      '@aws-sdk/s3-request-presigner'
    );

    const client = new S3Client({ region: this.region });
    const urlObj = new URL(url);
    const key = urlObj.pathname.slice(1);

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return s3GetSignedUrl(client, command, { expiresIn: 3600 });
  }
}

// ---------------------------------------------------------------------------
// Export singleton based on environment
// ---------------------------------------------------------------------------

function createStorage(): StorageAdapter {
  if (process.env.NODE_ENV === 'production' && process.env.AWS_S3_BUCKET) {
    return new S3Storage();
  }
  return new LocalStorage();
}

export const storage: StorageAdapter = createStorage();
