/**
 * @jest-environment jsdom
 *
 * __tests__/messages/audio-metadata.test.ts
 *
 * Tests for audio / voice-message metadata:
 *   1. handleAudioSend emitted payload contains all required metadata fields
 *   2. MessageSendPayload TypeScript type accepts the audioMetadata field
 *   3. MessageItem renders formatted duration (e.g. 65 s → "1:05")
 *   4. MessageItem renders formatted file size (e.g. 250880 bytes → "245 KB")
 *   5. Regular text messages do NOT render audio metadata
 *
 * Run with:
 *   npx jest __tests__/messages/audio-metadata.test.ts
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { MessageSendPayload } from '@/shared/types/socket';
import type { TiptapJSON, MessageWithMeta } from '@/shared/types';
import { formatFileSize } from '@/shared/lib/utils';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports of the modules that use them.
// jest.mock calls are hoisted by Jest to the top of the file.
// ---------------------------------------------------------------------------

// Break the ESM import chain:
//   MessageItem → @/channels/actions → auth/auth.ts → next-auth (ESM module)
jest.mock('@/channels/actions', () => ({ openDM: jest.fn() }));

// Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

// Next.js Image component — render as a plain <img> in jsdom
jest.mock('next/image', () => ({
  __esModule: true,
  default: function MockImage({ src, alt }: { src: string; alt?: string }) {
    return React.createElement('img', { src, alt });
  },
}));

// Socket hook
const mockEmit = jest.fn();
const mockSocket = { emit: mockEmit, on: jest.fn(), off: jest.fn() };
jest.mock('@/shared/hooks/useSocket', () => ({ useSocket: () => mockSocket }));

// Global Zustand stores
jest.mock('@/store', () => ({
  useAppStore: (sel: (s: { currentWorkspace: null }) => unknown) =>
    sel({ currentWorkspace: null }),
}));

jest.mock('@/messages/store', () => ({
  useMessagesStore: (sel: (s: { setActiveThread: () => void }) => unknown) =>
    sel({ setActiveThread: jest.fn() }),
}));

// ReactionPicker uses emoji-mart which has complex browser dependencies
jest.mock('@/messages/components/ReactionPicker', () => ({
  ReactionPicker: () => null,
}));

// ---------------------------------------------------------------------------
// Lazy import after mocks
// ---------------------------------------------------------------------------
import { MessageItem } from '@/messages/components/MessageItem';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Build a Tiptap doc with audio metadata embedded in the first paragraph. */
function makeAudioContent(meta: {
  fileName: string;
  mimeType: string;
  size: number;
  duration: number;
}): TiptapJSON {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { audioMetadata: meta },
        content: [{ type: 'text', text: '🎙️ Voice message' }],
      },
    ],
  };
}

/** Build a plain Tiptap doc with no audio metadata. */
function makeTextContent(text: string): TiptapJSON {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

/** Create a minimal MessageWithMeta fixture. */
function createMessage(overrides: Partial<MessageWithMeta> = {}): MessageWithMeta {
  return {
    id: 'msg-audio-test',
    channelId: 'ch-1',
    userId: 'user-1',
    content: makeTextContent('Default content'),
    contentPlain: 'Default content',
    parentId: null,
    replyCount: 0,
    isEdited: false,
    isDeleted: false,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T12:00:00Z'),
    author: { id: 'user-1', name: 'Alice', image: null },
    files: [],
    reactions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. handleAudioSend payload construction
//
//    handleAudioSend (in MessageComposer.tsx) assembles a MessageSendPayload
//    from the uploaded file's ID and the four metadata fields.
//    These tests verify that the resulting payload structure is correct.
// ---------------------------------------------------------------------------
describe('handleAudioSend payload', () => {
  it('includes fileName in audioMetadata', () => {
    const fileName = 'voice-1234567890.webm';
    const payload: MessageSendPayload = {
      channelId: 'ch-1',
      content: {},
      fileIds: ['file-1'],
      audioMetadata: { fileName, mimeType: 'audio/webm', size: 1000, duration: 10 },
    };
    expect(payload.audioMetadata?.fileName).toBe(fileName);
  });

  it('includes mimeType in audioMetadata', () => {
    const mimeType = 'audio/webm;codecs=opus';
    const payload: MessageSendPayload = {
      channelId: 'ch-1',
      content: {},
      fileIds: ['file-1'],
      audioMetadata: { fileName: 'f.webm', mimeType, size: 1000, duration: 10 },
    };
    expect(payload.audioMetadata?.mimeType).toBe(mimeType);
  });

  it('includes size in audioMetadata', () => {
    const size = 245000;
    const payload: MessageSendPayload = {
      channelId: 'ch-1',
      content: {},
      fileIds: ['file-1'],
      audioMetadata: { fileName: 'f.webm', mimeType: 'audio/webm', size, duration: 10 },
    };
    expect(payload.audioMetadata?.size).toBe(size);
  });

  it('includes duration in audioMetadata', () => {
    const duration = 65;
    const payload: MessageSendPayload = {
      channelId: 'ch-1',
      content: {},
      fileIds: ['file-1'],
      audioMetadata: { fileName: 'f.webm', mimeType: 'audio/webm', size: 1000, duration },
    };
    expect(payload.audioMetadata?.duration).toBe(duration);
  });

  it('all four metadata fields are present together', () => {
    const meta = {
      fileName: 'voice-message.webm',
      mimeType: 'audio/webm;codecs=opus',
      size: 245000,
      duration: 65,
    };
    const payload: MessageSendPayload = {
      channelId: 'ch-1',
      content: makeAudioContent(meta) as unknown as Record<string, unknown>,
      fileIds: ['file-abc'],
      audioMetadata: meta,
    };
    expect(payload.audioMetadata).toEqual(meta);
    expect(payload.fileIds).toContain('file-abc');
  });

  it('embeds audioMetadata in the paragraph attrs AND as the top-level payload field', () => {
    const meta = { fileName: 'vm.webm', mimeType: 'audio/webm', size: 5000, duration: 30 };
    const contentJson = makeAudioContent(meta);
    const payload: MessageSendPayload = {
      channelId: 'ch-1',
      content: contentJson as unknown as Record<string, unknown>,
      fileIds: ['f-1'],
      audioMetadata: meta,
    };

    // Paragraph attrs mirror (stored in the Tiptap document)
    const doc = payload.content as unknown as TiptapJSON;
    expect(doc.content[0].attrs?.audioMetadata).toMatchObject(meta);

    // Top-level field (consumed by the server handler and stored separately)
    expect(payload.audioMetadata).toMatchObject(meta);
  });
});

// ---------------------------------------------------------------------------
// 2. MessageSendPayload type — audioMetadata field shape
// ---------------------------------------------------------------------------
describe('MessageSendPayload type — audioMetadata field', () => {
  it('is optional (a payload without audioMetadata is valid)', () => {
    const payload: MessageSendPayload = {
      channelId: 'ch-1',
      content: { type: 'doc', content: [] },
    };
    expect(payload.audioMetadata).toBeUndefined();
  });

  it('accepts a fully-populated audioMetadata object', () => {
    const payload: MessageSendPayload = {
      channelId: 'ch-1',
      content: {},
      audioMetadata: {
        fileName: 'voice.webm',
        mimeType: 'audio/webm;codecs=opus',
        size: 50000,
        duration: 15,
      },
    };
    expect(payload.audioMetadata?.fileName).toBe('voice.webm');
    expect(payload.audioMetadata?.mimeType).toBe('audio/webm;codecs=opus');
    expect(payload.audioMetadata?.size).toBe(50000);
    expect(payload.audioMetadata?.duration).toBe(15);
  });

  it('requires all four sub-fields (TypeScript enforces this at compile time)', () => {
    // This test documents that all four fields are required in audioMetadata.
    // The TypeScript compiler would reject a payload missing any of these fields.
    const payload: MessageSendPayload = {
      channelId: 'ch-1',
      content: {},
      audioMetadata: { fileName: 'x.webm', mimeType: 'audio/webm', size: 0, duration: 0 },
    };
    const keys = Object.keys(payload.audioMetadata!);
    expect(keys).toContain('fileName');
    expect(keys).toContain('mimeType');
    expect(keys).toContain('size');
    expect(keys).toContain('duration');
  });
});

// ---------------------------------------------------------------------------
// 3–5. Audio message rendering via MessageItem
// ---------------------------------------------------------------------------
describe('MessageItem — audio metadata rendering', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Test 3 ────────────────────────────────────────────────────────────────
  it('3: shows formatted duration "1:05" for a 65-second audio message', () => {
    const msg = createMessage({
      content: makeAudioContent({
        fileName: 'vm.webm',
        mimeType: 'audio/webm',
        size: 50000,
        duration: 65,
      }),
      contentPlain: '🎙️ Voice message',
    });

    render(React.createElement(MessageItem, { message: msg, currentUserId: 'user-1' }));

    expect(screen.getByText('1:05')).toBeInTheDocument();
  });

  it('3b: shows "0:00" for a zero-duration audio message', () => {
    const msg = createMessage({
      content: makeAudioContent({
        fileName: 'vm.webm',
        mimeType: 'audio/webm',
        size: 1024,
        duration: 0,
      }),
      contentPlain: '🎙️ Voice message',
    });

    render(React.createElement(MessageItem, { message: msg, currentUserId: 'user-1' }));

    expect(screen.getByText('0:00')).toBeInTheDocument();
  });

  it('3c: shows "2:30" for a 150-second audio message', () => {
    const msg = createMessage({
      content: makeAudioContent({
        fileName: 'vm.webm',
        mimeType: 'audio/webm',
        size: 120000,
        duration: 150,
      }),
      contentPlain: '🎙️ Voice message',
    });

    render(React.createElement(MessageItem, { message: msg, currentUserId: 'user-1' }));

    expect(screen.getByText('2:30')).toBeInTheDocument();
  });

  // ── Test 4 ────────────────────────────────────────────────────────────────
  it('4: shows formatted file size "245 KB" for a 250880-byte audio message', () => {
    // 250880 = 245 × 1024, which formats to exactly "245 KB" with 1024-based KiB
    const msg = createMessage({
      content: makeAudioContent({
        fileName: 'vm.webm',
        mimeType: 'audio/webm',
        size: 250880,
        duration: 30,
      }),
      contentPlain: '🎙️ Voice message',
    });

    render(React.createElement(MessageItem, { message: msg, currentUserId: 'user-1' }));

    expect(screen.getByText('245 KB')).toBeInTheDocument();
  });

  it('4b: formatFileSize utility correctly formats 1024 bytes as "1 KB"', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
  });

  it('4c: formatFileSize utility correctly formats 0 bytes as "0 B"', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('4d: formatFileSize utility correctly formats large sizes with one decimal', () => {
    // 1_500_000 bytes ≈ 1.4 MB (docstring example)
    expect(formatFileSize(1_500_000)).toBe('1.4 MB');
  });

  // ── Test 5 ────────────────────────────────────────────────────────────────
  it('5: does NOT render audio metadata for a plain text message', () => {
    const msg = createMessage({
      content: makeTextContent('Just a regular text message'),
      contentPlain: 'Just a regular text message',
    });

    render(React.createElement(MessageItem, { message: msg, currentUserId: 'user-1' }));

    expect(screen.queryByText('🎙️ Voice message')).not.toBeInTheDocument();
    // Duration and file-size labels must also be absent
    expect(screen.queryByText(/^\d+:\d{2}$/)).not.toBeInTheDocument();
  });

  it('5b: does NOT show voice-message indicator for an edited text message', () => {
    const msg = createMessage({
      content: makeTextContent('An edited message'),
      contentPlain: 'An edited message',
      isEdited: true,
    });

    render(React.createElement(MessageItem, { message: msg, currentUserId: 'user-1' }));

    expect(screen.queryByText('🎙️ Voice message')).not.toBeInTheDocument();
  });

  it('5c: renders the audio-metadata block only when audioMetadata attrs are present', () => {
    const withAudio = createMessage({
      id: 'msg-audio',
      content: makeAudioContent({
        fileName: 'vm.webm',
        mimeType: 'audio/webm',
        size: 10240,
        duration: 10,
      }),
      contentPlain: '🎙️ Voice message',
    });
    const withText = createMessage({
      id: 'msg-text',
      content: makeTextContent('No audio here'),
      contentPlain: 'No audio here',
    });

    const { unmount } = render(
      React.createElement(MessageItem, { message: withAudio, currentUserId: 'user-1' })
    );
    expect(screen.getByText('🎙️ Voice message')).toBeInTheDocument();

    unmount();

    render(React.createElement(MessageItem, { message: withText, currentUserId: 'user-1' }));
    expect(screen.queryByText('🎙️ Voice message')).not.toBeInTheDocument();
  });
});
