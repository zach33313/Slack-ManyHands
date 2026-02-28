/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThreadPanel } from '@/messages/components/ThreadPanel';
import { createMessage, createMockSocket, CURRENT_USER_ID, CHANNEL_ID, CHANNEL_NAME } from './setup';
import type { MessageWithMeta } from '@/shared/types';

// Mock useSocket
const mockSocket = createMockSocket();
jest.mock('@/shared/hooks/useSocket', () => ({
  useSocket: () => mockSocket,
}));

// Mock ReactionPicker
jest.mock('@/messages/components/ReactionPicker', () => ({
  ReactionPicker: ({ onSelect }: { onSelect: (emoji: string) => void }) => (
    <button data-testid="reaction-picker" onClick={() => onSelect('🎉')}>+</button>
  ),
}));

// Zustand store state — mutable for test control
let storeState: Record<string, unknown> = {};

const mockSetActiveThread = jest.fn();
const mockSetThreadMessages = jest.fn();
const mockAddThreadMessage = jest.fn();
const mockSetThreadLoading = jest.fn();
const mockIncrementReplyCount = jest.fn();

function resetStoreState(overrides: Record<string, unknown> = {}) {
  storeState = {
    activeThreadId: null,
    threadMessages: [],
    threadLoading: false,
    messagesByChannel: {},
    setActiveThread: mockSetActiveThread,
    setThreadMessages: mockSetThreadMessages,
    addThreadMessage: mockAddThreadMessage,
    setThreadLoading: mockSetThreadLoading,
    incrementReplyCount: mockIncrementReplyCount,
    ...overrides,
  };
}

jest.mock('@/messages/store', () => ({
  useMessagesStore: Object.assign(
    (selector: Function) => selector(storeState),
    {
      getState: () => storeState,
    }
  ),
}));

// Mock window.scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

describe('ThreadPanel', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    resetStoreState();
    // Default no-op fetch to prevent console.error from the component's useEffect
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, data: [], pagination: { cursor: null, hasMore: false } }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders nothing when there is no active thread', () => {
    resetStoreState({ activeThreadId: null });
    const { container } = render(
      <ThreadPanel currentUserId={CURRENT_USER_ID} channelName={CHANNEL_NAME} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when parent message is not found', () => {
    resetStoreState({
      activeThreadId: 'msg-nonexistent',
      messagesByChannel: { [CHANNEL_ID]: [] },
    });
    const { container } = render(
      <ThreadPanel currentUserId={CURRENT_USER_ID} channelName={CHANNEL_NAME} />
    );
    expect(container.firstChild).toBeNull();
  });

  describe('with active thread', () => {
    const parentMessage = createMessage({
      id: 'msg-parent',
      channelId: CHANNEL_ID,
      contentPlain: 'Parent message content',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Parent message content' }] }],
      },
      replyCount: 2,
      author: { id: CURRENT_USER_ID, name: 'Alice Smith', image: null },
    });

    const threadReplies: MessageWithMeta[] = [
      createMessage({
        id: 'reply-1',
        channelId: CHANNEL_ID,
        parentId: 'msg-parent',
        contentPlain: 'First reply',
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First reply' }] }],
        },
        author: { id: 'user-bob', name: 'Bob Jones', image: null },
      }),
      createMessage({
        id: 'reply-2',
        channelId: CHANNEL_ID,
        parentId: 'msg-parent',
        contentPlain: 'Second reply',
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second reply' }] }],
        },
        author: { id: 'user-carol', name: 'Carol White', image: null },
      }),
    ];

    beforeEach(() => {
      resetStoreState({
        activeThreadId: 'msg-parent',
        threadMessages: threadReplies,
        threadLoading: false,
        messagesByChannel: { [CHANNEL_ID]: [parentMessage] },
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          ok: true,
          data: threadReplies,
          pagination: { cursor: null, hasMore: false },
        }),
      });
    });

    it('renders the "Thread" header', () => {
      render(<ThreadPanel currentUserId={CURRENT_USER_ID} channelName={CHANNEL_NAME} />);
      expect(screen.getByText('Thread')).toBeInTheDocument();
    });

    it('renders the channel name in the header', () => {
      render(<ThreadPanel currentUserId={CURRENT_USER_ID} channelName={CHANNEL_NAME} />);
      expect(screen.getByText(`#${CHANNEL_NAME}`)).toBeInTheDocument();
    });

    it('renders close button', () => {
      render(<ThreadPanel currentUserId={CURRENT_USER_ID} channelName={CHANNEL_NAME} />);
      expect(screen.getByLabelText('Close thread')).toBeInTheDocument();
    });

    it('calls setActiveThread(null) when close button is clicked', () => {
      render(<ThreadPanel currentUserId={CURRENT_USER_ID} channelName={CHANNEL_NAME} />);
      fireEvent.click(screen.getByLabelText('Close thread'));
      expect(mockSetActiveThread).toHaveBeenCalledWith(null);
    });

    it('renders the parent message content', () => {
      render(<ThreadPanel currentUserId={CURRENT_USER_ID} channelName={CHANNEL_NAME} />);
      expect(screen.getByText('Parent message content')).toBeInTheDocument();
    });

    it('renders thread replies', () => {
      render(<ThreadPanel currentUserId={CURRENT_USER_ID} channelName={CHANNEL_NAME} />);
      expect(screen.getByText('First reply')).toBeInTheDocument();
      expect(screen.getByText('Second reply')).toBeInTheDocument();
    });

    it('renders reply count divider', () => {
      render(<ThreadPanel currentUserId={CURRENT_USER_ID} channelName={CHANNEL_NAME} />);
      expect(screen.getByText('2 replies')).toBeInTheDocument();
    });

    it('renders singular "reply" for 1 reply', () => {
      const singleReplyParent = createMessage({
        ...parentMessage,
        replyCount: 1,
      });
      resetStoreState({
        activeThreadId: 'msg-parent',
        threadMessages: [threadReplies[0]],
        threadLoading: false,
        messagesByChannel: { [CHANNEL_ID]: [singleReplyParent] },
      });
      render(<ThreadPanel currentUserId={CURRENT_USER_ID} channelName={CHANNEL_NAME} />);
      expect(screen.getByText('1 reply')).toBeInTheDocument();
    });

    it('renders the thread composer at the bottom', () => {
      render(<ThreadPanel currentUserId={CURRENT_USER_ID} channelName={CHANNEL_NAME} />);
      expect(screen.getByPlaceholderText('Reply...')).toBeInTheDocument();
    });

    it('shows loading state when threadLoading is true', () => {
      resetStoreState({
        activeThreadId: 'msg-parent',
        threadMessages: [],
        threadLoading: true,
        messagesByChannel: { [CHANNEL_ID]: [parentMessage] },
      });
      render(<ThreadPanel currentUserId={CURRENT_USER_ID} channelName={CHANNEL_NAME} />);
      expect(screen.getByText('Loading replies...')).toBeInTheDocument();
    });

    it('fetches thread replies on mount', async () => {
      const fetchMock = global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          ok: true,
          data: threadReplies,
          pagination: { cursor: null, hasMore: false },
        }),
      });

      render(<ThreadPanel currentUserId={CURRENT_USER_ID} channelName={CHANNEL_NAME} />);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith('/api/messages/msg-parent/threads');
      });
    });

    it('subscribes to thread:reply socket events', () => {
      render(<ThreadPanel currentUserId={CURRENT_USER_ID} channelName={CHANNEL_NAME} />);
      expect(mockSocket.on).toHaveBeenCalledWith('thread:reply', expect.any(Function));
    });

    it('cleans up thread:reply listener on unmount', () => {
      const { unmount } = render(
        <ThreadPanel currentUserId={CURRENT_USER_ID} channelName={CHANNEL_NAME} />
      );
      unmount();
      expect(mockSocket.off).toHaveBeenCalledWith('thread:reply', expect.any(Function));
    });
  });
});
