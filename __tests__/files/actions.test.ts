/**
 * Tests for files/actions.ts
 *
 * Tests the server actions for file upload and deletion:
 * - uploadFile creates FileAttachment record in DB
 * - uploadFile validates auth, file presence, size, MIME type
 * - deleteFile removes file from storage and DB
 * - deleteFile validates ownership before deletion
 * - deleteFile rejects non-existent files
 */

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the module under test
// ---------------------------------------------------------------------------

// Mock auth
const mockAuth = jest.fn();
jest.mock('../../auth/auth', () => ({
  auth: () => mockAuth(),
}));

// Mock prisma
const mockCreate = jest.fn();
const mockFindUnique = jest.fn();
const mockDelete = jest.fn();

jest.mock('../../shared/lib/prisma', () => ({
  prisma: {
    fileAttachment: {
      create: (...args: unknown[]) => mockCreate(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
}));

// Mock storage
const mockUpload = jest.fn();
const mockStorageDelete = jest.fn();

jest.mock('../../files/storage', () => ({
  storage: {
    upload: (...args: unknown[]) => mockUpload(...args),
    delete: (...args: unknown[]) => mockStorageDelete(...args),
  },
  FileValidationError: class FileValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'FileValidationError';
    }
  },
}));

// Mock sharp for image dimensions
const mockMetadata = jest.fn().mockResolvedValue({ width: 800, height: 600 });
jest.mock('sharp', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue({ metadata: () => mockMetadata() }),
}));

// Mock constants
jest.mock('../../shared/lib/constants', () => ({
  MAX_FILE_SIZE: 10 * 1024 * 1024,
}));

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

// We need to import the functions. Since they use 'use server', we import directly.
import { uploadFile, deleteFile } from '../../files/actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockFormData(overrides?: {
  name?: string;
  type?: string;
  size?: number;
  content?: string;
}): FormData {
  const {
    name = 'test.pdf',
    type = 'application/pdf',
    size = 1024,
    content = 'file-content',
  } = overrides ?? {};

  const blob = new Blob([content], { type });
  const file = new File([blob], name, { type });

  // Override size since Blob/File size is based on content
  Object.defineProperty(file, 'size', { value: size });

  const formData = new FormData();
  formData.append('file', file);
  return formData;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('uploadFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
    });
    mockUpload.mockResolvedValue({
      url: '/uploads/test-uuid-1234-test.pdf',
      thumbnailUrl: undefined,
    });
    mockCreate.mockResolvedValue({
      id: 'file-1',
      userId: 'user-1',
      name: 'test.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      url: '/uploads/test-uuid-1234-test.pdf',
      width: null,
      height: null,
      createdAt: new Date(),
    });
  });

  it('creates a FileAttachment record in the database', async () => {
    const formData = createMockFormData();
    const result = await uploadFile(formData);

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        name: 'test.pdf',
        mimeType: 'application/pdf',
        url: '/uploads/test-uuid-1234-test.pdf',
      }),
    });

    expect(result).toEqual({
      id: 'file-1',
      filename: 'test.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      url: '/uploads/test-uuid-1234-test.pdf',
      thumbnailUrl: undefined,
    });
  });

  it('uploads file to storage before creating DB record', async () => {
    const formData = createMockFormData();
    await uploadFile(formData);

    // Storage upload should be called
    expect(mockUpload).toHaveBeenCalledWith(
      expect.any(Buffer),
      'test.pdf',
      'application/pdf'
    );

    // DB record should be created after storage upload
    expect(mockCreate).toHaveBeenCalled();
  });

  it('returns thumbnailUrl for image uploads', async () => {
    mockUpload.mockResolvedValue({
      url: '/uploads/test-uuid-1234-photo.jpg',
      thumbnailUrl: '/uploads/thumbs/test-uuid-1234-photo.jpg',
    });
    mockCreate.mockResolvedValue({
      id: 'file-2',
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: 5000,
      url: '/uploads/test-uuid-1234-photo.jpg',
    });

    const formData = createMockFormData({
      name: 'photo.jpg',
      type: 'image/jpeg',
      size: 5000,
    });
    const result = await uploadFile(formData);

    expect(result.thumbnailUrl).toBe('/uploads/thumbs/test-uuid-1234-photo.jpg');
  });

  it('extracts image dimensions using sharp for image uploads', async () => {
    mockUpload.mockResolvedValue({
      url: '/uploads/test-uuid-1234-photo.jpg',
      thumbnailUrl: '/uploads/thumbs/test-uuid-1234-photo.jpg',
    });
    mockCreate.mockResolvedValue({
      id: 'file-2',
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: 5000,
      url: '/uploads/test-uuid-1234-photo.jpg',
    });

    const formData = createMockFormData({
      name: 'photo.jpg',
      type: 'image/jpeg',
      size: 5000,
    });
    await uploadFile(formData);

    // Should store dimensions in DB
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        width: 800,
        height: 600,
      }),
    });
  });

  it('throws when user is not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const formData = createMockFormData();
    await expect(uploadFile(formData)).rejects.toThrow('Unauthorized');
  });

  it('throws when session has no user', async () => {
    mockAuth.mockResolvedValue({ user: null });

    const formData = createMockFormData();
    await expect(uploadFile(formData)).rejects.toThrow('Unauthorized');
  });

  it('throws when no file is provided in FormData', async () => {
    const formData = new FormData();

    await expect(uploadFile(formData)).rejects.toThrow('No file provided');
  });

  it('throws when file field is a string instead of File', async () => {
    const formData = new FormData();
    formData.append('file', 'not-a-file');

    await expect(uploadFile(formData)).rejects.toThrow('No file provided');
  });

  it('rejects files exceeding MAX_FILE_SIZE', async () => {
    const formData = createMockFormData({
      size: 10 * 1024 * 1024 + 1, // 10MB + 1 byte
    });

    await expect(uploadFile(formData)).rejects.toThrow('File too large');
  });

  it('rejects disallowed MIME types', async () => {
    const formData = createMockFormData({
      name: 'script.js',
      type: 'application/javascript',
    });

    await expect(uploadFile(formData)).rejects.toThrow('not allowed');
  });
});

describe('deleteFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
    });
  });

  it('removes file from storage and database', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'file-1',
      userId: 'user-1',
      url: '/uploads/test-uuid-1234-doc.pdf',
    });
    mockStorageDelete.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue({ id: 'file-1' });

    await deleteFile('file-1');

    // Should delete from storage
    expect(mockStorageDelete).toHaveBeenCalledWith('/uploads/test-uuid-1234-doc.pdf');

    // Should delete DB record
    expect(mockDelete).toHaveBeenCalledWith({
      where: { id: 'file-1' },
    });
  });

  it('validates ownership before deletion', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'file-1',
      userId: 'other-user',
      url: '/uploads/test-uuid-1234-doc.pdf',
    });

    await expect(deleteFile('file-1')).rejects.toThrow(
      'Forbidden: you do not own this file'
    );

    // Should NOT delete from storage or DB
    expect(mockStorageDelete).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('throws when file is not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(deleteFile('nonexistent-file')).rejects.toThrow('File not found');

    expect(mockStorageDelete).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('throws when user is not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(deleteFile('file-1')).rejects.toThrow('Unauthorized');

    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockStorageDelete).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('throws when session has no user id', async () => {
    mockAuth.mockResolvedValue({ user: { id: undefined } });

    await expect(deleteFile('file-1')).rejects.toThrow('Unauthorized');
  });

  it('deletes storage before DB record', async () => {
    const callOrder: string[] = [];

    mockFindUnique.mockResolvedValue({
      id: 'file-1',
      userId: 'user-1',
      url: '/uploads/test-uuid-1234-doc.pdf',
    });
    mockStorageDelete.mockImplementation(async () => {
      callOrder.push('storage');
    });
    mockDelete.mockImplementation(async () => {
      callOrder.push('db');
      return { id: 'file-1' };
    });

    await deleteFile('file-1');

    expect(callOrder).toEqual(['storage', 'db']);
  });
});
