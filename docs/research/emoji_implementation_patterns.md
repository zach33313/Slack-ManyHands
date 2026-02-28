# Custom Emoji Implementation Patterns & Code Examples

**Purpose**: Detailed code examples and architectural patterns for implementing custom emoji support.

---

## 1. Image Optimization Pipeline

### Pattern: Sharp-Based Emoji Processor

**File**: `backend/lib/emoji-optimizer.ts`

```typescript
import sharp from 'sharp';

export interface OptimizedEmoji {
  png: Buffer;
  webp: Buffer;
  width: number;
  height: number;
  format: string;
}

const MAX_EMOJI_SIZE = 128;
const PNG_QUALITY = 90;
const WEBP_QUALITY = 85;

/**
 * Optimize emoji image for web delivery.
 * - Resize to 128×128px with transparent background
 * - Generate PNG (primary format)
 * - Generate WebP (optimized format)
 * - Validate dimensions and format
 */
export async function optimizeEmojiImage(
  buffer: Buffer
): Promise<OptimizedEmoji> {
  // Validate it's an image
  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch (err) {
    throw new Error('Invalid image format');
  }

  const { width = 0, height = 0, format } = metadata;

  // Validate format
  const allowedFormats = ['png', 'jpeg', 'gif'];
  if (!format || !allowedFormats.includes(format.toLowerCase())) {
    throw new Error(`Format ${format} not supported. Use PNG, JPEG, or GIF.`);
  }

  // Validate current size
  if (width > 2048 || height > 2048) {
    throw new Error(`Image too large (${width}×${height}). Max 2048×2048px.`);
  }

  // Resize with transparent background
  const resized = sharp(buffer)
    .resize(MAX_EMOJI_SIZE, MAX_EMOJI_SIZE, {
      fit: 'contain', // Preserve aspect ratio
      background: { r: 0, g: 0, b: 0, alpha: 0 }, // Transparent
    })
    .png({ compressionLevel: 9, quality: PNG_QUALITY });

  const png = await resized.toBuffer();

  const webp = await sharp(buffer)
    .resize(MAX_EMOJI_SIZE, MAX_EMOJI_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  return {
    png,
    webp,
    width: MAX_EMOJI_SIZE,
    height: MAX_EMOJI_SIZE,
    format: 'png',
  };
}

/**
 * Validate emoji file before optimization
 */
export function validateEmojiFile(
  file: File | { size: number; type: string }
): { valid: boolean; error?: string } {
  const MAX_SIZE_BYTES = 256 * 1024; // 256KB
  const ALLOWED_TYPES = ['image/png', 'image/gif', 'image/jpeg'];

  if (file.size > MAX_SIZE_BYTES) {
    return {
      valid: false,
      error: `File too large (${Math.round(file.size / 1024)}KB). Max 256KB.`,
    };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'Only PNG, GIF, and JPEG are supported.',
    };
  }

  return { valid: true };
}
```

### Usage in API Route

```typescript
// app/api/workspaces/[workspaceId]/emoji/route.ts
import { optimizeEmojiImage, validateEmojiFile } from '@/backend/lib/emoji-optimizer';

export async function POST(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File;
  const shortcode = formData.get('name') as string;

  // Validate file
  const validation = validateEmojiFile(file);
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error },
      { status: 400 }
    );
  }

  // Optimize image
  const buffer = await file.arrayBuffer();
  const optimized = await optimizeEmojiImage(Buffer.from(buffer));

  // Store images (PNG primary, WebP as backup)
  const pngUrl = await saveEmojiImage(
    params.workspaceId,
    shortcode,
    optimized.png,
    'png'
  );

  // Create database record
  const emoji = await prisma.customEmoji.create({
    data: {
      workspaceId: params.workspaceId,
      name: shortcode,
      imageUrl: pngUrl,
      createdById: session.user.id,
    },
  });

  return NextResponse.json(
    {
      id: emoji.id,
      name: emoji.name,
      imageUrl: emoji.imageUrl,
    },
    { status: 201 }
  );
}
```

---

## 2. Storage Abstraction Layer

### Pattern: Pluggable Storage Backend

**File**: `backend/storage/emoji-storage.ts`

```typescript
export interface EmojiStorageBackend {
  save(
    path: string,
    buffer: Buffer,
    format: 'png' | 'webp'
  ): Promise<string>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

/**
 * Local filesystem storage
 * Stores emoji in /public/uploads/emoji/{workspaceId}/{name}.{format}
 */
export class LocalEmojiStorage implements EmojiStorageBackend {
  private baseDir: string;

  constructor(baseDir = '/public/uploads/emoji') {
    this.baseDir = baseDir;
  }

  async save(
    path: string,
    buffer: Buffer,
    format: 'png' | 'webp'
  ): Promise<string> {
    const fs = await import('fs/promises');
    const fsSync = await import('fs');
    const pathLib = await import('path');

    const fullPath = pathLib.join(this.baseDir, path, `.${format}`);
    const dir = pathLib.dirname(fullPath);

    // Ensure directory exists
    if (!fsSync.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }

    // Write file
    await fs.writeFile(fullPath, buffer);

    // Return relative URL
    return `/uploads/emoji/${path}.${format}`;
  }

  async delete(path: string): Promise<void> {
    const fs = await import('fs/promises');
    const pathLib = await import('path');

    const fullPath = pathLib.join(this.baseDir, `${path}.png`);
    try {
      await fs.unlink(fullPath);
    } catch (err) {
      // File doesn't exist, ignore
    }
  }

  async exists(path: string): Promise<boolean> {
    const fs = await import('fs/promises');
    const pathLib = await import('path');

    const fullPath = pathLib.join(this.baseDir, `${path}.png`);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * AWS S3 storage with CDN support
 */
export class S3EmojiStorage implements EmojiStorageBackend {
  private s3: S3Client;
  private bucket: string;
  private cdnUrl?: string;

  constructor(
    s3: S3Client,
    bucket: string,
    cdnUrl?: string
  ) {
    this.s3 = s3;
    this.bucket = bucket;
    this.cdnUrl = cdnUrl || `https://${bucket}.s3.amazonaws.com`;
  }

  async save(
    path: string,
    buffer: Buffer,
    format: 'png' | 'webp'
  ): Promise<string> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');

    const key = `emoji/${path}.${format}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: format === 'png' ? 'image/png' : 'image/webp',
        CacheControl: 'public, max-age=31536000', // 1 year
      })
    );

    return `${this.cdnUrl}/${key}`;
  }

  async delete(path: string): Promise<void> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');

    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: `emoji/${path}.png`,
      })
    );
  }

  async exists(path: string): Promise<boolean> {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');

    try {
      await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: `emoji/${path}.png`,
        })
      );
      return true;
    } catch (err) {
      return false;
    }
  }
}

/**
 * Factory function to create appropriate storage backend
 */
export function createEmojiStorage(): EmojiStorageBackend {
  const useS3 =
    process.env.NODE_ENV === 'production' &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY;

  if (useS3) {
    const { S3Client } = require('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
    });

    return new S3EmojiStorage(
      s3,
      process.env.AWS_S3_BUCKET || 'emoji-storage',
      process.env.AWS_CDN_URL
    );
  }

  return new LocalEmojiStorage();
}

// Singleton instance
export const emojiStorage = createEmojiStorage();
```

---

## 3. Enhanced Reaction Picker Component

### Pattern: Custom Emoji Category Integration

**File**: `messages/components/EnhancedReactionPicker.tsx`

```typescript
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import * as Popover from '@radix-ui/react-popover';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { useTheme } from 'next-themes';
import { cn } from '@/shared/lib/utils';

interface CustomEmojiData {
  id: string;
  name: string;
  imageUrl: string;
}

interface EmojiMartEmoji {
  id: string;
  native?: string;
  skins?: Array<{ src: string }>;
}

interface EnhancedReactionPickerProps {
  /** Workspace ID to fetch custom emoji from */
  workspaceId: string;
  /** Called with emoji reference (native char or custom_<id>) */
  onSelect: (emoji: string) => void;
  /** Custom trigger element */
  trigger?: React.ReactNode;
  /** Additional class names for trigger button */
  triggerClassName?: string;
}

/**
 * Enhanced reaction picker supporting both standard emoji and workspace custom emoji.
 *
 * Standard emoji are selected as native characters (e.g., "👍")
 * Custom emoji are selected as IDs (e.g., "custom_abc123")
 */
export function EnhancedReactionPicker({
  workspaceId,
  onSelect,
  trigger,
  triggerClassName,
}: EnhancedReactionPickerProps) {
  const [open, setOpen] = useState(false);
  const [customEmojis, setCustomEmojis] = useState<CustomEmojiData[]>([]);
  const [loading, setLoading] = useState(false);
  const { resolvedTheme } = useTheme();

  // Fetch custom emoji when picker opens
  useEffect(() => {
    if (!open || customEmojis.length > 0) return;

    setLoading(true);
    fetch(`/api/workspaces/${workspaceId}/emoji`)
      .then((res) => res.json())
      .then((data) => {
        setCustomEmojis(data.emojis || []);
      })
      .catch((err) => {
        console.error('Failed to load custom emoji:', err);
        setCustomEmojis([]);
      })
      .finally(() => setLoading(false));
  }, [open, workspaceId, customEmojis.length]);

  const handleEmojiSelect = useCallback(
    (emoji: EmojiMartEmoji) => {
      // Determine if this is a custom emoji or standard emoji
      const isCustom = emoji.id?.startsWith('emoji_mart_custom_');

      if (isCustom) {
        // Extract original custom emoji ID from emoji-mart ID
        const customId = emoji.id.replace('emoji_mart_custom_', '');
        onSelect(`custom_${customId}`);
      } else {
        // Standard emoji - use native character
        onSelect(emoji.native || emoji.id);
      }

      setOpen(false);
    },
    [onSelect]
  );

  // Build custom emoji category for emoji-mart
  const customCategory =
    customEmojis.length > 0
      ? {
          id: 'custom',
          name: 'Custom',
          emojis: customEmojis.map((emoji) => ({
            id: `emoji_mart_custom_${emoji.id}`, // Prefix to identify custom
            name: emoji.name,
            keywords: [emoji.name],
            skins: [{ src: emoji.imageUrl }],
          })),
        }
      : null;

  // Merge custom category with standard data
  const pickerData = customCategory
    ? {
        ...data,
        categories: [customCategory, ...data.categories],
      }
    : data;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {trigger ?? (
          <button
            type="button"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full',
              'border border-border bg-background text-sm text-muted-foreground',
              'transition-colors hover:border-border hover:bg-muted hover:text-foreground',
              triggerClassName
            )}
            aria-label="Add reaction"
            title="Add reaction"
          >
            +
          </button>
        )}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={4}
          className="z-50 animate-in fade-in-0 zoom-in-95"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {loading ? (
            <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
              Loading emoji...
            </div>
          ) : (
            <Picker
              data={pickerData}
              onEmojiSelect={handleEmojiSelect}
              theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
              previewPosition="none"
              skinTonePosition="none"
              maxFrequentRows={2}
              perLine={8}
              emojiSize={20}
              emojiButtonSize={28}
            />
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

---

## 4. Emoji Rendering Utility

### Pattern: Unified Emoji Display

**File**: `shared/lib/emoji-renderer.ts`

```typescript
import type { CustomEmoji } from '@prisma/client';

interface EmojiRenderOptions {
  size?: number; // CSS size in pixels
  className?: string;
  title?: string;
}

/**
 * Normalize emoji for storage/transmission.
 * Converts custom emoji references to a standard format.
 */
export function normalizeEmoji(emoji: string): string {
  // Already normalized or standard emoji
  return emoji.startsWith('custom_') ? emoji : emoji;
}

/**
 * Render emoji as HTML string.
 * - Standard emoji: returns the emoji character
 * - Custom emoji: returns <img> tag with URL
 */
export function renderEmojiAsHtml(
  emoji: string,
  customEmojiMap: Map<string, CustomEmoji>,
  options: EmojiRenderOptions = {}
): string {
  const { size = 24, className = '', title = '' } = options;

  if (!emoji.startsWith('custom_')) {
    // Standard emoji - return character
    return `<span${title ? ` title="${title}"` : ''}>${emoji}</span>`;
  }

  // Custom emoji - look up in map
  const emojiId = emoji.replace('custom_', '');
  const customEmoji = customEmojiMap.get(emojiId);

  if (!customEmoji) {
    // Fallback if custom emoji was deleted
    return '<span title="Deleted emoji">❓</span>';
  }

  return `
    <img
      src="${customEmoji.imageUrl}"
      alt=":${customEmoji.name}:"
      title="${title || `:${customEmoji.name}:`}"
      class="inline-block ${className}"
      style="width: ${size}px; height: ${size}px; vertical-align: -0.2em;"
      loading="lazy"
    />
  `.trim();
}

/**
 * React component for emoji rendering
 */
export function EmojiRenderer({
  emoji,
  customEmojis,
  size = 24,
  className = '',
}: {
  emoji: string;
  customEmojis: CustomEmoji[];
  size?: number;
  className?: string;
}) {
  const customEmojiMap = new Map(customEmojis.map((e) => [e.id, e]));

  if (!emoji.startsWith('custom_')) {
    return <span className={className}>{emoji}</span>;
  }

  const emojiId = emoji.replace('custom_', '');
  const customEmoji = customEmojiMap.get(emojiId);

  if (!customEmoji) {
    return <span title="Deleted emoji">❓</span>;
  }

  return (
    <img
      src={customEmoji.imageUrl}
      alt={`:${customEmoji.name}:`}
      title={`:${customEmoji.name}:`}
      className={className}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        verticalAlign: '-0.2em',
      }}
      loading="lazy"
    />
  );
}
```

---

## 5. Socket Handler Updates

### Pattern: Custom Emoji in Reactions

**File**: `server/socket-handlers/messages.ts` (updates)

```typescript
// Existing socket handler for message:react
socket.on('message:react', async (payload: MessageReactPayload) => {
  const { messageId, emoji } = payload;
  const userId = (socket.data as SocketData).userId;

  if (!emoji) {
    socket.emit('error', { message: 'Emoji is required' });
    return;
  }

  // Validate emoji format (native char or custom_<id>)
  if (!isValidEmojiFormat(emoji)) {
    socket.emit('error', { message: 'Invalid emoji format' });
    return;
  }

  try {
    // Verify message exists
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, channelId: true },
    });

    if (!message) {
      socket.emit('error', { message: 'Message not found' });
      return;
    }

    // For custom emoji, verify it exists and belongs to workspace
    if (emoji.startsWith('custom_')) {
      const emojiId = emoji.replace('custom_', '');
      const customEmoji = await prisma.customEmoji.findUnique({
        where: { id: emojiId },
      });

      if (!customEmoji) {
        socket.emit('error', { message: 'Emoji not found' });
        return;
      }
    }

    // Create reaction record (normalize emoji)
    const normalizedEmoji = normalizeEmoji(emoji);
    await prisma.reaction.create({
      data: {
        messageId,
        userId,
        emoji: normalizedEmoji,
      },
    });

    // Broadcast to channel subscribers
    io.to(`channel:${message.channelId}`).emit('message:reacted', {
      messageId,
      emoji: normalizedEmoji,
      userId,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        // Unique constraint violation - user already reacted with this emoji
        socket.emit('error', { message: 'You already reacted with this emoji' });
        return;
      }
    }
    socket.emit('error', { message: 'Failed to add reaction' });
  }
});

// Helper function to validate emoji format
function isValidEmojiFormat(emoji: string): boolean {
  // Custom emoji: custom_<uuid/cuid>
  if (emoji.startsWith('custom_')) {
    const id = emoji.replace('custom_', '');
    // Validate it looks like a cuid (alphanumeric, lowercase)
    return /^[a-z0-9]{21,}$/.test(id);
  }

  // Standard emoji: single or multi-byte character
  // Unicode emoji detection (simplified)
  return emoji.length > 0 && emoji.length <= 4;
}

// Type definitions
interface MessageReactPayload {
  messageId: string;
  emoji: string;
}
```

---

## 6. Database Query Patterns

### Pattern: Hydrated Emoji in Reactions

**File**: `messages/actions.ts` (examples)

```typescript
import { prisma } from '@/lib/prisma';

/**
 * Fetch message with reactions, including custom emoji details
 */
export async function getMessageWithReactions(messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      reactions: true,
      channel: true,
      author: true,
    },
  });

  if (!message) return null;

  // Get all custom emoji referenced in reactions
  const customEmojiIds = new Set<string>();
  for (const reaction of message.reactions) {
    if (reaction.emoji.startsWith('custom_')) {
      customEmojiIds.add(reaction.emoji.replace('custom_', ''));
    }
  }

  const customEmojis = await prisma.customEmoji.findMany({
    where: { id: { in: Array.from(customEmojiIds) } },
  });

  // Build custom emoji map for efficient lookup
  const customEmojiMap = new Map(customEmojis.map((e) => [e.id, e]));

  // Group reactions by emoji and include custom emoji data
  const reactionGroups = groupReactions(
    message.reactions,
    customEmojiMap
  );

  return {
    ...message,
    reactions: reactionGroups,
    customEmojis: customEmojis,
  };
}

/**
 * Group reactions with hydrated custom emoji data
 */
function groupReactions(
  reactions: Reaction[],
  customEmojiMap: Map<string, CustomEmoji>
) {
  const grouped = new Map<
    string,
    { emoji: string; userIds: string[]; customEmoji?: CustomEmoji }
  >();

  for (const reaction of reactions) {
    if (!grouped.has(reaction.emoji)) {
      grouped.set(reaction.emoji, {
        emoji: reaction.emoji,
        userIds: [],
        customEmoji: reaction.emoji.startsWith('custom_')
          ? customEmojiMap.get(reaction.emoji.replace('custom_', ''))
          : undefined,
      });
    }

    grouped.get(reaction.emoji)!.userIds.push(reaction.userId);
  }

  return Array.from(grouped.values());
}

/**
 * Fetch workspace custom emoji
 */
export async function getWorkspaceCustomEmoji(workspaceId: string) {
  return prisma.customEmoji.findMany({
    where: { workspaceId },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      createdById: true,
      createdAt: true,
      createdBy: {
        select: { id: true, name: true, image: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}
```

---

## 7. API Route Structure

### Pattern: RESTful Custom Emoji Endpoints

**File**: `app/api/workspaces/[workspaceId]/emoji/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import { emojiStorage } from '@/backend/storage/emoji-storage';
import { optimizeEmojiImage, validateEmojiFile } from '@/backend/lib/emoji-optimizer';

/**
 * GET /api/workspaces/{workspaceId}/emoji
 * Fetch all custom emoji for a workspace
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is workspace member
    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: params.workspaceId,
          userId: session.user.id,
        },
      },
    });

    if (!member) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const emojis = await prisma.customEmoji.findMany({
      where: { workspaceId: params.workspaceId },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        createdById: true,
        createdAt: true,
        createdBy: {
          select: { id: true, name: true, image: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ emojis }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch emoji:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces/{workspaceId}/emoji
 * Upload and create custom emoji
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is workspace admin
    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: params.workspaceId,
          userId: session.user.id,
        },
      },
    });

    if (!member || member.role === 'MEMBER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const shortcode = (formData.get('name') as string)?.toLowerCase();

    if (!file || !shortcode) {
      return NextResponse.json(
        { error: 'File and name are required' },
        { status: 400 }
      );
    }

    // Validate file
    const validation = validateEmojiFile(file);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Optimize image
    const buffer = await file.arrayBuffer();
    const optimized = await optimizeEmojiImage(Buffer.from(buffer));

    // Store image
    const path = `${params.workspaceId}/${shortcode}`;
    const imageUrl = await emojiStorage.save(path, optimized.png, 'png');

    // Create database record
    const emoji = await prisma.customEmoji.create({
      data: {
        workspaceId: params.workspaceId,
        name: shortcode,
        imageUrl,
        createdById: session.user.id,
      },
    });

    return NextResponse.json(
      {
        id: emoji.id,
        name: emoji.name,
        imageUrl: emoji.imageUrl,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Emoji upload error:', err);

    if (err instanceof Error && err.message.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'Emoji shortcode already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    );
  }
}
```

**File**: `app/api/workspaces/custom-emoji/[emojiId]/route.ts`

```typescript
/**
 * DELETE /api/workspaces/custom-emoji/{emojiId}
 * Delete custom emoji (admin/creator only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { emojiId: string } }
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch emoji to verify permissions
    const emoji = await prisma.customEmoji.findUnique({
      where: { id: params.emojiId },
      include: { workspace: true },
    });

    if (!emoji) {
      return NextResponse.json({ error: 'Emoji not found' }, { status: 404 });
    }

    // Verify user is admin or creator
    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: emoji.workspaceId,
          userId: session.user.id,
        },
      },
    });

    if (!member || (member.role === 'MEMBER' && emoji.createdById !== session.user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete from storage
    const path = `${emoji.workspaceId}/${emoji.name}`;
    await emojiStorage.delete(path);

    // Delete from database
    await prisma.customEmoji.delete({
      where: { id: params.emojiId },
    });

    return NextResponse.json({}, { status: 204 });
  } catch (err) {
    console.error('Emoji delete error:', err);
    return NextResponse.json(
      { error: 'Delete failed' },
      { status: 500 }
    );
  }
}
```

---

## Testing Patterns

### Example Test Suite

```typescript
// __tests__/emoji/emoji-optimizer.test.ts
import { optimizeEmojiImage, validateEmojiFile } from '@/backend/lib/emoji-optimizer';

describe('emoji-optimizer', () => {
  describe('optimizeEmojiImage', () => {
    it('should resize large image to 128x128', async () => {
      // Load test image
      const buffer = readFileSync('__tests__/fixtures/emoji-large.png');
      const result = await optimizeEmojiImage(buffer);

      expect(result.width).toBe(128);
      expect(result.height).toBe(128);
    });

    it('should generate both PNG and WebP', async () => {
      const buffer = readFileSync('__tests__/fixtures/emoji.png');
      const result = await optimizeEmojiImage(buffer);

      expect(result.png).toBeDefined();
      expect(result.webp).toBeDefined();
      expect(result.webp.length).toBeLessThan(result.png.length); // WebP typically smaller
    });

    it('should reject invalid format', async () => {
      const buffer = Buffer.from('not an image');
      await expect(optimizeEmojiImage(buffer)).rejects.toThrow(/Invalid image/);
    });
  });

  describe('validateEmojiFile', () => {
    it('should accept PNG files', () => {
      const file = { size: 50000, type: 'image/png' };
      expect(validateEmojiFile(file).valid).toBe(true);
    });

    it('should reject oversized files', () => {
      const file = { size: 300000, type: 'image/png' };
      expect(validateEmojiFile(file).valid).toBe(false);
      expect(validateEmojiFile(file).error).toMatch(/too large/i);
    });

    it('should reject unsupported formats', () => {
      const file = { size: 50000, type: 'image/svg+xml' };
      expect(validateEmojiFile(file).valid).toBe(false);
    });
  });
});
```

---

## Summary Table: Implementation Checklist

| Component | File | Status | Dependencies |
|-----------|------|--------|--------------|
| Image Optimizer | `backend/lib/emoji-optimizer.ts` | NEW | Sharp |
| Storage Layer | `backend/storage/emoji-storage.ts` | NEW | AWS SDK (optional) |
| Enhanced Picker | `messages/components/EnhancedReactionPicker.tsx` | NEW | emoji-mart, radix-ui |
| Emoji Renderer | `shared/lib/emoji-renderer.ts` | NEW | None |
| Socket Handlers | `server/socket-handlers/messages.ts` | UPDATE | Existing |
| API Routes | `app/api/workspaces/[...]/emoji` | NEW | Next.js |
| Database Queries | `messages/actions.ts` | UPDATE | Prisma |
| Tests | `__tests__/emoji/*.test.ts` | NEW | Jest |

