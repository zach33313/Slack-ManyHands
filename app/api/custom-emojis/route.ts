/**
 * app/api/custom-emojis/route.ts
 *
 * GET  /api/custom-emojis?workspaceId=<id>  — List all custom emojis for a workspace
 * POST /api/custom-emojis                    — Upload a new custom emoji
 *
 * POST accepts multipart/form-data with:
 *   - name:        string (alphanumeric + underscores, 2-32 chars)
 *   - workspaceId: string
 *   - image:       File  (image/*, max 256KB)
 *
 * The image is resized to 128×128px (contain, transparent bg) and saved as PNG.
 * Files are stored at /public/uploads/emojis/{workspaceId}/{name}.png.
 *
 * All responses use the standard { ok, data } / { ok, code, error } envelopes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import path from 'path';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { requireAuth, AuthError } from '@/auth/middleware';
import { ok, err } from '@/shared/types/api';
import { prisma } from '@/shared/lib/prisma';
import { getMemberRole } from '@/workspaces/queries';
import { IS_DEMO, demoBlock } from '@/shared/lib/demo';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum emoji file size accepted from the client (256 KB) */
const MAX_EMOJI_SIZE_BYTES = 256 * 1024;

/** Output dimension for processed emoji images */
const EMOJI_OUTPUT_PX = 128;

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  workspaceId: z.string().min(1, 'workspaceId is required'),
});

const uploadSchema = z.object({
  name: z
    .string()
    .min(2, 'Emoji name must be at least 2 characters')
    .max(32, 'Emoji name must be at most 32 characters')
    .regex(
      /^[a-zA-Z0-9_]+$/,
      'Emoji name can only contain alphanumeric characters and underscores'
    ),
  workspaceId: z.string().min(1, 'workspaceId is required'),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserSummary {
  id: string;
  name: string | null;
  image: string | null;
}

export interface CustomEmojiData {
  id: string;
  name: string;
  imageUrl: string;
  createdBy: UserSummary;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resize/convert an image buffer to a 128×128 PNG using sharp.
 * Uses "contain" fit so the emoji is never distorted; transparent background
 * is used to fill any padding area.
 */
async function processEmojiImage(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp(buffer)
    .resize(EMOJI_OUTPUT_PX, EMOJI_OUTPUT_PX, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ quality: 90 })
    .toBuffer();
}

/**
 * Persist an emoji buffer to the local filesystem.
 * Ensures the target directory exists, then writes the file.
 * Returns the public URL path (e.g. /uploads/emojis/{workspaceId}/{name}.png).
 */
async function saveEmojiToStorage(
  workspaceId: string,
  name: string,
  buffer: Buffer
): Promise<string> {
  const baseUploadDir = process.env.UPLOAD_DIR ?? './public/uploads';
  const emojiDir = path.join(baseUploadDir, 'emojis', workspaceId);

  await mkdir(emojiDir, { recursive: true });

  const filename = `${name}.png`;
  await writeFile(path.join(emojiDir, filename), buffer);

  return `/uploads/emojis/${workspaceId}/${filename}`;
}

/**
 * Extract Zod field errors into a { field: string[] } map
 * (matches the shape expected by the standard error envelope).
 */
function zodFieldErrors(zodError: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of zodError.issues) {
    const field = issue.path.join('.') || '_';
    if (!fieldErrors[field]) fieldErrors[field] = [];
    fieldErrors[field].push(issue.message);
  }
  return fieldErrors;
}

// ---------------------------------------------------------------------------
// GET /api/custom-emojis?workspaceId=<id>
// ---------------------------------------------------------------------------

/**
 * List all custom emojis for a workspace.
 * The requesting user must be a member of the workspace.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Parse & validate query params
    const url = new URL(request.url);
    const parsed = listQuerySchema.safeParse({
      workspaceId: url.searchParams.get('workspaceId'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        err('VALIDATION_ERROR', 'Invalid query parameters', zodFieldErrors(parsed.error)),
        { status: 400 }
      );
    }

    const { workspaceId } = parsed.data;

    // Verify workspace membership
    const role = await getMemberRole(workspaceId, session.user.id);
    if (!role) {
      return NextResponse.json(
        err('FORBIDDEN', 'You are not a member of this workspace'),
        { status: 403 }
      );
    }

    // Fetch emojis with creator info
    const emojis = await prisma.customEmoji.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        createdAt: true,
        createdBy: {
          select: { id: true, name: true, image: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data: CustomEmojiData[] = emojis.map((e) => ({
      id: e.id,
      name: e.name,
      imageUrl: e.imageUrl,
      createdBy: e.createdBy,
      createdAt: e.createdAt,
    }));

    return NextResponse.json(ok(data));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        err('UNAUTHORIZED', error.message),
        { status: error.status }
      );
    }
    console.error('[custom-emojis] GET error:', error);
    return NextResponse.json(
      err('INTERNAL_ERROR', 'Failed to fetch custom emojis'),
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/custom-emojis
// ---------------------------------------------------------------------------

/**
 * Upload a new custom emoji.
 *
 * Expected multipart/form-data fields:
 *   name        — emoji shortcode (alphanumeric + underscores, 2-32 chars)
 *   workspaceId — ID of the target workspace
 *   image       — image file (image/*, max 256 KB)
 *
 * Processing pipeline:
 *   1. Validate auth + workspace membership
 *   2. Validate name & image (type, size)
 *   3. Resize image to 128×128 PNG via sharp
 *   4. Write to /public/uploads/emojis/{workspaceId}/{name}.png
 *   5. Insert CustomEmoji record in DB
 *   6. Return the created emoji object
 */
export async function POST(request: NextRequest) {
  if (IS_DEMO) return demoBlock('Custom emoji uploads');
  try {
    const session = await requireAuth();

    // Require multipart/form-data
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        err('INVALID_CONTENT_TYPE', 'Expected multipart/form-data'),
        { status: 400 }
      );
    }

    const formData = await request.formData();

    // Validate text fields with Zod
    const parsed = uploadSchema.safeParse({
      name: formData.get('name'),
      workspaceId: formData.get('workspaceId'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        err('VALIDATION_ERROR', 'Invalid input', zodFieldErrors(parsed.error)),
        { status: 400 }
      );
    }

    const { name: emojiName, workspaceId } = parsed.data;

    // Verify workspace membership
    const role = await getMemberRole(workspaceId, session.user.id);
    if (!role) {
      return NextResponse.json(
        err('FORBIDDEN', 'You are not a member of this workspace'),
        { status: 403 }
      );
    }

    // Validate image field
    const imageField = formData.get('image');
    if (!imageField || !(imageField instanceof File)) {
      return NextResponse.json(
        err('MISSING_FILE', 'No image file provided. Expected field name: "image"'),
        { status: 400 }
      );
    }

    // Validate MIME type (must be image/*)
    if (!imageField.type.startsWith('image/')) {
      return NextResponse.json(
        err(
          'INVALID_FILE_TYPE',
          `Only image files are allowed. Got "${imageField.type}".`
        ),
        { status: 400 }
      );
    }

    // Validate file size (max 256 KB)
    if (imageField.size > MAX_EMOJI_SIZE_BYTES) {
      return NextResponse.json(
        err(
          'FILE_TOO_LARGE',
          `Image must be smaller than 256 KB. Got ${Math.round(imageField.size / 1024)} KB.`
        ),
        { status: 413 }
      );
    }

    // Convert File → Buffer, process with sharp, save to disk
    const rawBuffer = Buffer.from(await imageField.arrayBuffer());
    const processedBuffer = await processEmojiImage(rawBuffer);
    const imageUrl = await saveEmojiToStorage(workspaceId, emojiName, processedBuffer);

    // Insert DB record, catching unique constraint violations
    let emoji: {
      id: string;
      name: string;
      imageUrl: string;
      createdAt: Date;
      createdBy: { id: string; name: string | null; image: string | null };
    };

    try {
      emoji = await prisma.customEmoji.create({
        data: {
          workspaceId,
          name: emojiName,
          imageUrl,
          createdById: session.user.id,
        },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true, image: true } },
        },
      });
    } catch (dbError) {
      // DB write failed — remove the file that was already saved to disk to
      // prevent orphaned files accumulating without a DB record.
      const baseUploadDir = process.env.UPLOAD_DIR ?? './public/uploads';
      const filePath = path.join(baseUploadDir, 'emojis', workspaceId, `${emojiName}.png`);
      await unlink(filePath).catch(() => {});

      // Prisma unique constraint violation → P2002
      if (
        dbError instanceof Error &&
        (dbError as NodeJS.ErrnoException & { code?: string }).code === 'P2002'
      ) {
        return NextResponse.json(
          err(
            'CONFLICT',
            `An emoji named "${emojiName}" already exists in this workspace.`
          ),
          { status: 409 }
        );
      }
      throw dbError;
    }

    const data: CustomEmojiData = {
      id: emoji.id,
      name: emoji.name,
      imageUrl: emoji.imageUrl,
      createdBy: emoji.createdBy,
      createdAt: emoji.createdAt,
    };

    return NextResponse.json(ok(data), { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        err('UNAUTHORIZED', error.message),
        { status: error.status }
      );
    }
    console.error('[custom-emojis] POST error:', error);
    return NextResponse.json(
      err('INTERNAL_ERROR', 'Failed to create custom emoji'),
      { status: 500 }
    );
  }
}
