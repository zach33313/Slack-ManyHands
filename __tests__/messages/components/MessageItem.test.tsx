/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MessageItem } from '@/messages/components/MessageItem';
import {
  createMessage,
  createMockSocket,
  createReactions,
  createFileAttachment,
  createImageAttachment,
  CURRENT_USER_ID,
  OTHER_USER_ID,
} from './setup';

// Mock useSocket
const mockSocket = createMockSocket();
jest.mock('@/shared/hooks/useSocket', () => ({
  useSocket: () => mockSocket,
}));

// Mock the Zustand store
const mockSetActiveThread = jest.fn();
jest.mock('@/messages/store', () => ({
  useMessagesStore: (selector: Function) => {
    const state = {
      setActiveThread: mockSetActiveThread,
    };
    return selector(state);
  },
}));

// Mock ReactionPicker to avoid emoji-mart complexity
jest.mock('@/messages/components/ReactionPicker', () => ({
  ReactionPicker: ({ onSelect }: { onSelect: (emoji: string) => void }) => (
    <button data-testid="reaction-picker" onClick={() => onSelect('🎉')}>
      +
    </button>
  ),
}));

describe('MessageItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Full mode rendering
  // -----------------------------------------------------------------------
  describe('full mode', () => {
    it('renders author name', () => {
      const msg = createMessage({ author: { id: 'user-alice', name: 'Alice Smith', image: null } });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    it('renders the message content', () => {
      const msg = createMessage({ contentPlain: 'Hello world' });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);
      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });

    it('renders avatar with initials when no image is set', () => {
      const msg = createMessage({ author: { id: 'user-alice', name: 'Alice Smith', image: null } });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);
      expect(screen.getByLabelText('Alice Smith')).toBeInTheDocument();
      expect(screen.getByText('AS')).toBeInTheDocument();
    });

    it('renders avatar image when available', () => {
      const msg = createMessage({
        author: { id: 'user-alice', name: 'Alice Smith', image: '/avatar.png' },
      });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);
      const img = screen.getByAltText('Alice Smith') as HTMLImageElement;
      expect(img).toBeInTheDocument();
      // Shared UserAvatar uses Next.js Image which encodes URLs via /_next/image
      expect(img.src).toContain(encodeURIComponent('/avatar.png'));
    });

    it('renders the message timestamp', () => {
      const msg = createMessage({ createdAt: new Date() });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);
      // formatMessageTime for today returns "h:mm a" format
      // We just check there's a time element present
      const timeElements = screen.getAllByText(/\d{1,2}:\d{2}/);
      expect(timeElements.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Compact mode
  // -----------------------------------------------------------------------
  describe('compact mode', () => {
    it('does not render avatar or author name for consecutive messages from same author within 5 minutes', () => {
      const now = new Date();
      const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

      const prevMsg = createMessage({
        id: 'msg-1',
        userId: 'user-alice',
        createdAt: twoMinutesAgo,
        author: { id: 'user-alice', name: 'Alice Smith', image: null },
      });
      const msg = createMessage({
        id: 'msg-2',
        userId: 'user-alice',
        contentPlain: 'Follow up message',
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Follow up message' }] }],
        },
        createdAt: now,
        author: { id: 'user-alice', name: 'Alice Smith', image: null },
      });

      render(
        <MessageItem message={msg} previousMessage={prevMsg} currentUserId={CURRENT_USER_ID} />
      );

      // The message content should be rendered
      expect(screen.getByText('Follow up message')).toBeInTheDocument();
      // But author name should NOT be rendered in compact mode
      expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
    });

    it('shows full mode when different authors', () => {
      const now = new Date();
      const prevMsg = createMessage({
        id: 'msg-1',
        userId: OTHER_USER_ID,
        createdAt: new Date(now.getTime() - 60 * 1000),
        author: { id: OTHER_USER_ID, name: 'Bob Jones', image: null },
      });
      const msg = createMessage({
        id: 'msg-2',
        userId: CURRENT_USER_ID,
        createdAt: now,
        author: { id: CURRENT_USER_ID, name: 'Alice Smith', image: null },
      });

      render(
        <MessageItem message={msg} previousMessage={prevMsg} currentUserId={CURRENT_USER_ID} />
      );

      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    it('shows full mode when same author but more than 5 minutes apart', () => {
      const now = new Date();
      const sixMinutesAgo = new Date(now.getTime() - 6 * 60 * 1000);

      const prevMsg = createMessage({
        id: 'msg-1',
        userId: CURRENT_USER_ID,
        createdAt: sixMinutesAgo,
        author: { id: CURRENT_USER_ID, name: 'Alice Smith', image: null },
      });
      const msg = createMessage({
        id: 'msg-2',
        userId: CURRENT_USER_ID,
        createdAt: now,
        author: { id: CURRENT_USER_ID, name: 'Alice Smith', image: null },
      });

      render(
        <MessageItem message={msg} previousMessage={prevMsg} currentUserId={CURRENT_USER_ID} />
      );

      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    it('shows full mode when no previous message', () => {
      const msg = createMessage({
        author: { id: CURRENT_USER_ID, name: 'Alice Smith', image: null },
      });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Edited / Deleted states
  // -----------------------------------------------------------------------
  describe('edited and deleted states', () => {
    it('shows "(edited)" indicator when isEdited is true', () => {
      const msg = createMessage({ isEdited: true });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);
      expect(screen.getByText('(edited)')).toBeInTheDocument();
    });

    it('does not show "(edited)" when isEdited is false', () => {
      const msg = createMessage({ isEdited: false });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);
      expect(screen.queryByText('(edited)')).not.toBeInTheDocument();
    });

    it('shows deleted placeholder when isDeleted is true', () => {
      const msg = createMessage({ isDeleted: true, deletedAt: new Date() });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);
      expect(screen.getByText('[This message was deleted]')).toBeInTheDocument();
    });

    it('does not render message content when deleted', () => {
      const msg = createMessage({
        isDeleted: true,
        deletedAt: new Date(),
        contentPlain: 'This should not appear',
      });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);
      expect(screen.queryByText('This should not appear')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // File attachments
  // -----------------------------------------------------------------------
  describe('file attachments', () => {
    it('renders file attachment with name and size', () => {
      const file = createFileAttachment({ name: 'report.pdf', size: 102400 });
      const msg = createMessage({ files: [file] });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);
      expect(screen.getByText('report.pdf')).toBeInTheDocument();
      expect(screen.getByText('100 KB')).toBeInTheDocument();
    });

    it('renders image attachment as an img element', () => {
      const img = createImageAttachment({ name: 'screenshot.png' });
      const msg = createMessage({ files: [img] });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);
      const imgEl = screen.getByAltText('screenshot.png') as HTMLImageElement;
      expect(imgEl).toBeInTheDocument();
      expect(imgEl.tagName).toBe('IMG');
    });

    it('does not render file attachments for deleted messages', () => {
      const file = createFileAttachment({ name: 'secret.pdf' });
      const msg = createMessage({ isDeleted: true, deletedAt: new Date(), files: [file] });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);
      expect(screen.queryByText('secret.pdf')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Reactions
  // -----------------------------------------------------------------------
  describe('reactions', () => {
    it('renders reaction bar when reactions exist', () => {
      const msg = createMessage({ reactions: createReactions() });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);
      expect(screen.getByText('👍')).toBeInTheDocument();
      expect(screen.getByText('❤️')).toBeInTheDocument();
    });

    it('does not render reaction bar when no reactions', () => {
      const msg = createMessage({ reactions: [] });
      const { container } = render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);
      // The ReactionBar returns null when empty, so no reaction-specific elements
      expect(screen.queryByText('👍')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Thread summary
  // -----------------------------------------------------------------------
  describe('thread summary', () => {
    it('shows reply count link when replyCount > 0', () => {
      const msg = createMessage({ replyCount: 5 });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);
      expect(screen.getByText('5 replies')).toBeInTheDocument();
    });

    it('shows singular "reply" when replyCount is 1', () => {
      const msg = createMessage({ replyCount: 1 });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);
      expect(screen.getByText('1 reply')).toBeInTheDocument();
    });

    it('does not show thread summary when replyCount is 0', () => {
      const msg = createMessage({ replyCount: 0 });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);
      expect(screen.queryByText(/repl/)).not.toBeInTheDocument();
    });

    it('does not show thread summary in thread view', () => {
      const msg = createMessage({ replyCount: 5 });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} isThreadView />);
      expect(screen.queryByText('5 replies')).not.toBeInTheDocument();
    });

    it('calls setActiveThread when clicking reply count', () => {
      const msg = createMessage({ id: 'msg-parent', replyCount: 3 });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);

      fireEvent.click(screen.getByText('3 replies'));
      expect(mockSetActiveThread).toHaveBeenCalledWith('msg-parent');
    });
  });

  // -----------------------------------------------------------------------
  // Hover actions
  // -----------------------------------------------------------------------
  describe('hover actions', () => {
    it('shows MessageActions toolbar on hover', () => {
      const msg = createMessage();
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);

      // Before hover, actions should not be visible
      expect(screen.queryByLabelText('Reply in thread')).not.toBeInTheDocument();

      // Trigger hover
      const container = screen.getByText('Hello world').closest('[class*="group"]')!;
      fireEvent.mouseEnter(container);

      // Now actions should be visible
      expect(screen.getByLabelText('Reply in thread')).toBeInTheDocument();
    });

    it('hides MessageActions toolbar on mouse leave', () => {
      const msg = createMessage();
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);

      const container = screen.getByText('Hello world').closest('[class*="group"]')!;
      fireEvent.mouseEnter(container);
      expect(screen.getByLabelText('Reply in thread')).toBeInTheDocument();

      fireEvent.mouseLeave(container);
      expect(screen.queryByLabelText('Reply in thread')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Tiptap content rendering
  // -----------------------------------------------------------------------
  describe('content rendering', () => {
    it('renders plain text via contentPlain fallback', () => {
      const msg = createMessage({
        content: { type: 'doc', content: [] },
        contentPlain: 'Fallback text',
      });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);
      expect(screen.getByText('Fallback text')).toBeInTheDocument();
    });

    it('renders tiptap content with HTML formatting', () => {
      const msg = createMessage({
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Hello ', marks: [] },
                { type: 'text', text: 'world', marks: [{ type: 'bold' }] },
              ],
            },
          ],
        },
        contentPlain: 'Hello world',
      });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);
      // The bold text should be wrapped in <strong>
      const container = document.querySelector('.prose');
      expect(container).toBeInTheDocument();
      const strong = container?.querySelector('strong');
      expect(strong).toBeInTheDocument();
      expect(strong?.textContent).toBe('world');
    });

    it('renders mentions with highlight styling', () => {
      const msg = createMessage({
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'mention', attrs: { id: 'user-bob', label: 'Bob' } },
              ],
            },
          ],
        },
        contentPlain: '@Bob',
      });
      render(<MessageItem message={msg} currentUserId={CURRENT_USER_ID} />);
      const mention = document.querySelector('.mention-highlight');
      expect(mention).toBeInTheDocument();
      expect(mention?.textContent).toBe('@Bob');
    });
  });
});
