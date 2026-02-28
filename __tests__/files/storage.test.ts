/**
 * Tests for files/storage.ts
 *
 * Tests the local storage adapter:
 * - File upload saves to correct directory
 * - Thumbnail generation for images
 * - File validation (size limits, MIME types)
 * - File deletion
 * - Unique filename generation
 * - getSignedUrl returns URL as-is for local storage
 */

import path from 'path';

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the module under test
// ---------------------------------------------------------------------------

// Mock crypto.randomUUID to return predictable values
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid-1234'),
}));

// Mock fs/promises
const mockMkdir = jest.fn().mockResolvedValue(undefined);
const mockWriteFile = jest.fn().mockResolvedValue(undefined);
const mockUnlink = jest.fn().mockResolvedValue(undefined);
const mockAccess = jest.fn().mockResolvedValue(undefined);

jest.mock('fs/promises', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
  access: (...args: unknown[]) => mockAccess(...args),
}));

// Mock sharp for thumbnail generation
const mockToBuffer = jest.fn().mockResolvedValue(Buffer.from('thumb-data'));
const mockResize = jest.fn().mockReturnValue({ toBuffer: mockToBuffer });
const mockSharp = jest.fn().mockReturnValue({ resize: mockResize });

jest.mock('sharp', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockSharp(...args),
}));

// Mock constants
jest.mock('../../shared/lib/constants', () => ({
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
}));

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import { FileValidationError } from '../../files/storage';

// We need to test LocalStorage directly. Since it's not exported,
// we use the `storage` singleton (which defaults to LocalStorage in non-prod)
let storage: import('../../files/storage').StorageAdapter;

beforeAll(async () => {
  // Ensure NODE_ENV is not production so we get LocalStorage
  delete process.env.AWS_S3_BUCKET;
  // Re-import to get a fresh instance
  const mod = await import('../../files/storage');
  storage = mod.storage;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LocalStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('upload', () => {
    it('saves file to the upload directory', async () => {
      const buffer = Buffer.from('file-content');
      const result = await storage.upload(buffer, 'document.pdf', 'application/pdf');

      // Should create directories
      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('uploads'),
        { recursive: true }
      );

      // Should write the file
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('test-uuid-1234-document.pdf'),
        buffer
      );

      // Should return correct URL
      expect(result.url).toBe('/uploads/test-uuid-1234-document.pdf');
      expect(result.thumbnailUrl).toBeUndefined();
    });

    it('generates thumbnail for image uploads', async () => {
      const buffer = Buffer.from('image-data');
      const result = await storage.upload(buffer, 'photo.jpg', 'image/jpeg');

      // Should call sharp to generate thumbnail
      expect(mockSharp).toHaveBeenCalledWith(buffer);
      expect(mockResize).toHaveBeenCalledWith(200, 200, {
        fit: 'cover',
        position: 'centre',
      });

      // Should write both original and thumbnail
      expect(mockWriteFile).toHaveBeenCalledTimes(2);

      // Should return thumbnail URL
      expect(result.thumbnailUrl).toBe('/uploads/thumbs/test-uuid-1234-photo.jpg');
    });

    it('generates thumbnail for PNG images', async () => {
      const buffer = Buffer.from('png-data');
      const result = await storage.upload(buffer, 'image.png', 'image/png');

      expect(mockSharp).toHaveBeenCalledWith(buffer);
      expect(result.thumbnailUrl).toBe('/uploads/thumbs/test-uuid-1234-image.png');
    });

    it('generates thumbnail for GIF images', async () => {
      const buffer = Buffer.from('gif-data');
      const result = await storage.upload(buffer, 'animation.gif', 'image/gif');

      expect(mockSharp).toHaveBeenCalledWith(buffer);
      expect(result.thumbnailUrl).toBeDefined();
    });

    it('generates thumbnail for WebP images', async () => {
      const buffer = Buffer.from('webp-data');
      const result = await storage.upload(buffer, 'image.webp', 'image/webp');

      expect(mockSharp).toHaveBeenCalledWith(buffer);
      expect(result.thumbnailUrl).toBeDefined();
    });

    it('does not generate thumbnail for non-image files', async () => {
      const buffer = Buffer.from('pdf-data');
      await storage.upload(buffer, 'doc.pdf', 'application/pdf');

      expect(mockSharp).not.toHaveBeenCalled();
    });

    it('continues without thumbnail if sharp fails', async () => {
      mockSharp.mockImplementationOnce(() => {
        throw new Error('sharp not available');
      });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const buffer = Buffer.from('image-data');
      const result = await storage.upload(buffer, 'photo.jpg', 'image/jpeg');

      // Should still return the main file URL
      expect(result.url).toBe('/uploads/test-uuid-1234-photo.jpg');
      expect(result.thumbnailUrl).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Thumbnail generation failed:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('returns correct URL format', async () => {
      const buffer = Buffer.from('data');
      const result = await storage.upload(buffer, 'test.txt', 'text/plain');

      expect(result.url).toMatch(/^\/uploads\/test-uuid-1234-test\.txt$/);
    });

    it('sanitizes special characters in filename', async () => {
      const buffer = Buffer.from('data');
      const result = await storage.upload(
        buffer,
        'my file (1) [copy].txt',
        'text/plain'
      );

      // Special chars should be replaced with underscores
      expect(result.url).toContain('test-uuid-1234-my_file__1___copy_.txt');
    });

    it('ensures upload directories are created', async () => {
      const buffer = Buffer.from('data');
      await storage.upload(buffer, 'test.txt', 'text/plain');

      // Should create both uploads and thumbs directories
      expect(mockMkdir).toHaveBeenCalledTimes(2);
      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('uploads'),
        { recursive: true }
      );
    });
  });

  describe('upload validation - file size', () => {
    it('rejects files larger than 10MB', async () => {
      const largeBuffer = Buffer.alloc(10 * 1024 * 1024 + 1); // 10MB + 1 byte

      await expect(
        storage.upload(largeBuffer, 'large.pdf', 'application/pdf')
      ).rejects.toThrow(FileValidationError);

      await expect(
        storage.upload(largeBuffer, 'large.pdf', 'application/pdf')
      ).rejects.toThrow('File too large');
    });

    it('accepts files exactly at 10MB', async () => {
      const buffer = Buffer.alloc(10 * 1024 * 1024); // exactly 10MB

      await expect(
        storage.upload(buffer, 'exact.pdf', 'application/pdf')
      ).resolves.toBeDefined();
    });

    it('accepts small files', async () => {
      const buffer = Buffer.from('small');

      await expect(
        storage.upload(buffer, 'small.txt', 'text/plain')
      ).resolves.toBeDefined();
    });
  });

  describe('upload validation - MIME types', () => {
    it('rejects disallowed MIME types', async () => {
      const buffer = Buffer.from('data');

      await expect(
        storage.upload(buffer, 'script.js', 'application/javascript')
      ).rejects.toThrow(FileValidationError);

      await expect(
        storage.upload(buffer, 'page.html', 'text/html')
      ).rejects.toThrow(FileValidationError);

      await expect(
        storage.upload(buffer, 'binary.exe', 'application/octet-stream')
      ).rejects.toThrow(FileValidationError);
    });

    it('rejects disallowed MIME type with descriptive message', async () => {
      const buffer = Buffer.from('data');

      await expect(
        storage.upload(buffer, 'script.js', 'application/javascript')
      ).rejects.toThrow('not allowed');
    });

    it('accepts image/jpeg', async () => {
      const buffer = Buffer.from('data');
      await expect(
        storage.upload(buffer, 'photo.jpg', 'image/jpeg')
      ).resolves.toBeDefined();
    });

    it('accepts image/png', async () => {
      const buffer = Buffer.from('data');
      await expect(
        storage.upload(buffer, 'img.png', 'image/png')
      ).resolves.toBeDefined();
    });

    it('accepts image/gif', async () => {
      const buffer = Buffer.from('data');
      await expect(
        storage.upload(buffer, 'ani.gif', 'image/gif')
      ).resolves.toBeDefined();
    });

    it('accepts image/webp', async () => {
      const buffer = Buffer.from('data');
      await expect(
        storage.upload(buffer, 'img.webp', 'image/webp')
      ).resolves.toBeDefined();
    });

    it('accepts application/pdf', async () => {
      const buffer = Buffer.from('data');
      await expect(
        storage.upload(buffer, 'doc.pdf', 'application/pdf')
      ).resolves.toBeDefined();
    });

    it('accepts text/plain', async () => {
      const buffer = Buffer.from('data');
      await expect(
        storage.upload(buffer, 'readme.txt', 'text/plain')
      ).resolves.toBeDefined();
    });

    it('accepts application/zip', async () => {
      const buffer = Buffer.from('data');
      await expect(
        storage.upload(buffer, 'archive.zip', 'application/zip')
      ).resolves.toBeDefined();
    });
  });

  describe('delete', () => {
    it('deletes the main file and thumbnail', async () => {
      await storage.delete('/uploads/test-uuid-1234-photo.jpg');

      // Should check and delete main file
      expect(mockAccess).toHaveBeenCalledWith(
        expect.stringContaining('test-uuid-1234-photo.jpg')
      );
      expect(mockUnlink).toHaveBeenCalledWith(
        expect.stringContaining('test-uuid-1234-photo.jpg')
      );

      // Should also try to delete thumbnail
      expect(mockAccess).toHaveBeenCalledTimes(2);
      expect(mockUnlink).toHaveBeenCalledTimes(2);
    });

    it('handles non-existent file gracefully', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      await expect(
        storage.delete('/uploads/nonexistent.pdf')
      ).resolves.toBeUndefined();
    });

    it('handles non-existent thumbnail gracefully', async () => {
      // Main file exists, thumbnail doesn't
      mockAccess
        .mockResolvedValueOnce(undefined) // main file exists
        .mockRejectedValueOnce(new Error('ENOENT')); // thumbnail doesn't

      await expect(
        storage.delete('/uploads/test-uuid-1234-photo.jpg')
      ).resolves.toBeUndefined();

      // Main file should still be deleted
      expect(mockUnlink).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSignedUrl', () => {
    it('returns the URL as-is for local storage', async () => {
      const url = '/uploads/test-uuid-1234-photo.jpg';
      const result = await storage.getSignedUrl(url);

      expect(result).toBe(url);
    });
  });
});

describe('FileValidationError', () => {
  it('is an instance of Error', () => {
    const error = new FileValidationError('test');
    expect(error).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    const error = new FileValidationError('test message');
    expect(error.name).toBe('FileValidationError');
  });

  it('preserves the error message', () => {
    const error = new FileValidationError('File too large');
    expect(error.message).toBe('File too large');
  });
});
