/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MessageActions } from '@/messages/components/MessageActions';
import { createMockSocket, CURRENT_USER_ID, CHANNEL_ID } from './setup';

// Mock useSocket
const mockSocket = createMockSocket();
jest.mock('@/shared/hooks/useSocket', () => ({
  useSocket: () => mockSocket,
}));

// Mock the Zustand store
const mockSetActiveThread = jest.fn();
const mockSetUnreadIndex = jest.fn();
jest.mock('@/messages/store', () => ({
  useMessagesStore: Object.assign(
    (selector: Function) => {
      const state = {
        setActiveThread: mockSetActiveThread,
        messagesByChannel: {
          [CHANNEL_ID]: [
            { id: 'msg-1' },
            { id: 'msg-2' },
            { id: 'msg-3' },
          ],
        },
        setUnreadIndex: mockSetUnreadIndex,
      };
      return selector(state);
    },
    {
      getState: () => ({
        messagesByChannel: {
          [CHANNEL_ID]: [
            { id: 'msg-1' },
            { id: 'msg-2' },
            { id: 'msg-3' },
          ],
        },
        setUnreadIndex: mockSetUnreadIndex,
      }),
    }
  ),
}));

// Mock ReactionPicker
jest.mock('@/messages/components/ReactionPicker', () => ({
  ReactionPicker: ({ onSelect, trigger }: { onSelect: (emoji: string) => void; trigger?: React.ReactNode }) => (
    <div data-testid="reaction-picker">{trigger}</div>
  ),
}));

describe('MessageActions', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders the reply in thread button', () => {
    render(
      <MessageActions
        messageId="msg-1"
        channelId={CHANNEL_ID}
        isOwnMessage={false}
        isPinned={false}
      />
    );
    expect(screen.getByLabelText('Reply in thread')).toBeInTheDocument();
  });

  it('renders the add reaction trigger', () => {
    render(
      <MessageActions
        messageId="msg-1"
        channelId={CHANNEL_ID}
        isOwnMessage={false}
        isPinned={false}
      />
    );
    expect(screen.getByLabelText('Add reaction')).toBeInTheDocument();
  });

  it('renders the pin button', () => {
    render(
      <MessageActions
        messageId="msg-1"
        channelId={CHANNEL_ID}
        isOwnMessage={false}
        isPinned={false}
      />
    );
    expect(screen.getByLabelText('Pin message')).toBeInTheDocument();
  });

  it('renders "Unpin message" when isPinned is true', () => {
    render(
      <MessageActions
        messageId="msg-1"
        channelId={CHANNEL_ID}
        isOwnMessage={false}
        isPinned={true}
      />
    );
    expect(screen.getByLabelText('Unpin message')).toBeInTheDocument();
  });

  it('renders the more actions button', () => {
    render(
      <MessageActions
        messageId="msg-1"
        channelId={CHANNEL_ID}
        isOwnMessage={false}
        isPinned={false}
      />
    );
    expect(screen.getByLabelText('More actions')).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Edit button visibility
  // -----------------------------------------------------------------------
  describe('edit button', () => {
    it('shows edit button for own messages when onEdit is provided', () => {
      const onEdit = jest.fn();
      render(
        <MessageActions
          messageId="msg-1"
          channelId={CHANNEL_ID}
          isOwnMessage={true}
          isPinned={false}
          onEdit={onEdit}
        />
      );
      expect(screen.getByLabelText('Edit message')).toBeInTheDocument();
    });

    it('does not show edit button for other users messages', () => {
      render(
        <MessageActions
          messageId="msg-1"
          channelId={CHANNEL_ID}
          isOwnMessage={false}
          isPinned={false}
          onEdit={jest.fn()}
        />
      );
      expect(screen.queryByLabelText('Edit message')).not.toBeInTheDocument();
    });

    it('does not show edit button when onEdit is not provided', () => {
      render(
        <MessageActions
          messageId="msg-1"
          channelId={CHANNEL_ID}
          isOwnMessage={true}
          isPinned={false}
        />
      );
      expect(screen.queryByLabelText('Edit message')).not.toBeInTheDocument();
    });

    it('calls onEdit when clicking the edit button', () => {
      const onEdit = jest.fn();
      render(
        <MessageActions
          messageId="msg-1"
          channelId={CHANNEL_ID}
          isOwnMessage={true}
          isPinned={false}
          onEdit={onEdit}
        />
      );
      fireEvent.click(screen.getByLabelText('Edit message'));
      expect(onEdit).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Reply button
  // -----------------------------------------------------------------------
  describe('reply button', () => {
    it('calls setActiveThread and onReply when clicking reply', () => {
      const onReply = jest.fn();
      render(
        <MessageActions
          messageId="msg-2"
          channelId={CHANNEL_ID}
          isOwnMessage={false}
          isPinned={false}
          onReply={onReply}
        />
      );
      fireEvent.click(screen.getByLabelText('Reply in thread'));
      expect(mockSetActiveThread).toHaveBeenCalledWith('msg-2');
      expect(onReply).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Pin toggle
  // -----------------------------------------------------------------------
  describe('pin toggle', () => {
    it('calls POST /api/messages/[id]/pin when pinning', () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
      render(
        <MessageActions
          messageId="msg-1"
          channelId={CHANNEL_ID}
          isOwnMessage={false}
          isPinned={false}
        />
      );
      fireEvent.click(screen.getByLabelText('Pin message'));
      expect(global.fetch).toHaveBeenCalledWith('/api/messages/msg-1/pin', { method: 'POST' });
    });

    it('calls DELETE /api/messages/[id]/pin when unpinning', () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
      render(
        <MessageActions
          messageId="msg-1"
          channelId={CHANNEL_ID}
          isOwnMessage={false}
          isPinned={true}
        />
      );
      fireEvent.click(screen.getByLabelText('Unpin message'));
      expect(global.fetch).toHaveBeenCalledWith('/api/messages/msg-1/pin', { method: 'DELETE' });
    });
  });
});
