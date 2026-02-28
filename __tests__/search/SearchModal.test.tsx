/**
 * @jest-environment jsdom
 */

/**
 * Tests for search/components/SearchModal.tsx
 *
 * Covers:
 *   - Opens on Cmd+K keyboard shortcut
 *   - Closes on Escape key
 *   - Debounces search input (via useSearch hook)
 *   - Shows results from useSearch hook
 *   - Keyboard navigation (up/down arrows)
 *   - Shows recent searches from localStorage
 *   - Filter chip buttons add filter text to query
 */

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { SearchResult } from '@/search/types';

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

// --- Mock setup ---

const mockPush = jest.fn();
const mockSetQuery = jest.fn();
const mockUseSearchReturn = {
  query: '',
  setQuery: mockSetQuery,
  results: [] as SearchResult[],
  isLoading: false,
  error: null as string | null,
  total: 0,
  filters: { query: '' },
  setFilters: jest.fn(),
  hasMore: false,
  loadMore: jest.fn(),
};

let useSearchState = { ...mockUseSearchReturn };

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

jest.mock('../../shared/hooks/useSearch', () => ({
  useSearch: () => useSearchState,
}));

jest.mock('../../shared/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
  formatRelativeTime: () => '5 min ago',
}));

// Mock radix-ui Dialog to be simpler
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, onOpenChange, children }: any) =>
    open ? <div data-testid="dialog" data-open={open}>{children}</div> : null,
  DialogContent: ({ children, onKeyDown, className }: any) => (
    <div data-testid="dialog-content" onKeyDown={onKeyDown} className={className}>
      {children}
    </div>
  ),
  DialogTitle: ({ children, className }: any) => (
    <span className={className}>{children}</span>
  ),
}));

jest.mock('lucide-react', () => ({
  Search: (props: any) => <span data-testid="icon-search" {...props} />,
  X: (props: any) => <span data-testid="icon-x" {...props} />,
  Hash: (props: any) => <span data-testid="icon-hash" {...props} />,
  User: (props: any) => <span data-testid="icon-user" {...props} />,
  Paperclip: (props: any) => <span data-testid="icon-paperclip" {...props} />,
  Clock: (props: any) => <span data-testid="icon-clock" {...props} />,
  Loader2: (props: any) => <span data-testid="icon-loader" {...props} />,
  MessageSquare: (props: any) => <span data-testid="icon-msg-sq" {...props} />,
}));

// Mock SearchResultItem
jest.mock('../../search/components/SearchResultItem', () => ({
  SearchResultItem: ({ result, query, isSelected, onClick }: any) => (
    <div
      data-testid={`search-result-${result.message.id}`}
      data-selected={isSelected}
      onClick={onClick}
    >
      {result.message.contentPlain}
    </div>
  ),
}));

import { SearchModal } from '../../search/components/SearchModal';

describe('SearchModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset state
    useSearchState = { ...mockUseSearchReturn, setQuery: mockSetQuery };
    // Clear localStorage
    localStorage.clear();
  });

  function renderModal() {
    return render(
      <SearchModal workspaceId="ws-1" workspaceSlug="acme" />
    );
  }

  // -----------------------------------------------------------------------
  // Opening and closing
  // -----------------------------------------------------------------------
  describe('opening and closing', () => {
    it('is initially closed', () => {
      renderModal();
      expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });

    it('opens when the search trigger button is clicked', () => {
      renderModal();
      const trigger = screen.getByText('Search');
      fireEvent.click(trigger);
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });

    it('opens on Cmd+K keyboard shortcut', () => {
      renderModal();
      act(() => {
        fireEvent.keyDown(document, { key: 'k', metaKey: true });
      });
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });

    it('opens on Ctrl+K keyboard shortcut', () => {
      renderModal();
      act(() => {
        fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      });
      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });

    it('closes on Escape key', () => {
      renderModal();
      // Open first
      fireEvent.click(screen.getByText('Search'));
      expect(screen.getByTestId('dialog')).toBeInTheDocument();

      // Press Escape on the dialog content
      const dialogContent = screen.getByTestId('dialog-content');
      fireEvent.keyDown(dialogContent, { key: 'Escape' });

      // setQuery should be called with '' on close
      expect(mockSetQuery).toHaveBeenCalledWith('');
    });

    it('toggles open/close on repeated Cmd+K', () => {
      renderModal();
      // Open
      act(() => {
        fireEvent.keyDown(document, { key: 'k', metaKey: true });
      });
      expect(screen.getByTestId('dialog')).toBeInTheDocument();

      // Close (toggle)
      act(() => {
        fireEvent.keyDown(document, { key: 'k', metaKey: true });
      });
      expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Search input
  // -----------------------------------------------------------------------
  describe('search input', () => {
    it('renders search input when open', () => {
      renderModal();
      fireEvent.click(screen.getByText('Search'));

      const input = screen.getByPlaceholderText('Search messages...');
      expect(input).toBeInTheDocument();
    });

    it('calls setQuery when typing in input', () => {
      renderModal();
      fireEvent.click(screen.getByText('Search'));

      const input = screen.getByPlaceholderText('Search messages...');
      fireEvent.change(input, { target: { value: 'hello' } });

      expect(mockSetQuery).toHaveBeenCalledWith('hello');
    });
  });

  // -----------------------------------------------------------------------
  // Search results display
  // -----------------------------------------------------------------------
  describe('search results display', () => {
    it('shows results when query has results', () => {
      useSearchState = {
        ...mockUseSearchReturn,
        query: 'hello',
        results: [
          {
            message: {
              id: 'msg-1',
              channelId: 'ch-1',
              userId: 'user-1',
              content: { type: 'doc', content: [] },
              contentPlain: 'hello world',
              parentId: null,
              replyCount: 0,
              isEdited: false,
              isDeleted: false,
              createdAt: new Date(),
              author: { id: 'user-1', name: 'Alice', image: null },
              fileCount: 0,
            },
            channelName: 'general',
            highlights: ['hello world'],
          },
        ],
        total: 1,
        setQuery: mockSetQuery,
      };

      renderModal();
      fireEvent.click(screen.getByText('Search'));

      expect(screen.getByTestId('search-result-msg-1')).toBeInTheDocument();
      expect(screen.getByText('1 result')).toBeInTheDocument();
    });

    it('shows plural "results" for multiple results', () => {
      useSearchState = {
        ...mockUseSearchReturn,
        query: 'hello',
        results: [
          {
            message: { id: 'msg-1', channelId: 'ch-1', contentPlain: 'hello 1', userId: 'u1', content: { type: 'doc', content: [] }, parentId: null, replyCount: 0, isEdited: false, isDeleted: false, createdAt: new Date(), author: { id: 'u1', name: 'A', image: null }, fileCount: 0 },
            channelName: 'general',
            highlights: ['hello 1'],
          },
          {
            message: { id: 'msg-2', channelId: 'ch-1', contentPlain: 'hello 2', userId: 'u1', content: { type: 'doc', content: [] }, parentId: null, replyCount: 0, isEdited: false, isDeleted: false, createdAt: new Date(), author: { id: 'u1', name: 'A', image: null }, fileCount: 0 },
            channelName: 'general',
            highlights: ['hello 2'],
          },
        ],
        total: 2,
        setQuery: mockSetQuery,
      };

      renderModal();
      fireEvent.click(screen.getByText('Search'));

      expect(screen.getByText('2 results')).toBeInTheDocument();
    });

    it('shows empty state when query returns no results', () => {
      useSearchState = {
        ...mockUseSearchReturn,
        query: 'nonexistent',
        results: [],
        total: 0,
        isLoading: false,
        setQuery: mockSetQuery,
      };

      renderModal();
      fireEvent.click(screen.getByText('Search'));

      expect(screen.getByText(/No results found/)).toBeInTheDocument();
    });

    it('shows loading spinner when search is in progress', () => {
      useSearchState = {
        ...mockUseSearchReturn,
        query: 'loading',
        results: [],
        isLoading: true,
        setQuery: mockSetQuery,
      };

      renderModal();
      fireEvent.click(screen.getByText('Search'));

      expect(screen.getByText('Searching...')).toBeInTheDocument();
    });

    it('shows error state when search fails', () => {
      useSearchState = {
        ...mockUseSearchReturn,
        query: 'error',
        results: [],
        error: 'Search failed: internal error',
        setQuery: mockSetQuery,
      };

      renderModal();
      fireEvent.click(screen.getByText('Search'));

      expect(screen.getByText('Search failed: internal error')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Keyboard navigation
  // -----------------------------------------------------------------------
  describe('keyboard navigation', () => {
    const twoResults = [
      {
        message: { id: 'msg-1', channelId: 'ch-1', contentPlain: 'first', userId: 'u1', content: { type: 'doc' as const, content: [] }, parentId: null, replyCount: 0, isEdited: false, isDeleted: false, createdAt: new Date(), author: { id: 'u1', name: 'A', image: null }, fileCount: 0 },
        channelName: 'general',
        highlights: ['first'],
      },
      {
        message: { id: 'msg-2', channelId: 'ch-2', contentPlain: 'second', userId: 'u1', content: { type: 'doc' as const, content: [] }, parentId: null, replyCount: 0, isEdited: false, isDeleted: false, createdAt: new Date(), author: { id: 'u1', name: 'A', image: null }, fileCount: 0 },
        channelName: 'random',
        highlights: ['second'],
      },
    ];

    it('navigates down with ArrowDown', () => {
      useSearchState = {
        ...mockUseSearchReturn,
        query: 'test',
        results: twoResults,
        total: 2,
        setQuery: mockSetQuery,
      };

      renderModal();
      fireEvent.click(screen.getByText('Search'));

      const dialogContent = screen.getByTestId('dialog-content');

      // Initially no item selected (-1)
      // Press down once → first item selected
      fireEvent.keyDown(dialogContent, { key: 'ArrowDown' });

      const result1 = screen.getByTestId('search-result-msg-1');
      expect(result1.getAttribute('data-selected')).toBe('true');
    });

    it('navigates up with ArrowUp', () => {
      useSearchState = {
        ...mockUseSearchReturn,
        query: 'test',
        results: twoResults,
        total: 2,
        setQuery: mockSetQuery,
      };

      renderModal();
      fireEvent.click(screen.getByText('Search'));

      const dialogContent = screen.getByTestId('dialog-content');

      // Go down twice
      fireEvent.keyDown(dialogContent, { key: 'ArrowDown' });
      fireEvent.keyDown(dialogContent, { key: 'ArrowDown' });

      // Now second is selected
      expect(screen.getByTestId('search-result-msg-2').getAttribute('data-selected')).toBe('true');

      // Go up
      fireEvent.keyDown(dialogContent, { key: 'ArrowUp' });

      // First should be selected
      expect(screen.getByTestId('search-result-msg-1').getAttribute('data-selected')).toBe('true');
    });

    it('selects result on Enter and navigates', () => {
      useSearchState = {
        ...mockUseSearchReturn,
        query: 'test',
        results: twoResults,
        total: 2,
        setQuery: mockSetQuery,
      };

      renderModal();
      fireEvent.click(screen.getByText('Search'));

      const dialogContent = screen.getByTestId('dialog-content');

      // Select first result
      fireEvent.keyDown(dialogContent, { key: 'ArrowDown' });
      // Press Enter
      fireEvent.keyDown(dialogContent, { key: 'Enter' });

      expect(mockPush).toHaveBeenCalledWith(
        '/acme/channel/ch-1?scrollTo=msg-1'
      );
    });

    it('does not navigate beyond last result', () => {
      useSearchState = {
        ...mockUseSearchReturn,
        query: 'test',
        results: twoResults,
        total: 2,
        setQuery: mockSetQuery,
      };

      renderModal();
      fireEvent.click(screen.getByText('Search'));

      const dialogContent = screen.getByTestId('dialog-content');

      // Press down 5 times (more than results count)
      for (let i = 0; i < 5; i++) {
        fireEvent.keyDown(dialogContent, { key: 'ArrowDown' });
      }

      // Should be stuck at last result (index 1)
      expect(screen.getByTestId('search-result-msg-2').getAttribute('data-selected')).toBe('true');
    });
  });

  // -----------------------------------------------------------------------
  // Recent searches
  // -----------------------------------------------------------------------
  describe('recent searches', () => {
    it('shows recent searches from localStorage when empty', () => {
      localStorage.setItem(
        'slack-clone-recent-searches',
        JSON.stringify(['previous search', 'old query'])
      );

      useSearchState = {
        ...mockUseSearchReturn,
        query: '',
        setQuery: mockSetQuery,
      };

      renderModal();
      fireEvent.click(screen.getByText('Search'));

      expect(screen.getByText('previous search')).toBeInTheDocument();
      expect(screen.getByText('old query')).toBeInTheDocument();
    });

    it('clicking recent search sets query', () => {
      localStorage.setItem(
        'slack-clone-recent-searches',
        JSON.stringify(['remembered query'])
      );

      useSearchState = {
        ...mockUseSearchReturn,
        query: '',
        setQuery: mockSetQuery,
      };

      renderModal();
      fireEvent.click(screen.getByText('Search'));

      fireEvent.click(screen.getByText('remembered query'));
      expect(mockSetQuery).toHaveBeenCalledWith('remembered query');
    });

    it('clear button removes recent searches', () => {
      localStorage.setItem(
        'slack-clone-recent-searches',
        JSON.stringify(['query1'])
      );

      useSearchState = {
        ...mockUseSearchReturn,
        query: '',
        setQuery: mockSetQuery,
      };

      renderModal();
      fireEvent.click(screen.getByText('Search'));

      fireEvent.click(screen.getByText('Clear'));

      // localStorage should be cleared
      expect(localStorage.getItem('slack-clone-recent-searches')).toBeNull();
    });

    it('does not show recent searches when there are none', () => {
      useSearchState = {
        ...mockUseSearchReturn,
        query: '',
        setQuery: mockSetQuery,
      };

      renderModal();
      fireEvent.click(screen.getByText('Search'));

      expect(screen.queryByText('Recent searches')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Filter chips
  // -----------------------------------------------------------------------
  describe('filter chips', () => {
    it('adds in:# filter when channel chip is clicked', () => {
      useSearchState = {
        ...mockUseSearchReturn,
        query: '',
        setQuery: mockSetQuery,
      };

      renderModal();
      fireEvent.click(screen.getByText('Search'));

      fireEvent.click(screen.getByText('in:channel'));
      expect(mockSetQuery).toHaveBeenCalledWith('in:#');
    });

    it('adds from:@ filter when user chip is clicked', () => {
      useSearchState = {
        ...mockUseSearchReturn,
        query: '',
        setQuery: mockSetQuery,
      };

      renderModal();
      fireEvent.click(screen.getByText('Search'));

      fireEvent.click(screen.getByText('from:user'));
      expect(mockSetQuery).toHaveBeenCalledWith('from:@');
    });

    it('adds has:file filter when file chip is clicked', () => {
      useSearchState = {
        ...mockUseSearchReturn,
        query: '',
        setQuery: mockSetQuery,
      };

      renderModal();
      fireEvent.click(screen.getByText('Search'));

      // "has:file" appears both in the filter chip and in the empty state guidance,
      // so we target the button specifically
      const hasFileButtons = screen.getAllByText('has:file');
      // The filter chip button is the first one (in the filter bar)
      fireEvent.click(hasFileButtons[0]);
      expect(mockSetQuery).toHaveBeenCalledWith('has:file');
    });

    it('prepends filter to existing query', () => {
      useSearchState = {
        ...mockUseSearchReturn,
        query: 'existing text',
        setQuery: mockSetQuery,
      };

      renderModal();
      fireEvent.click(screen.getByText('Search'));

      fireEvent.click(screen.getByText('in:channel'));
      expect(mockSetQuery).toHaveBeenCalledWith('in:# existing text');
    });
  });

  // -----------------------------------------------------------------------
  // Initial empty state
  // -----------------------------------------------------------------------
  describe('initial empty state', () => {
    it('shows helpful guidance when no query and no recent searches', () => {
      useSearchState = {
        ...mockUseSearchReturn,
        query: '',
        setQuery: mockSetQuery,
      };

      renderModal();
      fireEvent.click(screen.getByText('Search'));

      expect(screen.getByText('Search for messages')).toBeInTheDocument();
    });
  });
});
