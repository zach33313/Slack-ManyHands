/**
 * search/queries.ts
 *
 * Database queries for full-text search.
 *
 * Uses SQLite LIKE '%query%' for development.
 * Production note: Switch to PostgreSQL tsvector/tsquery with a GIN index
 * on messages.content_plain for much better performance and relevance ranking.
 * See: https://www.postgresql.org/docs/current/textsearch.html
 */

import { prisma } from '@/shared/lib/prisma';
import { SEARCH_RESULTS_LIMIT } from '@/shared/lib/constants';
import type { SearchFilters, SearchResult, SearchResponse } from './types';
import type { TiptapJSON } from '@/shared/types';

/**
 * Parse a raw search query string into structured SearchFilters.
 *
 * Extracts filter prefixes:
 *   in:#channel     — filter by channel name
 *   from:@user      — filter by author name
 *   has:file        — messages with file attachments
 *   has:link        — messages containing http/https URLs
 *   before:YYYY-MM-DD — messages before date
 *   after:YYYY-MM-DD  — messages after date
 *
 * Everything remaining after extracting prefixes becomes the text query.
 *
 * @param rawQuery - The raw search string from the user
 * @returns Parsed SearchFilters object
 */
export function parseSearchQuery(rawQuery: string): SearchFilters {
  const filters: SearchFilters = { query: '' };
  let remaining = rawQuery.trim();

  // Extract in:#channel
  const inMatch = remaining.match(/\bin:#?(\S+)/i);
  if (inMatch) {
    filters.channelName = inMatch[1].toLowerCase();
    remaining = remaining.replace(inMatch[0], '');
  }

  // Extract from:@user
  const fromMatch = remaining.match(/\bfrom:@?(\S+)/i);
  if (fromMatch) {
    filters.userName = fromMatch[1].toLowerCase();
    remaining = remaining.replace(fromMatch[0], '');
  }

  // Extract has:file
  const hasFileMatch = remaining.match(/\bhas:file\b/i);
  if (hasFileMatch) {
    filters.hasFile = true;
    remaining = remaining.replace(hasFileMatch[0], '');
  }

  // Extract has:link
  const hasLinkMatch = remaining.match(/\bhas:link\b/i);
  if (hasLinkMatch) {
    filters.hasLink = true;
    remaining = remaining.replace(hasLinkMatch[0], '');
  }

  // Extract before:YYYY-MM-DD
  const beforeMatch = remaining.match(/\bbefore:(\d{4}-\d{2}-\d{2})\b/i);
  if (beforeMatch) {
    const d = new Date(beforeMatch[1] + 'T23:59:59.999Z');
    if (!isNaN(d.getTime())) {
      filters.before = d;
    }
    remaining = remaining.replace(beforeMatch[0], '');
  }

  // Extract after:YYYY-MM-DD
  const afterMatch = remaining.match(/\bafter:(\d{4}-\d{2}-\d{2})\b/i);
  if (afterMatch) {
    const d = new Date(afterMatch[1] + 'T00:00:00.000Z');
    if (!isNaN(d.getTime())) {
      filters.after = d;
    }
    remaining = remaining.replace(afterMatch[0], '');
  }

  // The remaining text is the search query
  filters.query = remaining.trim().replace(/\s+/g, ' ');

  return filters;
}

/**
 * Extract highlight snippets from contentPlain around matching text.
 * Returns an array of snippets with the match surrounded by context.
 */
function extractHighlights(contentPlain: string, query: string): string[] {
  if (!query) return [contentPlain.slice(0, 150)];

  const highlights: string[] = [];
  const lowerContent = contentPlain.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const words = lowerQuery.split(/\s+/).filter(Boolean);

  for (const word of words) {
    const idx = lowerContent.indexOf(word);
    if (idx === -1) continue;

    const start = Math.max(0, idx - 40);
    const end = Math.min(contentPlain.length, idx + word.length + 40);
    let snippet = contentPlain.slice(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < contentPlain.length) snippet = snippet + '...';

    highlights.push(snippet);
  }

  if (highlights.length === 0) {
    highlights.push(contentPlain.slice(0, 150));
  }

  return highlights;
}

/**
 * Search messages within a workspace that the user has access to.
 *
 * Uses SQLite LIKE '%query%' for case-insensitive substring matching.
 * For production, replace with PostgreSQL tsvector/tsquery + GIN index:
 *   WHERE search_vector @@ plainto_tsquery('english', $query)
 *   ORDER BY ts_rank(search_vector, plainto_tsquery('english', $query)) DESC
 *
 * @param workspaceId - The workspace to search in
 * @param userId - The requesting user's ID (filters to channels they're a member of)
 * @param filters - Parsed search filters
 * @param cursor - Optional cursor for pagination (message ID)
 * @param limit - Results per page (default 20)
 * @returns SearchResponse with results, cursor, and hasMore
 */
export async function searchMessages(
  workspaceId: string,
  userId: string,
  filters: SearchFilters,
  cursor?: string,
  limit: number = SEARCH_RESULTS_LIMIT
): Promise<SearchResponse> {
  // Build the where clause for channels the user has access to
  const channelMemberships = await prisma.channelMember.findMany({
    where: { userId },
    select: { channelId: true },
  });
  const accessibleChannelIds = channelMemberships.map((cm) => cm.channelId);

  if (accessibleChannelIds.length === 0) {
    return { results: [], cursor: null, hasMore: false, total: 0 };
  }

  // Filter accessible channels to ones in this workspace
  const workspaceChannels = await prisma.channel.findMany({
    where: {
      workspaceId,
      id: { in: accessibleChannelIds },
      isArchived: false,
    },
    select: { id: true, name: true },
  });

  const channelMap = new Map(workspaceChannels.map((c) => [c.id, c.name]));
  let searchChannelIds = workspaceChannels.map((c) => c.id);

  // Apply channel name filter
  if (filters.channelName) {
    const matchingChannel = workspaceChannels.find(
      (c) => c.name.toLowerCase() === filters.channelName!.toLowerCase()
    );
    if (matchingChannel) {
      searchChannelIds = [matchingChannel.id];
    } else {
      return { results: [], cursor: null, hasMore: false, total: 0 };
    }
  }

  // Apply channel ID filter
  if (filters.channelId) {
    if (searchChannelIds.includes(filters.channelId)) {
      searchChannelIds = [filters.channelId];
    } else {
      return { results: [], cursor: null, hasMore: false, total: 0 };
    }
  }

  // Build user filter
  let filterUserId: string | undefined = filters.userId;
  if (filters.userName && !filterUserId) {
    const matchingUser = await prisma.user.findFirst({
      where: {
        name: { contains: filters.userName },
      },
      select: { id: true },
    });
    if (matchingUser) {
      filterUserId = matchingUser.id;
    } else {
      return { results: [], cursor: null, hasMore: false, total: 0 };
    }
  }

  // Build Prisma where clause
  const where: Record<string, unknown> = {
    channelId: { in: searchChannelIds },
    isDeleted: false,
  };

  // Text search using LIKE (case-insensitive in SQLite by default)
  if (filters.query) {
    where.contentPlain = { contains: filters.query };
  }

  // Author filter
  if (filterUserId) {
    where.userId = filterUserId;
  }

  // Date range filters
  if (filters.before || filters.after) {
    const createdAt: Record<string, Date> = {};
    if (filters.before) createdAt.lte = filters.before;
    if (filters.after) createdAt.gte = filters.after;
    where.createdAt = createdAt;
  }

  // has:link filter - check for URLs in contentPlain
  if (filters.hasLink) {
    if (filters.query) {
      // Both text query and link filter: use AND to combine both contains conditions
      where.AND = [
        { contentPlain: { contains: filters.query } },
        { contentPlain: { contains: 'http' } },
      ];
      // Remove the top-level contentPlain since it's now inside AND
      delete where.contentPlain;
    } else {
      where.contentPlain = {
        ...(where.contentPlain as Record<string, unknown> || {}),
        contains: 'http',
      };
    }
  }

  // has:file filter - only messages with at least one file attachment
  if (filters.hasFile) {
    where.files = { some: {} };
  }

  // Count total results
  const total = await prisma.message.count({ where: where as any });

  // Apply cursor-based pagination
  const findArgs: Record<string, unknown> = {
    where,
    orderBy: { createdAt: 'desc' as const },
    take: limit + 1, // Fetch one extra to determine hasMore
    include: {
      author: {
        select: { id: true, name: true, image: true },
      },
      _count: {
        select: { files: true },
      },
    },
  };

  if (cursor) {
    findArgs.cursor = { id: cursor };
    findArgs.skip = 1; // Skip the cursor message itself
  }

  const messages = await prisma.message.findMany(findArgs as any);

  const hasMore = messages.length > limit;
  const resultMessages = messages.slice(0, limit);
  const nextCursor = hasMore && resultMessages.length > 0
    ? resultMessages[resultMessages.length - 1].id
    : null;

  // Map to SearchResult
  const results: SearchResult[] = resultMessages.map((m: any) => {
    let parsedContent: TiptapJSON;
    try {
      parsedContent = typeof m.contentJson === 'string'
        ? JSON.parse(m.contentJson)
        : m.contentJson;
    } catch {
      parsedContent = { type: 'doc', content: [] };
    }

    return {
      message: {
        id: m.id,
        channelId: m.channelId,
        userId: m.userId,
        content: parsedContent,
        contentPlain: m.contentPlain,
        parentId: m.parentId,
        replyCount: m.replyCount,
        isEdited: m.isEdited,
        isDeleted: m.isDeleted,
        createdAt: m.createdAt,
        author: {
          id: m.author.id,
          name: m.author.name ?? 'Unknown',
          image: m.author.image,
        },
        fileCount: m._count.files,
      },
      channelName: channelMap.get(m.channelId) ?? 'unknown',
      highlights: extractHighlights(m.contentPlain, filters.query),
    };
  });

  return { results, cursor: nextCursor, hasMore, total };
}
