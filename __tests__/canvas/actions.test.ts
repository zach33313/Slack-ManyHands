/**
 * Tests for canvas/actions.ts
 *
 * Covers:
 * - getCanvas: find-or-create canvas for a channel
 * - saveCanvas: update content, create if missing
 * - getCanvasVersions: list snapshots ordered newest-first
 * - createCanvasVersion: insert new snapshot
 * - restoreCanvasVersion: copy version content back to canvas, create restore snapshot
 */

// Mock auth
jest.mock('@/auth/auth', () => ({
  auth: jest.fn(),
}));

// Mock prisma
jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    canvas: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    canvasVersion: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

import { auth } from '@/auth/auth';
import { prisma } from '@/shared/lib/prisma';
import {
  getCanvas,
  saveCanvas,
  getCanvasVersions,
  createCanvasVersion,
  restoreCanvasVersion,
} from '@/canvas/actions';

const mockedAuth = auth as jest.MockedFunction<typeof auth>;
const mockedPrisma = prisma as any;

function mockSession(userId = 'user-1') {
  (mockedAuth as jest.Mock).mockResolvedValue({
    user: { id: userId, name: 'Test User', email: 'test@test.com' },
  });
}

function mockNoSession() {
  (mockedAuth as jest.Mock).mockResolvedValue(null);
}

// ---------------------------------------------------------------------------
// getCanvas
// ---------------------------------------------------------------------------

describe('getCanvas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession();
  });

  it('returns existing canvas when found', async () => {
    const existingCanvas = {
      id: 'canvas-1',
      channelId: 'ch-1',
      contentJson: '{"type":"doc","content":[]}',
      updatedAt: new Date('2026-01-15'),
    };
    mockedPrisma.canvas.findFirst.mockResolvedValue(existingCanvas);

    const result = await getCanvas('ch-1');

    expect(mockedPrisma.canvas.findFirst).toHaveBeenCalledWith({
      where: { channelId: 'ch-1', isActive: true },
    });
    expect(mockedPrisma.canvas.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: 'canvas-1',
      channelId: 'ch-1',
      content: '{"type":"doc","content":[]}',
      updatedAt: existingCanvas.updatedAt,
    });
  });

  it('creates new canvas when none exists for channel', async () => {
    mockedPrisma.canvas.findFirst.mockResolvedValue(null);
    const newCanvas = {
      id: 'canvas-new',
      channelId: 'ch-1',
      contentJson: '{"type":"doc","content":[]}',
      updatedAt: new Date('2026-01-20'),
    };
    mockedPrisma.canvas.create.mockResolvedValue(newCanvas);

    const result = await getCanvas('ch-1');

    expect(mockedPrisma.canvas.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channelId: 'ch-1',
        name: 'Canvas',
        createdById: 'user-1',
        isActive: true,
      }),
    });
    expect(result.id).toBe('canvas-new');
    expect(result.channelId).toBe('ch-1');
  });

  it('throws Unauthorized when no session', async () => {
    mockNoSession();

    await expect(getCanvas('ch-1')).rejects.toThrow('Unauthorized');
    expect(mockedPrisma.canvas.findFirst).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// saveCanvas
// ---------------------------------------------------------------------------

describe('saveCanvas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession();
  });

  it('updates existing canvas content', async () => {
    const existingCanvas = { id: 'canvas-1', channelId: 'ch-1' };
    mockedPrisma.canvas.findFirst.mockResolvedValue(existingCanvas);
    mockedPrisma.canvas.update.mockResolvedValue({});

    await saveCanvas('ch-1', 'new-content-base64');

    expect(mockedPrisma.canvas.update).toHaveBeenCalledWith({
      where: { id: 'canvas-1' },
      data: { contentJson: 'new-content-base64' },
    });
    expect(mockedPrisma.canvas.create).not.toHaveBeenCalled();
  });

  it('creates new canvas when none exists (upsert behaviour)', async () => {
    mockedPrisma.canvas.findFirst.mockResolvedValue(null);
    mockedPrisma.canvas.create.mockResolvedValue({ id: 'canvas-new' });

    await saveCanvas('ch-new', 'some-content');

    expect(mockedPrisma.canvas.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channelId: 'ch-new',
        contentJson: 'some-content',
        createdById: 'user-1',
        isActive: true,
      }),
    });
    expect(mockedPrisma.canvas.update).not.toHaveBeenCalled();
  });

  it('throws Unauthorized when no session', async () => {
    mockNoSession();

    await expect(saveCanvas('ch-1', 'content')).rejects.toThrow('Unauthorized');
  });
});

// ---------------------------------------------------------------------------
// getCanvasVersions
// ---------------------------------------------------------------------------

describe('getCanvasVersions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession();
  });

  it('returns versions ordered newest-first with mapped fields', async () => {
    const dbVersions = [
      {
        id: 'v-2',
        canvasId: 'canvas-1',
        userId: 'user-1',
        contentJson: 'content-v2',
        createdAt: new Date('2026-01-20'),
        editor: { id: 'user-1', name: 'Alice', image: '/alice.png' },
      },
      {
        id: 'v-1',
        canvasId: 'canvas-1',
        userId: 'user-2',
        contentJson: 'content-v1',
        createdAt: new Date('2026-01-10'),
        editor: { id: 'user-2', name: 'Bob', image: null },
      },
    ];
    mockedPrisma.canvasVersion.findMany.mockResolvedValue(dbVersions);

    const result = await getCanvasVersions('canvas-1');

    expect(mockedPrisma.canvasVersion.findMany).toHaveBeenCalledWith({
      where: { canvasId: 'canvas-1' },
      include: {
        editor: { select: { id: true, name: true, image: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'v-2',
      canvasId: 'canvas-1',
      userId: 'user-1',
      userName: 'Alice',
      userImage: '/alice.png',
      content: 'content-v2',
      createdAt: dbVersions[0].createdAt,
    });
    expect(result[1].userName).toBe('Bob');
    expect(result[1].userImage).toBeNull();
  });

  it('uses "Unknown" when editor name is null', async () => {
    mockedPrisma.canvasVersion.findMany.mockResolvedValue([
      {
        id: 'v-1',
        canvasId: 'canvas-1',
        userId: 'user-1',
        contentJson: 'content',
        createdAt: new Date(),
        editor: { id: 'user-1', name: null, image: null },
      },
    ]);

    const result = await getCanvasVersions('canvas-1');

    expect(result[0].userName).toBe('Unknown');
  });

  it('returns empty array when no versions exist', async () => {
    mockedPrisma.canvasVersion.findMany.mockResolvedValue([]);

    const result = await getCanvasVersions('canvas-1');

    expect(result).toEqual([]);
  });

  it('throws Unauthorized when no session', async () => {
    mockNoSession();

    await expect(getCanvasVersions('canvas-1')).rejects.toThrow('Unauthorized');
  });
});

// ---------------------------------------------------------------------------
// createCanvasVersion
// ---------------------------------------------------------------------------

describe('createCanvasVersion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession();
  });

  it('creates a version snapshot with editor info', async () => {
    const dbVersion = {
      id: 'v-new',
      canvasId: 'canvas-1',
      userId: 'user-1',
      contentJson: 'snapshot-content',
      createdAt: new Date('2026-01-25'),
      editor: { id: 'user-1', name: 'Alice', image: '/alice.png' },
    };
    mockedPrisma.canvasVersion.create.mockResolvedValue(dbVersion);

    const result = await createCanvasVersion('canvas-1', 'snapshot-content', 'user-1');

    expect(mockedPrisma.canvasVersion.create).toHaveBeenCalledWith({
      data: {
        canvasId: 'canvas-1',
        userId: 'user-1',
        contentJson: 'snapshot-content',
      },
      include: {
        editor: { select: { id: true, name: true, image: true } },
      },
    });

    expect(result).toEqual({
      id: 'v-new',
      canvasId: 'canvas-1',
      userId: 'user-1',
      userName: 'Alice',
      userImage: '/alice.png',
      content: 'snapshot-content',
      createdAt: dbVersion.createdAt,
    });
  });

  it('throws Unauthorized when no session', async () => {
    mockNoSession();

    await expect(
      createCanvasVersion('canvas-1', 'content', 'user-1')
    ).rejects.toThrow('Unauthorized');
  });
});

// ---------------------------------------------------------------------------
// restoreCanvasVersion
// ---------------------------------------------------------------------------

describe('restoreCanvasVersion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession();
  });

  it('restores version content to canvas and creates a restore snapshot', async () => {
    const version = {
      id: 'v-1',
      canvasId: 'canvas-1',
      contentJson: 'restored-content',
      createdAt: new Date('2026-01-10'),
    };
    mockedPrisma.canvasVersion.findUnique.mockResolvedValue(version);

    const updatedCanvas = {
      id: 'canvas-1',
      channelId: 'ch-1',
      contentJson: 'restored-content',
      updatedAt: new Date('2026-01-25'),
    };
    mockedPrisma.canvas.update.mockResolvedValue(updatedCanvas);
    mockedPrisma.canvasVersion.create.mockResolvedValue({ id: 'v-restore' });

    const result = await restoreCanvasVersion('canvas-1', 'v-1');

    // Canvas updated with version content
    expect(mockedPrisma.canvas.update).toHaveBeenCalledWith({
      where: { id: 'canvas-1' },
      data: { contentJson: 'restored-content' },
    });

    // Restore snapshot created
    expect(mockedPrisma.canvasVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        canvasId: 'canvas-1',
        userId: 'user-1',
        contentJson: 'restored-content',
        changeDescription: expect.stringContaining('Restored'),
      }),
    });

    expect(result).toEqual({
      id: 'canvas-1',
      channelId: 'ch-1',
      content: 'restored-content',
      updatedAt: updatedCanvas.updatedAt,
    });
  });

  it('throws "Version not found" when version does not exist', async () => {
    mockedPrisma.canvasVersion.findUnique.mockResolvedValue(null);

    await expect(
      restoreCanvasVersion('canvas-1', 'nonexistent-version')
    ).rejects.toThrow('Version not found');

    expect(mockedPrisma.canvas.update).not.toHaveBeenCalled();
  });

  it('throws "Version not found" when version belongs to a different canvas', async () => {
    mockedPrisma.canvasVersion.findUnique.mockResolvedValue({
      id: 'v-1',
      canvasId: 'canvas-OTHER', // different canvas
      contentJson: 'content',
      createdAt: new Date(),
    });

    await expect(
      restoreCanvasVersion('canvas-1', 'v-1')
    ).rejects.toThrow('Version not found');

    expect(mockedPrisma.canvas.update).not.toHaveBeenCalled();
  });

  it('throws Unauthorized when no session', async () => {
    mockNoSession();

    await expect(
      restoreCanvasVersion('canvas-1', 'v-1')
    ).rejects.toThrow('Unauthorized');
  });
});
