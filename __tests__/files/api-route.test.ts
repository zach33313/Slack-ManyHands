/**
 * Tests for app/api/files/route.ts
 *
 * Tests the POST /api/files endpoint:
 * - Accepts multipart/form-data with file
 * - Returns FileUploadResult wrapped in ApiSuccess envelope
 * - Returns 400 for missing file
 * - Returns 400 for invalid content-type
 * - Returns 413 for oversized files (FileValidationError)
 * - Returns 401 for unauthenticated requests
 * - Returns 500 for unexpected errors
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock uploadFile server action
const mockUploadFile = jest.fn();
jest.mock('../../files/actions', () => ({
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
}));

// Create a real FileValidationError class for the mock
class MockFileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileValidationError';
  }
}

jest.mock('../../files/storage', () => ({
  FileValidationError: MockFileValidationError,
}));

// Mock shared/types/api
jest.mock('../../shared/types/api', () => ({
  ok: <T>(data: T) => ({ ok: true, data }),
  err: (code: string, message: string) => ({ ok: false, code, error: message }),
}));

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

import { POST } from '../../app/api/files/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRequest(options: {
  contentType?: string;
  file?: File | null;
  hasFile?: boolean;
}): any {
  const {
    contentType = 'multipart/form-data; boundary=----',
    file,
    hasFile = true,
  } = options;

  const formData = new FormData();
  if (hasFile && file) {
    formData.append('file', file);
  }

  return {
    headers: {
      get: (name: string) => {
        if (name === 'content-type') return contentType;
        return null;
      },
    },
    formData: jest.fn().mockResolvedValue(formData),
  } as any;
}

function createTestFile(
  name = 'test.pdf',
  type = 'application/pdf',
  content = 'file-content'
): File {
  const blob = new Blob([content], { type });
  return new File([blob], name, { type });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/files', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 201 with FileUploadResult on success', async () => {
    const uploadResult = {
      id: 'file-1',
      filename: 'test.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      url: '/uploads/test-uuid-test.pdf',
    };
    mockUploadFile.mockResolvedValue(uploadResult);

    const file = createTestFile();
    const request = createMockRequest({ file });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      ok: true,
      data: uploadResult,
    });
  });

  it('passes formData to uploadFile action', async () => {
    mockUploadFile.mockResolvedValue({
      id: 'file-1',
      filename: 'test.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      url: '/uploads/test.pdf',
    });

    const file = createTestFile();
    const request = createMockRequest({ file });
    await POST(request);

    expect(mockUploadFile).toHaveBeenCalledWith(expect.any(FormData));
  });

  it('returns 400 for non-multipart content type', async () => {
    const request = createMockRequest({
      contentType: 'application/json',
      hasFile: false,
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('INVALID_CONTENT_TYPE');
  });

  it('returns 400 when no file is provided', async () => {
    const request = createMockRequest({
      hasFile: false,
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('MISSING_FILE');
  });

  it('returns 413 for oversized files (FileValidationError)', async () => {
    mockUploadFile.mockRejectedValue(
      new MockFileValidationError('File too large. Maximum size is 10MB.')
    );

    const file = createTestFile();
    const request = createMockRequest({ file });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('File too large');
  });

  it('returns 413 for invalid MIME types (FileValidationError)', async () => {
    mockUploadFile.mockRejectedValue(
      new MockFileValidationError('File type "text/html" is not allowed.')
    );

    const file = createTestFile('page.html', 'text/html');
    const request = createMockRequest({ file });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('not allowed');
  });

  it('returns 401 for unauthenticated requests', async () => {
    mockUploadFile.mockRejectedValue(new Error('Unauthorized'));

    const file = createTestFile();
    const request = createMockRequest({ file });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 500 for unexpected errors', async () => {
    mockUploadFile.mockRejectedValue(new Error('Database connection failed'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const file = createTestFile();
    const request = createMockRequest({ file });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('INTERNAL_ERROR');

    consoleSpy.mockRestore();
  });

  it('returns 500 for non-Error thrown values', async () => {
    mockUploadFile.mockRejectedValue('some string error');
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const file = createTestFile();
    const request = createMockRequest({ file });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.error).toBe('An unexpected error occurred');

    consoleSpy.mockRestore();
  });
});
