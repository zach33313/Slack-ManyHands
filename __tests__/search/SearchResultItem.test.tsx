/**
 * @jest-environment jsdom
 */

/**
 * Tests for search/components/SearchResultItem.tsx
 *
 * Covers:
 *   - Renders channel name + author + preview text
 *   - Highlights search terms in preview text
 *   - Click navigates to message (calls onClick)
 *   - Shows file attachment indicator
 *   - Shows thread reply indicator
 *   - Selected state styling
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock dependencies
jest.mock('lucide-react', () => ({
  Hash: (props: any) => <span data-testid="icon-hash" {...props} />,
  MessageSquare: (props: any) => <span data-testid="icon-message-square" {...props} />,
  Paperclip: (props: any) => <span data-testid="icon-paperclip" {...props} />,
}));

jest.mock('../../shared/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
  formatRelativeTime: () => '5 minutes ago',
}));

import { SearchResultItem } from '../../search/components/SearchResultItem';
import type { SearchResult } from '../../search/types';

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    message: {
      id: 'msg-1',
      channelId: 'ch-1',
      userId: 'user-1',
      content: { type: 'doc' as const, content: [] },
      contentPlain: 'Hello world this is a test message',
      parentId: null,
      replyCount: 0,
      isEdited: false,
      isDeleted: false,
      createdAt: new Date('2024-06-15T12:00:00Z'),
      author: {
        id: 'user-1',
        name: 'Alice Johnson',
        image: null,
      },
      fileCount: 0,
      ...(overrides.message as any),
    },
    channelName: overrides.channelName ?? 'general',
    highlights: overrides.highlights ?? ['Hello world this is a test message'],
  };
}

describe('SearchResultItem', () => {
  it('renders the channel name', () => {
    const result = makeResult({ channelName: 'engineering' });
    render(
      <SearchResultItem result={result} query="hello" isSelected={false} onClick={jest.fn()} />
    );

    expect(screen.getByText('engineering')).toBeInTheDocument();
  });

  it('renders the author name', () => {
    const result = makeResult();
    render(
      <SearchResultItem result={result} query="hello" isSelected={false} onClick={jest.fn()} />
    );

    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
  });

  it('renders the relative timestamp', () => {
    const result = makeResult();
    render(
      <SearchResultItem result={result} query="hello" isSelected={false} onClick={jest.fn()} />
    );

    expect(screen.getByText('5 minutes ago')).toBeInTheDocument();
  });

  it('renders author avatar initial when no image', () => {
    const result = makeResult();
    render(
      <SearchResultItem result={result} query="hello" isSelected={false} onClick={jest.fn()} />
    );

    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders author image when available', () => {
    const result = makeResult({
      message: {
        author: { id: 'user-1', name: 'Alice', image: 'https://example.com/alice.jpg' },
      } as any,
    });
    render(
      <SearchResultItem result={result} query="hello" isSelected={false} onClick={jest.fn()} />
    );

    const img = screen.getByAltText('Alice');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/alice.jpg');
  });

  it('calls onClick when clicked', () => {
    const onClick = jest.fn();
    const result = makeResult();
    render(
      <SearchResultItem result={result} query="hello" isSelected={false} onClick={onClick} />
    );

    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('highlights search terms in the preview text', () => {
    const result = makeResult({
      highlights: ['Hello world this is a test message'],
    });
    render(
      <SearchResultItem result={result} query="hello" isSelected={false} onClick={jest.fn()} />
    );

    // The word "Hello" should be wrapped in a <mark> tag
    const marks = document.querySelectorAll('mark');
    expect(marks.length).toBeGreaterThan(0);
    // At least one mark should contain "Hello" (case-insensitive)
    const matchingMark = Array.from(marks).find(
      (m) => m.textContent?.toLowerCase() === 'hello'
    );
    expect(matchingMark).toBeTruthy();
  });

  it('does not highlight when query is empty', () => {
    const result = makeResult({
      highlights: ['Hello world message'],
    });
    render(
      <SearchResultItem result={result} query="" isSelected={false} onClick={jest.fn()} />
    );

    const marks = document.querySelectorAll('mark');
    expect(marks.length).toBe(0);
  });

  it('shows paperclip icon when message has files', () => {
    const result = makeResult({
      message: { fileCount: 3 } as any,
    });
    render(
      <SearchResultItem result={result} query="hello" isSelected={false} onClick={jest.fn()} />
    );

    expect(screen.getByTestId('icon-paperclip')).toBeInTheDocument();
  });

  it('does not show paperclip icon when no files', () => {
    const result = makeResult({
      message: { fileCount: 0 } as any,
    });
    render(
      <SearchResultItem result={result} query="hello" isSelected={false} onClick={jest.fn()} />
    );

    expect(screen.queryByTestId('icon-paperclip')).not.toBeInTheDocument();
  });

  it('shows message-square icon for thread replies', () => {
    const result = makeResult({
      message: { parentId: 'parent-msg-1' } as any,
    });
    render(
      <SearchResultItem result={result} query="hello" isSelected={false} onClick={jest.fn()} />
    );

    expect(screen.getByTestId('icon-message-square')).toBeInTheDocument();
  });

  it('does not show message-square icon for top-level messages', () => {
    const result = makeResult({
      message: { parentId: null } as any,
    });
    render(
      <SearchResultItem result={result} query="hello" isSelected={false} onClick={jest.fn()} />
    );

    expect(screen.queryByTestId('icon-message-square')).not.toBeInTheDocument();
  });

  it('applies selected styling when isSelected is true', () => {
    const result = makeResult();
    const { container } = render(
      <SearchResultItem result={result} query="hello" isSelected={true} onClick={jest.fn()} />
    );

    const button = container.querySelector('button');
    expect(button?.className).toContain('bg-accent');
  });

  it('highlights multiple search terms', () => {
    const result = makeResult({
      highlights: ['Hello world this is important'],
    });
    render(
      <SearchResultItem result={result} query="hello important" isSelected={false} onClick={jest.fn()} />
    );

    const marks = document.querySelectorAll('mark');
    expect(marks.length).toBe(2);
    const markTexts = Array.from(marks).map((m) => m.textContent?.toLowerCase());
    expect(markTexts).toContain('hello');
    expect(markTexts).toContain('important');
  });

  it('escapes regex special characters in query', () => {
    const result = makeResult({
      highlights: ['Message with (parens) and [brackets]'],
    });
    // Should not throw even with regex special chars
    expect(() => {
      render(
        <SearchResultItem
          result={result}
          query="(parens)"
          isSelected={false}
          onClick={jest.fn()}
        />
      );
    }).not.toThrow();
  });
});
