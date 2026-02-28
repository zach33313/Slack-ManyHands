/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChannelType } from '@/shared/types';
import type { MessageWithMeta } from '@/shared/types';

// Mock UI components
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mutable store state
let storeState: Record<string, unknown> = {};
const mockCloseThread = jest.fn();
const mockSetRightPanelView = jest.fn();

function createMessage(overrides: Partial<MessageWithMeta> = {}): MessageWithMeta {
  return {
    id: 'msg-1',
    channelId: 'ch-1',
    userId: 'user-1',
    content: { type: 'doc', content: [] },
    contentPlain: 'Test message',
    parentId: null,
    replyCount: 0,
    isEdited: false,
    isDeleted: false,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date('2024-01-15T10:30:00Z'),
    author: { id: 'user-1', name: 'Alice Smith', image: null },
    files: [],
    reactions: [],
    ...overrides,
  };
}

function resetStoreState(overrides: Record<string, unknown> = {}) {
  storeState = {
    rightPanelView: null,
    setRightPanelView: mockSetRightPanelView,
    activeThread: null,
    threadReplies: [],
    closeThread: mockCloseThread,
    currentChannel: null,
    presenceMap: {},
    ...overrides,
  };
}

jest.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: Function) => selector(storeState),
    { getState: () => storeState }
  ),
}));

import { RightPanel } from '@/components/layout/RightPanel';

describe('RightPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStoreState();
  });

  it('renders nothing when rightPanelView is null', () => {
    resetStoreState({ rightPanelView: null });
    const { container } = render(<RightPanel />);
    expect(container.firstChild).toBeNull();
  });

  // --- Thread Panel ---

  describe('thread view', () => {
    it('shows "No thread selected" when no activeThread', () => {
      resetStoreState({ rightPanelView: 'thread', activeThread: null });
      render(<RightPanel />);
      expect(screen.getByText('No thread selected')).toBeInTheDocument();
    });

    it('renders Thread header with active thread', () => {
      const msg = createMessage({ contentPlain: 'Parent message' });
      resetStoreState({
        rightPanelView: 'thread',
        activeThread: msg,
        threadReplies: [],
      });
      render(<RightPanel />);
      expect(screen.getByText('Thread')).toBeInTheDocument();
    });

    it('renders the parent message content', () => {
      const msg = createMessage({ contentPlain: 'Parent message content' });
      resetStoreState({
        rightPanelView: 'thread',
        activeThread: msg,
        threadReplies: [],
      });
      render(<RightPanel />);
      expect(screen.getByText('Parent message content')).toBeInTheDocument();
    });

    it('renders the parent message author name', () => {
      const msg = createMessage({
        author: { id: 'u1', name: 'Alice Smith', image: null },
      });
      resetStoreState({
        rightPanelView: 'thread',
        activeThread: msg,
        threadReplies: [],
      });
      render(<RightPanel />);
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    it('renders thread replies', () => {
      const parent = createMessage({ id: 'msg-1' });
      const replies: MessageWithMeta[] = [
        createMessage({
          id: 'reply-1',
          contentPlain: 'First reply',
          author: { id: 'u2', name: 'Bob', image: null },
        }),
        createMessage({
          id: 'reply-2',
          contentPlain: 'Second reply',
          author: { id: 'u3', name: 'Carol', image: null },
        }),
      ];
      resetStoreState({
        rightPanelView: 'thread',
        activeThread: parent,
        threadReplies: replies,
      });
      render(<RightPanel />);
      expect(screen.getByText('First reply')).toBeInTheDocument();
      expect(screen.getByText('Second reply')).toBeInTheDocument();
    });

    it('shows reply count divider', () => {
      const parent = createMessage({ id: 'msg-1' });
      const replies = [
        createMessage({ id: 'r1', contentPlain: 'Reply 1' }),
        createMessage({ id: 'r2', contentPlain: 'Reply 2' }),
      ];
      resetStoreState({
        rightPanelView: 'thread',
        activeThread: parent,
        threadReplies: replies,
      });
      render(<RightPanel />);
      expect(screen.getByText(/2\s+replies/)).toBeInTheDocument();
    });

    it('shows singular "reply" for 1 reply', () => {
      const parent = createMessage({ id: 'msg-1' });
      const replies = [createMessage({ id: 'r1', contentPlain: 'Only reply' })];
      resetStoreState({
        rightPanelView: 'thread',
        activeThread: parent,
        threadReplies: replies,
      });
      render(<RightPanel />);
      expect(screen.getByText(/1\s+reply/)).toBeInTheDocument();
    });

    it('calls closeThread when close button is clicked', () => {
      const msg = createMessage();
      resetStoreState({
        rightPanelView: 'thread',
        activeThread: msg,
        threadReplies: [],
      });
      render(<RightPanel />);
      // The close button contains an X icon — find it by its role
      const buttons = screen.getAllByRole('button');
      // Close button is the one in the header
      fireEvent.click(buttons[0]);
      expect(mockCloseThread).toHaveBeenCalled();
    });
  });

  // --- Members Panel ---

  describe('members view', () => {
    it('renders Members header', () => {
      resetStoreState({ rightPanelView: 'members' });
      render(<RightPanel />);
      expect(screen.getByText('Members')).toBeInTheDocument();
    });

    it('calls setRightPanelView(null) when close button is clicked', () => {
      resetStoreState({ rightPanelView: 'members' });
      render(<RightPanel />);
      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[0]);
      expect(mockSetRightPanelView).toHaveBeenCalledWith(null);
    });
  });

  // --- Channel Info Panel ---

  describe('channel-info view', () => {
    it('renders Channel Details header', () => {
      resetStoreState({ rightPanelView: 'channel-info' });
      render(<RightPanel />);
      expect(screen.getByText('Channel Details')).toBeInTheDocument();
    });

    it('displays channel name', () => {
      resetStoreState({
        rightPanelView: 'channel-info',
        currentChannel: {
          id: 'ch-1',
          name: 'general',
          description: 'Main channel',
          type: ChannelType.PUBLIC,
          createdAt: new Date('2024-01-01'),
        },
      });
      render(<RightPanel />);
      expect(screen.getByText('#general')).toBeInTheDocument();
    });

    it('displays channel description', () => {
      resetStoreState({
        rightPanelView: 'channel-info',
        currentChannel: {
          id: 'ch-1',
          name: 'general',
          description: 'Main discussion channel',
          type: ChannelType.PUBLIC,
          createdAt: new Date('2024-01-01'),
        },
      });
      render(<RightPanel />);
      expect(screen.getByText('Main discussion channel')).toBeInTheDocument();
    });

    it('displays channel type', () => {
      resetStoreState({
        rightPanelView: 'channel-info',
        currentChannel: {
          id: 'ch-1',
          name: 'general',
          description: null,
          type: ChannelType.PUBLIC,
          createdAt: new Date('2024-01-01'),
        },
      });
      render(<RightPanel />);
      expect(screen.getByText('public')).toBeInTheDocument();
    });

    it('calls setRightPanelView(null) when close button is clicked', () => {
      resetStoreState({ rightPanelView: 'channel-info' });
      render(<RightPanel />);
      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[0]);
      expect(mockSetRightPanelView).toHaveBeenCalledWith(null);
    });
  });
});
