'use server';

/**
 * canvas/actions.ts
 *
 * Server actions for the collaborative canvas feature.
 * All mutations go through here — never call Prisma directly from client components.
 */

import { auth } from '@/auth/auth';
import { prisma } from '@/shared/lib/prisma';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CanvasData {
  id: string;
  channelId: string;
  content: string; // base64 Yjs state or JSON
  updatedAt: Date;
}

export interface CanvasVersionData {
  id: string;
  canvasId: string;
  userId: string;
  userName: string;
  userImage: string | null;
  content: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// getCanvas
// ---------------------------------------------------------------------------

/**
 * Find or create the Canvas record for a channel.
 * Returns the canvas data (id, channelId, content, updatedAt).
 */
export async function getCanvas(channelId: string): Promise<CanvasData> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  // Try to find an existing canvas for this channel
  let canvas = await prisma.canvas.findFirst({
    where: {
      channelId,
      isActive: true,
    },
  });

  // Create if it doesn't exist
  if (!canvas) {
    canvas = await prisma.canvas.create({
      data: {
        channelId,
        name: 'Canvas',
        contentJson: JSON.stringify({ type: 'doc', content: [] }),
        createdById: session.user.id,
        isActive: true,
      },
    });
  }

  return {
    id: canvas.id,
    channelId: canvas.channelId,
    content: canvas.contentJson,
    updatedAt: canvas.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// saveCanvas
// ---------------------------------------------------------------------------

/**
 * Update the Canvas content (base64 Yjs state or JSON).
 * Called from the debounced auto-save in useYjsSync.
 */
export async function saveCanvas(channelId: string, content: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const canvas = await prisma.canvas.findFirst({
    where: {
      channelId,
      isActive: true,
    },
  });

  if (!canvas) {
    // Create canvas if it doesn't exist
    await prisma.canvas.create({
      data: {
        channelId,
        name: 'Canvas',
        contentJson: content,
        createdById: session.user.id,
        isActive: true,
      },
    });
    return;
  }

  await prisma.canvas.update({
    where: { id: canvas.id },
    data: {
      contentJson: content,
    },
  });
}

// ---------------------------------------------------------------------------
// getCanvasVersions
// ---------------------------------------------------------------------------

/**
 * List version snapshots for a canvas, ordered newest first.
 */
export async function getCanvasVersions(canvasId: string): Promise<CanvasVersionData[]> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const versions = await prisma.canvasVersion.findMany({
    where: { canvasId },
    include: {
      editor: {
        select: { id: true, name: true, image: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return versions.map((v) => ({
    id: v.id,
    canvasId: v.canvasId,
    userId: v.userId,
    userName: v.editor.name ?? 'Unknown',
    userImage: v.editor.image,
    content: v.contentJson,
    createdAt: v.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// createCanvasVersion
// ---------------------------------------------------------------------------

/**
 * Create a snapshot of the current canvas state.
 * Called automatically every 5 minutes by useYjsSync.
 */
export async function createCanvasVersion(
  canvasId: string,
  content: string,
  userId: string
): Promise<CanvasVersionData> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const version = await prisma.canvasVersion.create({
    data: {
      canvasId,
      userId,
      contentJson: content,
    },
    include: {
      editor: {
        select: { id: true, name: true, image: true },
      },
    },
  });

  return {
    id: version.id,
    canvasId: version.canvasId,
    userId: version.userId,
    userName: version.editor.name ?? 'Unknown',
    userImage: version.editor.image,
    content: version.contentJson,
    createdAt: version.createdAt,
  };
}

// ---------------------------------------------------------------------------
// restoreCanvasVersion
// ---------------------------------------------------------------------------

/**
 * Restore a version by copying its content to the canvas.
 * Returns the updated canvas data.
 */
export async function restoreCanvasVersion(
  canvasId: string,
  versionId: string
): Promise<CanvasData> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  // Fetch the version to restore
  const version = await prisma.canvasVersion.findUnique({
    where: { id: versionId },
  });

  if (!version || version.canvasId !== canvasId) {
    throw new Error('Version not found');
  }

  // Update the canvas with the version content
  const canvas = await prisma.canvas.update({
    where: { id: canvasId },
    data: {
      contentJson: version.contentJson,
    },
  });

  // Also create a new version to record the restore action
  await prisma.canvasVersion.create({
    data: {
      canvasId,
      userId: session.user.id,
      contentJson: version.contentJson,
      changeDescription: `Restored to version from ${version.createdAt.toISOString()}`,
    },
  });

  return {
    id: canvas.id,
    channelId: canvas.channelId,
    content: canvas.contentJson,
    updatedAt: canvas.updatedAt,
  };
}
