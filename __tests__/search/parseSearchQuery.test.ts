/**
 * Tests for search/queries.ts — parseSearchQuery function
 *
 * Tests the parsing of raw search query strings into structured SearchFilters.
 * Covers:
 *   - Plain text queries
 *   - in:#channel filter
 *   - from:@user filter
 *   - has:file filter
 *   - has:link filter
 *   - before: and after: date filters
 *   - Multiple filters combined
 *   - Edge cases (empty, whitespace, invalid dates)
 */

// Mock dependencies before imports
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../shared/lib/constants', () => ({
  SEARCH_RESULTS_LIMIT: 20,
  MAX_SEARCH_RESULTS: 50,
}));

import { parseSearchQuery } from '../../search/queries';

describe('parseSearchQuery', () => {
  // -----------------------------------------------------------------------
  // Plain text queries
  // -----------------------------------------------------------------------
  describe('plain text queries', () => {
    it('parses a simple text query', () => {
      const result = parseSearchQuery('hello world');
      expect(result.query).toBe('hello world');
      expect(result.channelName).toBeUndefined();
      expect(result.userName).toBeUndefined();
      expect(result.hasFile).toBeUndefined();
      expect(result.hasLink).toBeUndefined();
      expect(result.before).toBeUndefined();
      expect(result.after).toBeUndefined();
    });

    it('trims leading and trailing whitespace', () => {
      const result = parseSearchQuery('  hello world  ');
      expect(result.query).toBe('hello world');
    });

    it('collapses multiple spaces into one', () => {
      const result = parseSearchQuery('hello   world');
      expect(result.query).toBe('hello world');
    });

    it('returns empty query for empty string', () => {
      const result = parseSearchQuery('');
      expect(result.query).toBe('');
    });

    it('returns empty query for whitespace-only string', () => {
      const result = parseSearchQuery('   ');
      expect(result.query).toBe('');
    });
  });

  // -----------------------------------------------------------------------
  // in:#channel filter
  // -----------------------------------------------------------------------
  describe('in:#channel filter', () => {
    it('extracts channel name with # prefix', () => {
      const result = parseSearchQuery('in:#general hello');
      expect(result.channelName).toBe('general');
      expect(result.query).toBe('hello');
    });

    it('extracts channel name without # prefix', () => {
      const result = parseSearchQuery('in:general hello');
      expect(result.channelName).toBe('general');
      expect(result.query).toBe('hello');
    });

    it('lowercases the channel name', () => {
      const result = parseSearchQuery('in:#General hello');
      expect(result.channelName).toBe('general');
    });

    it('handles in: filter at the end of query', () => {
      const result = parseSearchQuery('hello in:#general');
      expect(result.channelName).toBe('general');
      expect(result.query).toBe('hello');
    });

    it('handles in: filter as the only content', () => {
      const result = parseSearchQuery('in:#general');
      expect(result.channelName).toBe('general');
      expect(result.query).toBe('');
    });
  });

  // -----------------------------------------------------------------------
  // from:@user filter
  // -----------------------------------------------------------------------
  describe('from:@user filter', () => {
    it('extracts user name with @ prefix', () => {
      const result = parseSearchQuery('from:@alice test');
      expect(result.userName).toBe('alice');
      expect(result.query).toBe('test');
    });

    it('extracts user name without @ prefix', () => {
      const result = parseSearchQuery('from:alice test');
      expect(result.userName).toBe('alice');
      expect(result.query).toBe('test');
    });

    it('lowercases the user name', () => {
      const result = parseSearchQuery('from:@Alice test');
      expect(result.userName).toBe('alice');
    });

    it('handles from: filter at the end of query', () => {
      const result = parseSearchQuery('test from:@alice');
      expect(result.userName).toBe('alice');
      expect(result.query).toBe('test');
    });

    it('handles from: filter as the only content', () => {
      const result = parseSearchQuery('from:@bob');
      expect(result.userName).toBe('bob');
      expect(result.query).toBe('');
    });
  });

  // -----------------------------------------------------------------------
  // has:file filter
  // -----------------------------------------------------------------------
  describe('has:file filter', () => {
    it('sets hasFile to true', () => {
      const result = parseSearchQuery('has:file');
      expect(result.hasFile).toBe(true);
      expect(result.query).toBe('');
    });

    it('works case-insensitively', () => {
      const result = parseSearchQuery('has:FILE');
      expect(result.hasFile).toBe(true);
    });

    it('preserves remaining text', () => {
      const result = parseSearchQuery('has:file hello');
      expect(result.hasFile).toBe(true);
      expect(result.query).toBe('hello');
    });

    it('works at end of query', () => {
      const result = parseSearchQuery('hello has:file');
      expect(result.hasFile).toBe(true);
      expect(result.query).toBe('hello');
    });
  });

  // -----------------------------------------------------------------------
  // has:link filter
  // -----------------------------------------------------------------------
  describe('has:link filter', () => {
    it('sets hasLink to true', () => {
      const result = parseSearchQuery('has:link');
      expect(result.hasLink).toBe(true);
      expect(result.query).toBe('');
    });

    it('works case-insensitively', () => {
      const result = parseSearchQuery('has:LINK');
      expect(result.hasLink).toBe(true);
    });

    it('preserves remaining text', () => {
      const result = parseSearchQuery('has:link something');
      expect(result.hasLink).toBe(true);
      expect(result.query).toBe('something');
    });
  });

  // -----------------------------------------------------------------------
  // Date filters
  // -----------------------------------------------------------------------
  describe('before: and after: date filters', () => {
    it('parses before:YYYY-MM-DD correctly', () => {
      const result = parseSearchQuery('before:2024-01-01 hello');
      expect(result.before).toBeInstanceOf(Date);
      // The date should be set to end of day in UTC
      expect(result.before!.toISOString()).toBe('2024-01-01T23:59:59.999Z');
      expect(result.query).toBe('hello');
    });

    it('parses after:YYYY-MM-DD correctly', () => {
      const result = parseSearchQuery('after:2023-01-01 hello');
      expect(result.after).toBeInstanceOf(Date);
      // The date should be set to start of day in UTC
      expect(result.after!.toISOString()).toBe('2023-01-01T00:00:00.000Z');
      expect(result.query).toBe('hello');
    });

    it('handles both before and after together', () => {
      const result = parseSearchQuery('before:2024-01-01 after:2023-01-01 hello');
      expect(result.before).toBeInstanceOf(Date);
      expect(result.after).toBeInstanceOf(Date);
      expect(result.before!.toISOString()).toBe('2024-01-01T23:59:59.999Z');
      expect(result.after!.toISOString()).toBe('2023-01-01T00:00:00.000Z');
      expect(result.query).toBe('hello');
    });

    it('ignores invalid date format', () => {
      const result = parseSearchQuery('before:not-a-date hello');
      expect(result.before).toBeUndefined();
      // "before:not-a-date" will remain in query since the regex won't match
      expect(result.query).toContain('hello');
    });
  });

  // -----------------------------------------------------------------------
  // Multiple filters combined
  // -----------------------------------------------------------------------
  describe('multiple filters combined', () => {
    it('combines in:#channel and from:@user', () => {
      const result = parseSearchQuery('in:#general from:@alice hello');
      expect(result.channelName).toBe('general');
      expect(result.userName).toBe('alice');
      expect(result.query).toBe('hello');
    });

    it('combines all filters at once', () => {
      const result = parseSearchQuery(
        'in:#general from:@alice has:file before:2024-06-15 after:2024-01-01 important meeting'
      );
      expect(result.channelName).toBe('general');
      expect(result.userName).toBe('alice');
      expect(result.hasFile).toBe(true);
      expect(result.before).toBeInstanceOf(Date);
      expect(result.after).toBeInstanceOf(Date);
      expect(result.query).toBe('important meeting');
    });

    it('handles filters in any order', () => {
      const result = parseSearchQuery('hello from:@bob in:#random world');
      expect(result.channelName).toBe('random');
      expect(result.userName).toBe('bob');
      expect(result.query).toBe('hello world');
    });

    it('handles has:file and has:link together', () => {
      const result = parseSearchQuery('has:file has:link docs');
      expect(result.hasFile).toBe(true);
      expect(result.hasLink).toBe(true);
      expect(result.query).toBe('docs');
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe('edge cases', () => {
    it('handles filters with no surrounding text', () => {
      const result = parseSearchQuery('in:#general from:@alice has:file');
      expect(result.channelName).toBe('general');
      expect(result.userName).toBe('alice');
      expect(result.hasFile).toBe(true);
      expect(result.query).toBe('');
    });

    it('handles channel names with hyphens', () => {
      const result = parseSearchQuery('in:#my-channel hello');
      expect(result.channelName).toBe('my-channel');
    });

    it('handles user names with hyphens', () => {
      const result = parseSearchQuery('from:@alice-smith hello');
      expect(result.userName).toBe('alice-smith');
    });

    it('only extracts the first occurrence of each filter', () => {
      // parseSearchQuery uses .match() which only finds the first match
      const result = parseSearchQuery('in:#general in:#random hello');
      expect(result.channelName).toBe('general');
    });
  });
});
