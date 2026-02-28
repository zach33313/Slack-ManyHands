/**
 * __tests__/messages/components/setup.ts
 *
 * Shared test utilities, mocks, and fixtures for message component tests.
 */

import type { MessageWithMeta, ReactionGroup, FileAttachment, TiptapJSON } from '@/shared/types';

// ---------------------------------------------------------------------------
// Mock socket
// ---------------------------------------------------------------------------

export function createMockSocket() {
  const listeners: Record<string, Function[]> = {};
  return {
    on: jest.fn((event: string, cb: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
    off: jest.fn((event: string, cb: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((fn) => fn !== cb);
      }
    }),
    emit: jest.fn(),
    /** Simulate the server emitting an event to this client */
    _simulateEvent: (event: string, ...args: unknown[]) => {
      (listeners[event] ?? []).forEach((cb) => cb(...args));
    },
    _listeners: listeners,
  };
}

export type MockSocket = ReturnType<typeof createMockSocket>;

// ---------------------------------------------------------------------------
// Message fixtures
// ---------------------------------------------------------------------------

const now = new Date();

function minutesAgo(minutes: number): Date {
  return new Date(now.getTime() - minutes * 60 * 1000);
}

function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function makeTiptap(text: string): TiptapJSON {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

export function createMessage(overrides: Partial<MessageWithMeta> = {}): MessageWithMeta {
  const id = overrides.id ?? `msg-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    channelId: 'channel-1',
    userId: 'user-alice',
    content: makeTiptap('Hello world'),
    contentPlain: 'Hello world',
    parentId: null,
    replyCount: 0,
    isEdited: false,
    isDeleted: false,
    editedAt: null,
    deletedAt: null,
    createdAt: now,
    author: {
      id: 'user-alice',
      name: 'Alice Smith',
      image: null,
    },
    files: [],
    reactions: [],
    ...overrides,
  };
}

/** Create a sequence of messages from the same author, spaced N minutes apart */
export function createMessageSequence(
  count: number,
  options: {
    authorId?: string;
    authorName?: string;
    channelId?: string;
    startMinutesAgo?: number;
    intervalMinutes?: number;
  } = {}
): MessageWithMeta[] {
  const {
    authorId = 'user-alice',
    authorName = 'Alice Smith',
    channelId = 'channel-1',
    startMinutesAgo = count * 2,
    intervalMinutes = 2,
  } = options;

  return Array.from({ length: count }, (_, i) => {
    const createdAt = minutesAgo(startMinutesAgo - i * intervalMinutes);
    return createMessage({
      id: `msg-seq-${i}`,
      channelId,
      userId: authorId,
      content: makeTiptap(`Message ${i + 1}`),
      contentPlain: `Message ${i + 1}`,
      createdAt,
      author: { id: authorId, name: authorName, image: null },
    });
  });
}

/** Create messages from different days for date separator testing */
export function createMultiDayMessages(): MessageWithMeta[] {
  return [
    createMessage({
      id: 'msg-old',
      contentPlain: 'Old message',
      content: makeTiptap('Old message'),
      createdAt: daysAgo(3),
    }),
    createMessage({
      id: 'msg-yesterday',
      contentPlain: 'Yesterday message',
      content: makeTiptap('Yesterday message'),
      createdAt: daysAgo(1),
    }),
    createMessage({
      id: 'msg-today',
      contentPlain: 'Today message',
      content: makeTiptap('Today message'),
      createdAt: now,
    }),
  ];
}

export function createReactions(): ReactionGroup[] {
  return [
    { emoji: '👍', count: 3, userIds: ['user-alice', 'user-bob', 'user-carol'] },
    { emoji: '❤️', count: 1, userIds: ['user-alice'] },
  ];
}

export function createFileAttachment(overrides: Partial<FileAttachment> = {}): FileAttachment {
  return {
    id: 'file-1',
    name: 'document.pdf',
    url: '/uploads/document.pdf',
    size: 1024 * 100,
    mimeType: 'application/pdf',
    width: null,
    height: null,
    ...overrides,
  };
}

export function createImageAttachment(overrides: Partial<FileAttachment> = {}): FileAttachment {
  return {
    id: 'img-1',
    name: 'screenshot.png',
    url: '/uploads/screenshot.png',
    size: 1024 * 500,
    mimeType: 'image/png',
    width: 800,
    height: 600,
    ...overrides,
  };
}

export const CURRENT_USER_ID = 'user-alice';
export const OTHER_USER_ID = 'user-bob';
export const CHANNEL_ID = 'channel-1';
export const CHANNEL_NAME = 'general';
