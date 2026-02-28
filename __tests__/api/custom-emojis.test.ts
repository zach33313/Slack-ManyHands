/**
 * __tests__/api/custom-emojis.test.ts
 *
 * Tests for GET and POST /api/custom-emojis route handler.
 *
 * Tests are written against the route handler directly (no HTTP server).
 * Mocks: auth, prisma, getMemberRole, sharp (image processing), fs/promises.
 *
 * Test cases:
 *  1.  POST valid image + name → 201 with emoji data
 *  2.  POST duplicate name in same workspace → 409
 *  3.  POST invalid name (special chars) → 400
 *  4.  POST oversized image (>256KB) → 413
 *  5.  POST without auth → 401
 *  6.  GET returns all workspace emojis as array
 *  7.  GET with no emojis → empty array
 *  8.  Image is resized to 128×128 with contain + transparent bg on upload
 *  9.  POST missing image field → 400
 *  10. POST non-image MIME type → 400
 *  11. GET without workspaceId query param → 400
 *  12. GET when user is not a workspace member → 403
 *  13. GET without auth → 401
 *  14. POST when user is not a workspace member → 403
 *  15. POST with non-multipart content-type → 400
 */

// ---------------------------------------------------------------------------
// Auth mock — must appear before any import that transitively loads auth
// ---------------------------------------------------------------------------

const mockAuthFn = jest.fn();
jest.mock('@/auth/auth', () => ({ auth: mockAuthFn }));

// ---------------------------------------------------------------------------
// Workspace queries mock
// ---------------------------------------------------------------------------

const mockGetMemberRole = jest.fn();
jest.mock('@/workspaces/queries', () => ({ getMemberRole: mockGetMemberRole }));

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------

const mockCustomEmojiCreate = jest.fn();
const mockCustomEmojiFindMany = jest.fn();

jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    customEmoji: {
      create: mockCustomEmojiCreate,
      findMany: mockCustomEmojiFindMany,
    },
  },
}));

// ---------------------------------------------------------------------------
// fs/promises mock — prevent any real filesystem writes
// ---------------------------------------------------------------------------

const mockMkdir = jest.fn();
const mockWriteFile = jest.fn();

jest.mock('fs/promises', () => ({
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
}));

// ---------------------------------------------------------------------------
// sharp mock — simulate the chained image-processing API
//   sharp(buffer).resize(w, h, opts).png(opts).toBuffer()
// ---------------------------------------------------------------------------

const mockSharpToBuffer = jest.fn();
const mockSharpPng = jest.fn();
const mockSharpResize = jest.fn();
const mockSharpFn = jest.fn();

jest.mock('sharp', () => ({
  __esModule: true,
  default: mockSharpFn,
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server';
import { GET, POST } from '../../app/api/custom-emojis/route';

// ---------------------------------------------------------------------------
// Constants mirroring the route's internal values
// ---------------------------------------------------------------------------

const MAX_EMOJI_SIZE_BYTES = 256 * 1024; // 256 KB
const EMOJI_OUTPUT_PX = 128;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default session fixture */
const DEFAULT_SESSION = { user: { id: 'user-1', name: 'Alice', email: 'alice@example.com' } };

/** A processed image buffer returned by the mocked sharp chain */
const PROCESSED_IMAGE_BUFFER = Buffer.from('fake-processed-png-data');

/** Build a GET request, optionally with workspaceId */
function makeGetRequest(workspaceId?: string): NextRequest {
  const url = new URL('http://localhost/api/custom-emojis');
  if (workspaceId !== undefined) url.searchParams.set('workspaceId', workspaceId);
  return new NextRequest(url.toString(), { method: 'GET' });
}

/** Build a POST NextRequest with mocked formData() to avoid real multipart parsing */
function makePostRequest(options: {
  name?: string | null;
  workspaceId?: string | null;
  image?: File | 'omit';
  contentType?: string;
}): NextRequest {
  const {
    name = 'thumbsup',
    workspaceId = 'ws-1',
    image,
    contentType = 'multipart/form-data; boundary=----boundary',
  } = options;

  const req = new NextRequest('http://localhost/api/custom-emojis', {
    method: 'POST',
    headers: { 'content-type': contentType },
  });

  // Mock formData() to avoid real multipart body parsing in tests
  const formData = new FormData();
  if (name !== null) formData.append('name', name);
  if (workspaceId !== null) formData.append('workspaceId', workspaceId);
  if (image !== 'omit' && image !== undefined) formData.append('image', image);

  (req as any).formData = jest.fn().mockResolvedValue(formData);

  return req;
}

/** Create a valid test PNG File of the given size (in bytes). */
function makeImageFile(sizeBytes = 1024, type = 'image/png', filename = 'test.png'): File {
  const data = Buffer.alloc(sizeBytes, 0xff);
  return new File([data], filename, { type });
}

/** Build a CustomEmoji DB record for mocking prisma.customEmoji.create */
function makeDbEmoji(overrides: Record<string, unknown> = {}) {
  return {
    id: 'emoji-1',
    name: 'thumbsup',
    imageUrl: '/uploads/emojis/ws-1/thumbsup.png',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    createdBy: { id: 'user-1', name: 'Alice', image: null },
    ...overrides,
  };
}

/** Build a Prisma P2002 unique-constraint error (duplicate name). */
function makeP2002Error(field = 'name'): Error {
  const err = new Error(`Unique constraint failed on the fields: (\`${field}\`)`);
  (err as any).code = 'P2002';
  return err;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();

  // Default: authenticated as user-1
  mockAuthFn.mockResolvedValue(DEFAULT_SESSION);

  // Default: user-1 is a member of any workspace
  mockGetMemberRole.mockResolvedValue('MEMBER');

  // Default: fs operations succeed silently
  mockMkdir.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);

  // Default: sharp chain resolves with a processed PNG buffer
  mockSharpToBuffer.mockResolvedValue(PROCESSED_IMAGE_BUFFER);
  mockSharpPng.mockReturnValue({ toBuffer: mockSharpToBuffer });
  mockSharpResize.mockReturnValue({ png: mockSharpPng });
  mockSharpFn.mockReturnValue({ resize: mockSharpResize });
});

// ---------------------------------------------------------------------------
// POST /api/custom-emojis
// ---------------------------------------------------------------------------

describe('POST /api/custom-emojis', () => {
  // -------------------------------------------------------------------------
  // Test 1: happy path → 201 with emoji data
  // -------------------------------------------------------------------------

  it('returns 201 with emoji data when a valid image and name are provided', async () => {
    const dbEmoji = makeDbEmoji();
    mockCustomEmojiCreate.mockResolvedValue(dbEmoji);

    const image = makeImageFile(1024);
    const req = makePostRequest({ name: 'thumbsup', workspaceId: 'ws-1', image });
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      id: 'emoji-1',
      name: 'thumbsup',
      imageUrl: '/uploads/emojis/ws-1/thumbsup.png',
      createdBy: { id: 'user-1', name: 'Alice', image: null },
    });
    expect(body.data.createdAt).toBeDefined();
  });

  it('creates the DB record with correct fields', async () => {
    mockCustomEmojiCreate.mockResolvedValue(makeDbEmoji());
    const image = makeImageFile(512);
    const req = makePostRequest({ name: 'party', workspaceId: 'ws-1', image });

    await POST(req);

    expect(mockCustomEmojiCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          name: 'party',
          imageUrl: expect.stringContaining('/uploads/emojis/ws-1/party.png'),
          createdById: 'user-1',
        }),
      })
    );
  });

  // -------------------------------------------------------------------------
  // Test 2: duplicate name → 409
  // -------------------------------------------------------------------------

  it('returns 409 when the emoji name already exists in the workspace', async () => {
    mockCustomEmojiCreate.mockRejectedValue(makeP2002Error());

    const image = makeImageFile(512);
    const req = makePostRequest({ name: 'thumbsup', workspaceId: 'ws-1', image });
    const res = await POST(req);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('CONFLICT');
    expect(body.error).toMatch(/thumbsup/i);
  });

  // -------------------------------------------------------------------------
  // Test 3: invalid name (special chars) → 400
  // -------------------------------------------------------------------------

  it('returns 400 when the emoji name contains special characters', async () => {
    const image = makeImageFile(512);
    const req = makePostRequest({ name: 'thumbs-up!', workspaceId: 'ws-1', image });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(mockCustomEmojiCreate).not.toHaveBeenCalled();
  });

  it('returns 400 when the emoji name contains spaces', async () => {
    const image = makeImageFile(512);
    const req = makePostRequest({ name: 'thumbs up', workspaceId: 'ws-1', image });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when the emoji name is only 1 character (below minimum)', async () => {
    const image = makeImageFile(512);
    const req = makePostRequest({ name: 'a', workspaceId: 'ws-1', image });
    const res = await POST(req);

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when the emoji name exceeds 32 characters (above maximum)', async () => {
    const longName = 'a'.repeat(33);
    const image = makeImageFile(512);
    const req = makePostRequest({ name: longName, workspaceId: 'ws-1', image });
    const res = await POST(req);

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('VALIDATION_ERROR');
  });

  it('accepts underscores and mixed case in emoji names', async () => {
    mockCustomEmojiCreate.mockResolvedValue(makeDbEmoji({ name: 'Thumbs_Up_2' }));
    const image = makeImageFile(512);
    const req = makePostRequest({ name: 'Thumbs_Up_2', workspaceId: 'ws-1', image });
    const res = await POST(req);

    expect(res.status).toBe(201);
  });

  // -------------------------------------------------------------------------
  // Test 4: oversized image → 413
  // -------------------------------------------------------------------------

  it('returns 413 when the image exceeds 256 KB', async () => {
    // Just over the 256 KB limit
    const oversizedImage = makeImageFile(MAX_EMOJI_SIZE_BYTES + 1);
    const req = makePostRequest({ name: 'thumbsup', workspaceId: 'ws-1', image: oversizedImage });
    const res = await POST(req);

    // The implementation uses HTTP 413 Payload Too Large (correct status for oversized uploads)
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('FILE_TOO_LARGE');
    expect(body.error).toMatch(/256 KB/i);
    // Sharp should never be invoked for rejected files
    expect(mockSharpFn).not.toHaveBeenCalled();
  });

  it('accepts an image at exactly the 256 KB limit', async () => {
    mockCustomEmojiCreate.mockResolvedValue(makeDbEmoji());
    const exactLimitImage = makeImageFile(MAX_EMOJI_SIZE_BYTES);
    const req = makePostRequest({ name: 'thumbsup', workspaceId: 'ws-1', image: exactLimitImage });
    const res = await POST(req);

    expect(res.status).toBe(201);
  });

  // -------------------------------------------------------------------------
  // Test 5: no auth → 401
  // -------------------------------------------------------------------------

  it('returns 401 when the request is unauthenticated', async () => {
    mockAuthFn.mockResolvedValue(null);

    const image = makeImageFile(512);
    const req = makePostRequest({ name: 'thumbsup', workspaceId: 'ws-1', image });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('UNAUTHORIZED');
    // No DB access should occur for unauthenticated requests
    expect(mockCustomEmojiCreate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 9: missing image field → 400
  // -------------------------------------------------------------------------

  it('returns 400 when no image file is provided', async () => {
    const req = makePostRequest({ name: 'thumbsup', workspaceId: 'ws-1', image: 'omit' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('MISSING_FILE');
    expect(mockSharpFn).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 10: non-image MIME type → 400
  // -------------------------------------------------------------------------

  it('returns 400 when the uploaded file is not an image', async () => {
    const textFile = makeImageFile(512, 'text/plain', 'malicious.txt');
    const req = makePostRequest({ name: 'thumbsup', workspaceId: 'ws-1', image: textFile });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('INVALID_FILE_TYPE');
    expect(body.error).toContain('text/plain');
    expect(mockSharpFn).not.toHaveBeenCalled();
  });

  it('returns 400 for application/octet-stream MIME type', async () => {
    const binFile = makeImageFile(512, 'application/octet-stream', 'file.bin');
    const req = makePostRequest({ name: 'thumbsup', workspaceId: 'ws-1', image: binFile });
    const res = await POST(req);

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_FILE_TYPE');
  });

  // -------------------------------------------------------------------------
  // Test 14: non-member → 403
  // -------------------------------------------------------------------------

  it('returns 403 when the authenticated user is not a workspace member', async () => {
    mockGetMemberRole.mockResolvedValue(null); // null means not a member

    const image = makeImageFile(512);
    const req = makePostRequest({ name: 'thumbsup', workspaceId: 'ws-restricted', image });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('FORBIDDEN');
    expect(mockCustomEmojiCreate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 15: wrong content-type → 400
  // -------------------------------------------------------------------------

  it('returns 400 when content-type is not multipart/form-data', async () => {
    const req = makePostRequest({
      name: 'thumbsup',
      workspaceId: 'ws-1',
      contentType: 'application/json',
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('INVALID_CONTENT_TYPE');
    expect(mockCustomEmojiCreate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 8: image is resized to 128×128 on upload
  // -------------------------------------------------------------------------

  it('resizes the image to 128×128 with contain fit and transparent background', async () => {
    mockCustomEmojiCreate.mockResolvedValue(makeDbEmoji());
    const image = makeImageFile(1024);
    const req = makePostRequest({ name: 'thumbsup', workspaceId: 'ws-1', image });

    await POST(req);

    // sharp(buffer) should be called with the raw image bytes
    expect(mockSharpFn).toHaveBeenCalledTimes(1);
    expect(mockSharpFn).toHaveBeenCalledWith(expect.any(Buffer));

    // .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    expect(mockSharpResize).toHaveBeenCalledWith(
      EMOJI_OUTPUT_PX,
      EMOJI_OUTPUT_PX,
      expect.objectContaining({
        fit: 'contain',
        background: expect.objectContaining({ r: 0, g: 0, b: 0, alpha: 0 }),
      })
    );

    // .png({ quality: 90 })
    expect(mockSharpPng).toHaveBeenCalledWith({ quality: 90 });

    // .toBuffer() is called to get the final PNG bytes
    expect(mockSharpToBuffer).toHaveBeenCalledTimes(1);
  });

  it('writes the processed buffer (not the original) to disk', async () => {
    mockCustomEmojiCreate.mockResolvedValue(makeDbEmoji());
    const image = makeImageFile(1024);
    const req = makePostRequest({ name: 'thumbsup', workspaceId: 'ws-1', image });

    await POST(req);

    // writeFile receives the processed buffer from sharp, not the original raw bytes
    const [, writtenBuffer] = mockWriteFile.mock.calls[0];
    expect(writtenBuffer).toEqual(PROCESSED_IMAGE_BUFFER);
  });

  it('saves the file to the correct path under the workspace directory', async () => {
    mockCustomEmojiCreate.mockResolvedValue(makeDbEmoji());
    const image = makeImageFile(512);
    const req = makePostRequest({ name: 'thumbsup', workspaceId: 'ws-1', image });

    await POST(req);

    // mkdir creates the workspace emoji directory (with recursive)
    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining(path.join('emojis', 'ws-1')),
      { recursive: true }
    );
    // writeFile writes to <emojiDir>/thumbsup.png
    const [filePath] = mockWriteFile.mock.calls[0];
    expect(filePath).toMatch(/thumbsup\.png$/);
  });

  it('stores the public URL path in the DB record', async () => {
    mockCustomEmojiCreate.mockResolvedValue(makeDbEmoji());
    const image = makeImageFile(512);
    const req = makePostRequest({ name: 'thumbsup', workspaceId: 'ws-1', image });

    await POST(req);

    const [[createCall]] = mockCustomEmojiCreate.mock.calls;
    expect(createCall.data.imageUrl).toBe('/uploads/emojis/ws-1/thumbsup.png');
  });
});

// ---------------------------------------------------------------------------
// GET /api/custom-emojis
// ---------------------------------------------------------------------------

// path is used in some write assertions above — import it here so it's available
import path from 'path';

describe('GET /api/custom-emojis', () => {
  // -------------------------------------------------------------------------
  // Test 6: returns all workspace emojis as array
  // -------------------------------------------------------------------------

  it('returns 200 with an array of custom emojis for the workspace', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    mockCustomEmojiFindMany.mockResolvedValue([
      { id: 'e1', name: 'thumbsup', imageUrl: '/uploads/emojis/ws-1/thumbsup.png', createdAt: now, createdBy: { id: 'user-1', name: 'Alice', image: null } },
      { id: 'e2', name: 'heart', imageUrl: '/uploads/emojis/ws-1/heart.png', createdAt: now, createdBy: { id: 'user-2', name: 'Bob', image: null } },
    ]);

    const req = makeGetRequest('ws-1');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({ id: 'e1', name: 'thumbsup' });
    expect(body.data[1]).toMatchObject({ id: 'e2', name: 'heart' });
  });

  it('queries the correct workspace and includes creator details', async () => {
    mockCustomEmojiFindMany.mockResolvedValue([]);

    const req = makeGetRequest('ws-42');
    await GET(req);

    expect(mockCustomEmojiFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'ws-42' },
        select: expect.objectContaining({
          id: true,
          name: true,
          imageUrl: true,
          createdAt: true,
          createdBy: expect.objectContaining({
            select: { id: true, name: true, image: true },
          }),
        }),
      })
    );
  });

  // -------------------------------------------------------------------------
  // Test 7: GET with no emojis → empty array
  // -------------------------------------------------------------------------

  it('returns 200 with an empty array when the workspace has no custom emojis', async () => {
    mockCustomEmojiFindMany.mockResolvedValue([]);

    const req = makeGetRequest('ws-empty');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Test 11: missing workspaceId → 400
  // -------------------------------------------------------------------------

  it('returns 400 when workspaceId query parameter is missing', async () => {
    const req = makeGetRequest(); // no workspaceId
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(mockCustomEmojiFindMany).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 12: non-member → 403
  // -------------------------------------------------------------------------

  it('returns 403 when the authenticated user is not a workspace member', async () => {
    mockGetMemberRole.mockResolvedValue(null);

    const req = makeGetRequest('ws-private');
    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('FORBIDDEN');
    expect(mockCustomEmojiFindMany).not.toHaveBeenCalled();
  });

  it('passes workspaceId and userId to getMemberRole for authorization', async () => {
    mockCustomEmojiFindMany.mockResolvedValue([]);

    const req = makeGetRequest('ws-99');
    await GET(req);

    expect(mockGetMemberRole).toHaveBeenCalledWith('ws-99', 'user-1');
  });

  // -------------------------------------------------------------------------
  // Test 13: no auth → 401
  // -------------------------------------------------------------------------

  it('returns 401 when the request is unauthenticated', async () => {
    mockAuthFn.mockResolvedValue(null);

    const req = makeGetRequest('ws-1');
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('UNAUTHORIZED');
    expect(mockCustomEmojiFindMany).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Additional: response shape
  // -------------------------------------------------------------------------

  it('returns emoji data with all required fields', async () => {
    const createdAt = new Date('2026-01-15T12:00:00.000Z');
    mockCustomEmojiFindMany.mockResolvedValue([
      {
        id: 'e1',
        name: 'rocket',
        imageUrl: '/uploads/emojis/ws-1/rocket.png',
        createdAt,
        createdBy: { id: 'user-1', name: 'Alice', image: 'https://example.com/alice.jpg' },
      },
    ]);

    const req = makeGetRequest('ws-1');
    const res = await GET(req);
    const body = await res.json();

    const emoji = body.data[0];
    expect(emoji.id).toBe('e1');
    expect(emoji.name).toBe('rocket');
    expect(emoji.imageUrl).toBe('/uploads/emojis/ws-1/rocket.png');
    expect(emoji.createdBy).toEqual({ id: 'user-1', name: 'Alice', image: 'https://example.com/alice.jpg' });
    expect(emoji.createdAt).toBeDefined();
  });
});
