/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MessageList } from '@/messages/components/MessageList';
import {
  createMessage,
  createMockSocket,
  createMultiDayMessages,
  CURRENT_USER_ID,
  CHANNEL_ID,
  CHANNEL_NAME,
} from './setup';
import type { MessageWithMeta } from '@/shared/types';

// Mock useSocket
const mockSocket = createMockSocket();
jest.mock('@/shared/hooks/useSocket', () => ({
  useSocket: () => mockSocket,
}));

// Mock ReactionPicker to avoid emoji-mart complexity
jest.mock('@/messages/components/ReactionPicker', () => ({
  ReactionPicker: ({ onSelect }: { onSelect: (emoji: string) => void }) => (
    <button data-testid="reaction-picker" onClick={() => onSelect('🎉')}>+</button>
  ),
}));

// Zustand store state — mutable for test control
let storeState: Record<string, unknown> = {};

function resetStoreState(overrides: Record<string, unknown> = {}) {
  storeState = {
    messagesByChannel: {},
    loadingByChannel: {},
    hasMoreByChannel: {},
    unreadIndexByChannel: {},
    isAtBottom: true,
    unseenCount: 0,
    setMessages: jest.fn((channelId: string, messages: MessageWithMeta[]) => {
      storeState.messagesByChannel = {
        ...(storeState.messagesByChannel as Record<string, MessageWithMeta[]>),
        [channelId]: messages,
      };
    }),
    prependMessages: jest.fn(),
    addMessage: jest.fn(),
    updateMessage: jest.fn(),
    deleteMessage: jest.fn(),
    setReactions: jest.fn(),
    setLoading: jest.fn(),
    setHasMore: jest.fn(),
    setIsAtBottom: jest.fn(),
    incrementUnseen: jest.fn(),
    resetUnseen: jest.fn(),
    incrementReplyCount: jest.fn(),
    setActiveThread: jest.fn(),
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

// Mock GroupedVirtuoso to simplify testing — render items directly
jest.mock('react-virtuoso', () => ({
  GroupedVirtuoso: React.forwardRef(function MockGroupedVirtuoso(
    props: {
      groupCounts: number[];
      groupContent: (index: number) => React.ReactNode;
      itemContent: (index: number) => React.ReactNode;
      firstItemIndex: number;
      components?: { Header?: React.ComponentType };
    },
    _ref: React.Ref<unknown>
  ) {
    const { groupCounts, groupContent, itemContent, firstItemIndex, components } = props;
    const Header = components?.Header;
    let globalItemIdx = firstItemIndex;

    return (
      <div data-testid="grouped-virtuoso">
        {Header && <Header />}
        {groupCounts.map((count, groupIdx) => (
          <div key={`group-${groupIdx}`}>
            {groupContent(groupIdx)}
            {Array.from({ length: count }, (_, itemIdx) => {
              const idx = globalItemIdx++;
              return (
                <div key={`item-${idx}`} data-testid={`message-item-${idx - firstItemIndex}`}>
                  {itemContent(idx)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }),
}));

// Helper to create a mock fetch that returns the given data
function mockFetch(data: unknown[] = [], hasMore = false, cursor: string | null = null) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      ok: true,
      data,
      pagination: { cursor, hasMore },
    }),
  });
  return global.fetch as jest.Mock;
}

describe('MessageList', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    resetStoreState();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------
  describe('empty state', () => {
    it('renders empty state when no messages after load', async () => {
      mockFetch([]);

      render(
        <MessageList channelId={CHANNEL_ID} channelName={CHANNEL_NAME} currentUserId={CURRENT_USER_ID} />
      );

      await waitFor(() => {
        expect(screen.getByText('No messages yet')).toBeInTheDocument();
      });
      expect(screen.getByText('Start the conversation!')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Loading messages
  // -----------------------------------------------------------------------
  describe('loading messages', () => {
    it('fetches messages on mount', async () => {
      const fetchMock = mockFetch([createMessage({ id: 'msg-1', contentPlain: 'First message' })]);

      render(
        <MessageList channelId={CHANNEL_ID} channelName={CHANNEL_NAME} currentUserId={CURRENT_USER_ID} />
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining(`/api/channels/${CHANNEL_ID}/messages`)
        );
      });
    });

    it('calls setMessages with reversed data (oldest first)', async () => {
      const messages = [
        createMessage({ id: 'msg-2', contentPlain: 'Newer', createdAt: new Date() }),
        createMessage({ id: 'msg-1', contentPlain: 'Older', createdAt: new Date(Date.now() - 60000) }),
      ];

      mockFetch(messages);

      render(
        <MessageList channelId={CHANNEL_ID} channelName={CHANNEL_NAME} currentUserId={CURRENT_USER_ID} />
      );

      await waitFor(() => {
        expect((storeState.setMessages as jest.Mock)).toHaveBeenCalled();
      });

      const call = (storeState.setMessages as jest.Mock).mock.calls[0];
      expect(call[0]).toBe(CHANNEL_ID);
      // API returns [newer, older], store should receive [older, newer] (reversed)
      expect(call[1][0].id).toBe('msg-1');
      expect(call[1][1].id).toBe('msg-2');
    });
  });

  // -----------------------------------------------------------------------
  // Date separators
  // -----------------------------------------------------------------------
  describe('date separators', () => {
    it('renders date separator labels for messages from different days', async () => {
      const multiDayMessages = createMultiDayMessages();

      // Pre-load messages into store
      resetStoreState({
        messagesByChannel: { [CHANNEL_ID]: multiDayMessages },
        hasMoreByChannel: { [CHANNEL_ID]: false },
      });

      mockFetch([...multiDayMessages].reverse());

      render(
        <MessageList channelId={CHANNEL_ID} channelName={CHANNEL_NAME} currentUserId={CURRENT_USER_ID} />
      );

      // The grouped virtuoso mock renders groupContent with dates
      // We should see at least "Today" and "Yesterday" labels
      await waitFor(() => {
        expect(screen.getByText('Today')).toBeInTheDocument();
      });
      expect(screen.getByText('Yesterday')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Scroll-to-bottom button
  // -----------------------------------------------------------------------
  describe('scroll-to-bottom button', () => {
    it('shows scroll-to-bottom button when not at bottom', async () => {
      resetStoreState({
        messagesByChannel: { [CHANNEL_ID]: [createMessage()] },
        isAtBottom: false,
        unseenCount: 0,
      });

      mockFetch([createMessage()]);

      render(
        <MessageList channelId={CHANNEL_ID} channelName={CHANNEL_NAME} currentUserId={CURRENT_USER_ID} />
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Scroll to bottom')).toBeInTheDocument();
      });
    });

    it('does not show scroll-to-bottom button when at bottom', async () => {
      resetStoreState({
        messagesByChannel: { [CHANNEL_ID]: [createMessage()] },
        isAtBottom: true,
        unseenCount: 0,
      });

      mockFetch([createMessage()]);

      render(
        <MessageList channelId={CHANNEL_ID} channelName={CHANNEL_NAME} currentUserId={CURRENT_USER_ID} />
      );

      await waitFor(() => {
        expect(screen.getByTestId('grouped-virtuoso')).toBeInTheDocument();
      });
      expect(screen.queryByLabelText('Scroll to bottom')).not.toBeInTheDocument();
    });

    it('shows unread count badge on scroll-to-bottom button', async () => {
      resetStoreState({
        messagesByChannel: { [CHANNEL_ID]: [createMessage()] },
        isAtBottom: false,
        unseenCount: 5,
      });

      mockFetch([createMessage()]);

      render(
        <MessageList channelId={CHANNEL_ID} channelName={CHANNEL_NAME} currentUserId={CURRENT_USER_ID} />
      );

      await waitFor(() => {
        expect(screen.getByText('5')).toBeInTheDocument();
      });
    });

    it('shows 99+ for large unread counts', async () => {
      resetStoreState({
        messagesByChannel: { [CHANNEL_ID]: [createMessage()] },
        isAtBottom: false,
        unseenCount: 150,
      });

      mockFetch([createMessage()]);

      render(
        <MessageList channelId={CHANNEL_ID} channelName={CHANNEL_NAME} currentUserId={CURRENT_USER_ID} />
      );

      await waitFor(() => {
        expect(screen.getByText('99+')).toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // Socket.IO event listeners
  // -----------------------------------------------------------------------
  describe('socket events', () => {
    it('registers socket event listeners on mount', async () => {
      mockFetch([]);

      render(
        <MessageList channelId={CHANNEL_ID} channelName={CHANNEL_NAME} currentUserId={CURRENT_USER_ID} />
      );

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('message:new', expect.any(Function));
      });
      expect(mockSocket.on).toHaveBeenCalledWith('message:updated', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('message:deleted', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('reaction:updated', expect.any(Function));
    });

    it('cleans up socket listeners on unmount', async () => {
      mockFetch([]);

      const { unmount } = render(
        <MessageList channelId={CHANNEL_ID} channelName={CHANNEL_NAME} currentUserId={CURRENT_USER_ID} />
      );

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('message:new', expect.any(Function));
      });

      unmount();

      expect(mockSocket.off).toHaveBeenCalledWith('message:new', expect.any(Function));
      expect(mockSocket.off).toHaveBeenCalledWith('message:updated', expect.any(Function));
      expect(mockSocket.off).toHaveBeenCalledWith('message:deleted', expect.any(Function));
      expect(mockSocket.off).toHaveBeenCalledWith('reaction:updated', expect.any(Function));
    });
  });

  // -----------------------------------------------------------------------
  // Compact mode groups in rendered list
  // -----------------------------------------------------------------------
  describe('compact mode grouping', () => {
    it('passes previousMessage to MessageItem for compact mode detection', async () => {
      const now = new Date();
      const messages = [
        createMessage({
          id: 'msg-1',
          userId: 'user-alice',
          contentPlain: 'First message',
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First message' }] }] },
          createdAt: new Date(now.getTime() - 2 * 60 * 1000),
          author: { id: 'user-alice', name: 'Alice Smith', image: null },
        }),
        createMessage({
          id: 'msg-2',
          userId: 'user-alice',
          contentPlain: 'Second message',
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second message' }] }] },
          createdAt: now,
          author: { id: 'user-alice', name: 'Alice Smith', image: null },
        }),
      ];

      resetStoreState({
        messagesByChannel: { [CHANNEL_ID]: messages },
      });

      mockFetch([...messages].reverse());

      render(
        <MessageList channelId={CHANNEL_ID} channelName={CHANNEL_NAME} currentUserId={CURRENT_USER_ID} />
      );

      await waitFor(() => {
        expect(screen.getByText('First message')).toBeInTheDocument();
      });

      // First message should show author name (full mode)
      // Second message should be compact (same author, within 5 min)
      const authorNames = screen.getAllByText('Alice Smith');
      // Only one instance of the name should appear (full mode on first message)
      expect(authorNames).toHaveLength(1);
    });
  });
});
