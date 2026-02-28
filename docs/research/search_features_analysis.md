# Search Features Analysis

**Status**: Current implementation analysis for People/Files tab implementation
**Last Updated**: Feb 28, 2026
**Scope**: SearchModal.tsx (lines 660-676 stubbed tabs), API routes, hooks, and Prisma models

## Executive Summary

The search modal has 6 tabs (All, Messages, Channels, People, Files, Actions). **Messages and Channels are fully implemented**, while **People and Files are stubbed** (placeholder UI with "coming soon" messages at lines 660-676).

### Current State
- ✅ **Messages search**: Fully implemented via search API with filters
- ✅ **Channels search**: Fuzzy-matched client-side from workspace channels
- ✅ **Actions**: Quick action panel (>command mode)
- ❌ **People search**: Placeholder (lines 661-667)
- ❌ **Files search**: Placeholder (lines 669-676)

### What's Needed
Implementation workers will need to:
1. Add people search API endpoint (`GET /api/workspaces/:workspaceId/search/people`)
2. Add file search API endpoint (`GET /api/workspaces/:workspaceId/search/files`)
3. Extend useSearch hook to handle both queries
4. Add UI result rendering in SearchModal.tsx (replace placeholders)

---

## Architecture Overview

### Current Search Stack

```
SearchModal.tsx (UI)
    ↓
useSearch hook (state management)
    ↓
GET /api/workspaces/:workspaceId/search (API route)
    ↓
search/queries.ts (searchMessages function)
    ↓
Prisma (messages table queries)
```

### Data Flow for Messages Search

1. **User Types in SearchModal**: `query` state updated
2. **useSearch Hook**: Debounces query by 300ms
3. **API Call**: `GET /api/workspaces/:workspaceId/search?q=...`
4. **Backend Processing**:
   - Authenticate user via JWT
   - Verify workspace membership
   - Parse filter syntax (`in:#`, `from:@`, `has:`, `before:`, `after:`)
   - Execute Prisma query with access control (user's channels only)
5. **Response**: `SearchResponse` with results, cursor (pagination), hasMore, total count
6. **UI Rendering**: Staggered animation of results with fuzzy highlighting

---

## Existing Search Patterns

### 1. Types & Interfaces

**Location**: `search/types.ts`

```typescript
interface SearchResultMessage {
  id: string;
  channelId: string;
  userId: string;
  content: TiptapJSON;
  contentPlain: string;
  parentId: string | null;
  replyCount: number;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
  author: UserSummary;
  fileCount: number;
}

interface SearchResult {
  message: SearchResultMessage;
  channelName: string;
  highlights: string[];
}

interface SearchFilters {
  query: string;
  channelId?: string;
  channelName?: string;
  userId?: string;
  userName?: string;
  hasFile?: boolean;
  hasLink?: boolean;
  before?: Date;
  after?: Date;
}

interface SearchResponse {
  results: SearchResult[];
  cursor: string | null;
  hasMore: boolean;
  total: number;
}
```

**Pattern**: Results include:
- The resource (message/user/file)
- Associated metadata (author, channel name, highlights)
- Pagination cursor and total count
- Type-specific formatting (e.g., `highlights` for messages)

### 2. Query Parsing

**Location**: `search/queries.ts` (lines 33-89)

The `parseSearchQuery()` function extracts structured filters from raw input:

```
Supported syntax:
  in:#channel        → filters to specific channel
  in:channel-name    → channels without # also work
  from:@user         → filters to specific author
  from:username      → @ optional
  has:file           → only messages with attachments
  has:link           → only messages with URLs
  before:YYYY-MM-DD  → messages before date
  after:YYYY-MM-DD   → messages after date
```

**Implementation Details**:
- Case-insensitive
- Regex-based extraction
- Remaining text becomes the search query
- Multiple filters can be combined

**For People Search**: Could support:
- `in:#channel` → find people who posted recently in channel
- `has:email` → find users with email set (potential)

**For Files Search**: Could support:
- `in:#channel` → files in specific channel
- `from:@user` → files uploaded by specific user
- `type:image`, `type:pdf` → filter by MIME type
- `size:>1MB` → file size filters

### 3. Database Queries (Access Control)

**Location**: `search/queries.ts` (lines 138-320)

Key pattern for Prisma:

```typescript
// 1. Get channels user has access to
const channelMemberships = await prisma.channelMember.findMany({
  where: { userId },
  select: { channelId: true },
});
const accessibleChannelIds = channelMemberships.map(cm => cm.channelId);

// 2. Filter to workspace channels only
const workspaceChannels = await prisma.channel.findMany({
  where: {
    workspaceId,
    id: { in: accessibleChannelIds },
    isArchived: false,
  },
});

// 3. Build Prisma where clause
const where = {
  channelId: { in: accessibleChannelIds },
  isDeleted: false,
  contentPlain: { contains: query }, // SQLite LIKE
};

// 4. Execute with pagination
const messages = await prisma.message.findMany({
  where,
  orderBy: { createdAt: 'desc' },
  take: limit + 1, // +1 to detect hasMore
  include: { author: {...}, _count: {files: true} },
});
```

**Critical Pattern**: Always verify user's channel access before querying

For **People Search**: May need different access control
- Users in same workspace are discoverable
- Users visible in channels they're members of
- May want to expose directory of all workspace members

For **Files Search**: Reuse existing access control
- Only return files in channels user can access
- Filter by file metadata (MIME type, size, upload date)

### 4. Text Search Implementation

**Current**: SQLite `LIKE '%query%'` (case-insensitive substring match)

```typescript
if (filters.query) {
  where.contentPlain = { contains: filters.query };
}
```

**Production Note** (from schema): Switch to PostgreSQL tsvector/tsquery with GIN index:
```sql
WHERE search_vector @@ plainto_tsquery('english', $query)
ORDER BY ts_rank(search_vector, plainto_tsquery('english', $query)) DESC
```

**Highlights Extraction** (lines 95-121):
```typescript
function extractHighlights(contentPlain: string, query: string): string[] {
  // Finds each query word in content
  // Returns snippets with 40 chars context before/after
  // Joins with '...' for readability
}
```

For **People Search**: Could rank by:
- Name exact match > Name contains > Presence in channels
- Recent activity

For **Files Search**: Rank by:
- Filename match > MIME type match > Recency

### 5. Hook Pattern

**Location**: `shared/hooks/useSearch.ts`

```typescript
function useSearch(workspaceId: string): UseSearchReturn {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const debouncedQuery = useDebounce(query, 300);

  // Fetch on debounced query change
  useEffect(() => {
    // Calls: GET /api/workspaces/:workspaceId/search?q=...
  }, [debouncedQuery, workspaceId]);

  // Load more for pagination
  const loadMore = useCallback(async () => {
    // Calls with cursor param
  }, [cursor, debouncedQuery, workspaceId]);

  return {
    query, setQuery, results, isLoading, error,
    filters, setFilters, hasMore, total, loadMore
  };
}
```

**Current Limitation**:
- Single endpoint (`/api/workspaces/:workspaceId/search?q=...`)
- Returns only messages
- Does not distinguish result type

**For Multiple Tabs**: Need to extend architecture:
- Option A: Single endpoint returning typed results (messages[], users[], files[])
- Option B: Separate endpoints per type (current approach for extensibility)
- Recommendation: **Option A** (cleaner client code, reduce API calls)

### 6. API Route Pattern

**Location**: `app/api/workspaces/[workspaceId]/search/route.ts`

```typescript
export async function GET(request, context) {
  // 1. Authenticate
  const token = await getToken({req, secret: AUTH_SECRET});
  const userId = token?.sub;

  // 2. Verify workspace membership
  const membership = await prisma.workspaceMember.findUnique({...});
  if (!membership) return 403;

  // 3. Parse query params
  const {q, cursor, limit} = request.url searchParams;

  // 4. Parse filters
  const filters = parseSearchQuery(q);

  // 5. Execute query
  const result = await searchMessages(workspaceId, userId, filters, cursor, limit);

  // 6. Return with wrapper
  return NextResponse.json(ok(result));
}
```

**Response Wrapper**: Uses `ok()` helper:
```typescript
ok(result) // Returns { ok: true, data: result }
err(code, message) // Returns { ok: false, error: code, errorMessage: message }
```

---

## Prisma Schema for People & Files

### User Model (for People Search)

```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  password      String?

  // Profile fields
  title       String?      // Job title
  statusText  String?      // "In a meeting"
  statusEmoji String?      // "🎤"
  timezone    String?
  dndUntil    DateTime?    // Do Not Disturb expiration

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  ownedWorkspaces      Workspace[]
  workspaceMemberships WorkspaceMember[]
  // ... others
}

model WorkspaceMember {
  id          String   @id @default(cuid())
  workspaceId String
  userId      String
  role        String   @default("MEMBER")  // OWNER | ADMIN | MEMBER
  joinedAt    DateTime @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id])
  user      User      @relation(fields: [userId], references: [id])

  @@unique([workspaceId, userId])
  @@index([workspaceId])
  @@index([userId])
}
```

**Searchable User Fields**:
- `name` (primary)
- `email` (secondary)
- `title` (context)
- `statusText` (optional)

**Access Control for People**:
- Only return users who are members of the workspace
- Filter through WorkspaceMember table

### FileAttachment Model (for Files Search)

```prisma
model FileAttachment {
  id        String  @id @default(cuid())
  messageId String?        // Attached to message (nullable)
  userId    String         // Uploader
  name      String         // Filename
  mimeType  String         // e.g., "image/jpeg"
  size      Int            // Bytes
  url       String         // Cloud storage URL
  width     Int?           // For images
  height    Int?           // For images

  createdAt DateTime @default(now())

  message Message? @relation(fields: [messageId], references: [id], onDelete: SetNull)
  user    User     @relation(fields: [userId], references: [id])

  @@index([messageId])
  @@index([userId])
}
```

**Searchable File Fields**:
- `name` (filename, primary)
- `mimeType` (extension/type filter)
- `size` (file size range)
- `createdAt` (date filter)

**Access Control for Files**:
- Only return files in channels user has access to
- Requires join: FileAttachment → Message → Channel → ChannelMember

**Query Pattern**:
```typescript
const files = await prisma.fileAttachment.findMany({
  where: {
    message: {
      channel: {
        id: { in: accessibleChannelIds }
      }
    },
    name: { contains: query }, // Filename search
    mimeType: { startsWith: 'image' }, // Type filter
    // createdAt filters for date range
  },
  include: {
    message: { select: { channelId: true } },
    user: { select: { id: true, name: true, image: true } }
  },
  orderBy: { createdAt: 'desc' }
});
```

---

## Current Modal UI Structure

### SearchModal.tsx Layout

**Component Hierarchy**:
```
SearchModal
├── Input bar (Search icon, query input, clear button)
├── Tabs (when not in actions mode)
│   ├── All
│   ├── Messages
│   ├── Channels
│   ├── People        ← STUBBED (lines 661-667)
│   ├── Files         ← STUBBED (lines 669-676)
│   └── Actions
├── Results area (dynamic based on active tab)
│   ├── Recent searches (when no query)
│   ├── Channel results (fuzzy-matched client-side)
│   ├── Message results (from API)
│   ├── People results (PLACEHOLDER)    ← NEEDS IMPLEMENTATION
│   ├── Files results (PLACEHOLDER)     ← NEEDS IMPLEMENTATION
│   ├── Quick Actions (when >mode)
│   ├── Loading state
│   ├── Empty state
│   └── Error state
└── Footer (keyboard hints)
```

### Stubbed Tabs (lines 660-676)

**People Tab Placeholder**:
```typescript
{activeTab === 'people' && !isActionsMode && (
  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
    <User className="h-8 w-8 mb-2 opacity-50" />
    <p className="text-sm font-medium">People search coming soon</p>
    <p className="text-xs mt-1">Use the <strong>All</strong> tab to find messages mentioning someone</p>
  </div>
)}
```

**Files Tab Placeholder**:
```typescript
{activeTab === 'files' && !isActionsMode && (
  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
    <Paperclip className="h-8 w-8 mb-2 opacity-50" />
    <p className="text-sm font-medium">File search coming soon</p>
    <p className="text-xs mt-1">Use the <strong>Messages</strong> tab to find messages with attachments</p>
  </div>
)}
```

### Existing Result Item Pattern

**Channel Result Item** (lines 547-571):
```typescript
<motion.button
  key={channel.id}
  data-result-item      // Used for keyboard nav
  variants={dropdownItemVariants}
  onClick={() => navigateToChannel(channel.id)}
  className={cn(
    'flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm...',
    selectedIndex === idx && 'bg-accent'  // Keyboard nav highlight
  )}
>
  <Hash className="h-4 w-4 text-muted-foreground" />
  <div>
    <div className="font-medium">
      <HighlightedText text={channel.name} indices={indices} />
    </div>
    {channel.description && (
      <div className="text-xs text-muted-foreground truncate">
        {channel.description}
      </div>
    )}
  </div>
</motion.button>
```

**Message Result Item** (lines 592-622):
```typescript
<motion.button
  key={result.message.id}
  data-result-item
  onClick={() => navigateToMessage(result.message.channelId, result.message.id)}
  className={...}
>
  <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
  <div className="min-w-0 flex-1">
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
      <span className="font-medium text-foreground">{result.message.author.name}</span>
      <span>in</span>
      <span className="font-medium text-foreground">#{result.channelName}</span>
      <span className="ml-auto shrink-0">{timeAgo}</span>
    </div>
    <p className="text-sm text-foreground/80 truncate">{result.message.contentPlain}</p>
  </div>
</motion.button>
```

---

## Implementation Requirements

### For People Search Tab

**UI Requirements**:
1. Replace placeholder with result items
2. Each item shows:
   - User avatar (from `User.image`)
   - Name (from `User.name`)
   - Title/status (from `User.title` or `User.statusText`)
   - Badge if user is active/online (if tracking availability)
3. Clicking navigates to user profile or opens DM

**Backend Requirements**:
1. Create `search/people.ts` with `searchPeople()` function:
   - Input: workspaceId, userId, query, cursor?, limit?
   - Output: `PeopleSearchResponse` with user results
2. API endpoint: `GET /api/workspaces/:workspaceId/search/people?q=...`
   - Parse filters: `in:#channel` (find people in channel), `status:away`, etc.
   - Query WorkspaceMember + User tables
   - Rank by name match, recent activity, presence in queried channel
3. Extend useSearch hook to fetch people results

**Data Model for Results**:
```typescript
interface UserSearchResult {
  user: {
    id: string;
    name: string;
    image: string | null;
    email: string;
    title: string | null;
    statusText: string | null;
    statusEmoji: string | null;
    timezone: string | null;
    dndUntil: DateTime | null;
  };
  channelNames: string[];  // Channels they're in (optional, for context)
  highlights: string[];     // Matching fields
}

interface PeopleSearchResponse {
  results: UserSearchResult[];
  cursor: string | null;
  hasMore: boolean;
  total: number;
}
```

### For Files Search Tab

**UI Requirements**:
1. Replace placeholder with file result items
2. Each item shows:
   - File icon (based on MIME type: 📄 PDF, 🖼️ image, etc.)
   - Filename (from `FileAttachment.name`)
   - File size (formatted: "2.3 MB")
   - Uploader name (from `FileAttachment.user.name`)
   - Upload date (from `FileAttachment.createdAt`)
   - Channel context (from related Message)
3. Clicking downloads/opens file or navigates to message

**Backend Requirements**:
1. Create `search/files.ts` with `searchFiles()` function:
   - Input: workspaceId, userId, query, cursor?, limit?
   - Output: `FileSearchResponse` with file results
2. API endpoint: `GET /api/workspaces/:workspaceId/search/files?q=...`
   - Parse filters: `type:image`, `type:pdf`, `size:>1MB`, `from:@user`, `in:#channel`
   - Join FileAttachment → Message → Channel
   - Verify user's access to message's channel
   - Rank by filename match, recency
3. Extend useSearch hook to fetch file results

**Data Model for Results**:
```typescript
interface FileSearchResult {
  file: {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    url: string;
    width: number | null;
    height: number | null;
    createdAt: DateTime;
    uploader: {
      id: string;
      name: string;
      image: string | null;
    };
  };
  message: {
    id: string;
    channelId: string;
    channelName: string;
  };
  highlights: string[];  // Filename matches
}

interface FileSearchResponse {
  results: FileSearchResult[];
  cursor: string | null;
  hasMore: boolean;
  total: number;
}
```

**MIME Type Icon Mapping**:
```typescript
const getMimeIcon = (mimeType: string) => {
  if (mimeType.startsWith('image/')) return <FileImage className="..." />;
  if (mimeType === 'application/pdf') return <FileText className="..." />;
  if (mimeType.startsWith('video/')) return <FileVideo className="..." />;
  if (mimeType.startsWith('audio/')) return <Music className="..." />;
  return <Paperclip className="..." />;
};
```

---

## Integration Checklist

### For Implementation Workers

**Backend**:
- [ ] Create `search/people.ts` with `searchPeople()` function
- [ ] Create `search/files.ts` with `searchFiles()` function
- [ ] Add types to `search/types.ts` (PeopleSearchResponse, FileSearchResponse, UserSearchResult, FileSearchResult)
- [ ] Create API route: `app/api/workspaces/[workspaceId]/search/people/route.ts`
- [ ] Create API route: `app/api/workspaces/[workspaceId]/search/files/route.ts`
- [ ] Implement access control (verify channels user can access)

**Frontend**:
- [ ] Extend `shared/hooks/useSearch.ts` to handle people/files queries
  - May need separate state or unified results structure
- [ ] Update `search/components/SearchModal.tsx`:
  - Remove People placeholder (lines 661-667)
  - Add people result items rendering
  - Remove Files placeholder (lines 669-676)
  - Add file result items rendering
- [ ] Create or reuse components for people/file result items
- [ ] Add navigation handlers (navigate to profile/DM for people, download/open for files)

**Testing**:
- [ ] Test people search with various queries
- [ ] Test file search with MIME type filters
- [ ] Verify access control (users can't see people/files from channels they don't have access to)
- [ ] Test keyboard navigation works with new items
- [ ] Test pagination (cursor-based) for both

**Configuration** (Optional):
- [ ] Consider adding search scopes configuration (what's searchable)
- [ ] Consider rank adjustment (e.g., boost recent files)

---

## Key Insights & Recommendations

### 1. Architecture Decision: Single vs. Multiple Endpoints

**Current**: `/api/workspaces/:workspaceId/search` (messages only)

**Options**:

| Option | Pros | Cons |
|--------|------|------|
| **Single Endpoint** (return all types) | Single API call, simpler client code | Larger response, must filter UI |
| **Separate Endpoints** (per type) | Focused responses, easy to extend | More API calls, hook complexity |

**Recommendation**: Keep separate endpoints
- Each search type has different complexity (messages: full-text, people: structured data, files: metadata)
- Allows independent scaling/optimization
- Cleaner error handling per type
- Follows existing pattern in codebase

### 2. Text Search Strategy

**For People**:
- Index on `User.name` and `User.email`
- Support nickname/handle search if available
- Consider fuzzy matching like channels do

**For Files**:
- Index on `FileAttachment.name` (filename)
- Support extension filtering (`.pdf`, `.jpg`)
- For production: full-text on filename + MIME type

**SQLite vs PostgreSQL**:
- Current: `LIKE '%query%'` works for prototyping
- Production: Use PostgreSQL tsvector/tsquery
- Schema comment (line 18-20) notes this migration path

### 3. Access Control Pattern

**Verified Implementation**:
```typescript
// 1. Get user's channels
const channels = await prisma.channel.findMany({
  where: {
    workspaceMemberships: { some: { userId } }
  },
  select: { id: true }
});

// 2. Query only from those channels
const results = await prisma.fileAttachment.findMany({
  where: {
    message: {
      channelId: { in: channels.map(c => c.id) }
    }
  }
});
```

**Never**: Return results user shouldn't see (private channel files, etc.)

### 4. Pagination & Performance

**Cursor-Based Pagination** (preferred):
```typescript
// Client passes last result's ID
const res = await fetch(`...?cursor=${lastMessageId}&limit=20`);

// Backend
const results = await prisma.message.findMany({
  cursor: { id: cursor },
  skip: 1,  // Skip the cursor itself
  take: 21, // Take one extra to check if more exist
});
```

**Why Cursor > Offset**:
- Efficient with large datasets
- Handles deletions between requests
- No "gap" problems with pagination
- Supported natively by Prisma

### 5. Real-Time Considerations

**Current**: Polling-based (useSearch hook fetches on query change)

**Future Enhancements**:
- Could add socket events for user online status changes (for people search)
- Could add socket events for file uploads (for file search)
- But search UI typically doesn't require real-time updates

---

## Files to Create/Modify

### New Files

```
search/
├── people.ts              # searchPeople() function
├── files.ts               # searchFiles() function
└── types.ts               # Add UserSearchResult, PeopleSearchResponse, etc.

app/api/workspaces/[workspaceId]/
├── search/
│   ├── route.ts           # Existing (modify to handle route)
│   ├── people/
│   │   └── route.ts       # New: people search endpoint
│   └── files/
│       └── route.ts       # New: files search endpoint

search/components/
└── SearchResultItem.tsx   # Extract result item rendering (people/files)
```

### Modified Files

```
search/components/SearchModal.tsx
  - Remove people placeholder (lines 661-667)
  - Remove files placeholder (lines 669-676)
  - Add peopleResults rendering
  - Add fileResults rendering
  - Add navigation handlers for both

shared/hooks/useSearch.ts
  - Extend to fetch people results
  - Extend to fetch file results
  - Decide on unified results or separate state

search/types.ts
  - Add: UserSearchResult interface
  - Add: PeopleSearchResponse interface
  - Add: FileSearchResult interface
  - Add: FileSearchResponse interface
```

---

## Constants & Configuration

From `shared/lib/constants.ts`:
- `SEARCH_RESULTS_LIMIT` = 20 (default page size)
- `MAX_SEARCH_RESULTS` = 50 (maximum allowed limit)

These apply to all search types (messages, people, files).

---

## Testing Scenarios

### People Search
1. ✅ Search by full name: "john" finds "John Smith"
2. ✅ Search by partial name: "smit" finds "John Smith"
3. ✅ Search by email: "john@" finds "john@example.com"
4. ✅ Case-insensitive: "JOHN" finds "john"
5. ✅ Access control: Can't see people from channels they're not in
6. ✅ Pagination: Load 20, can load more with cursor
7. ✅ Keyboard nav: Arrow keys, Enter to select
8. ✅ No results: Empty state with helpful message

### Files Search
1. ✅ Search by filename: "report" finds "Q1_report.pdf"
2. ✅ Filter by type: `type:image` finds only images
3. ✅ Filter by extension: `.pdf` finds PDF files
4. ✅ Date range: `before:2024-01-01` finds older files
5. ✅ User filter: `from:@john` finds files uploaded by John
6. ✅ Channel filter: `in:#general` finds files in general
7. ✅ Size filter: `size:>1MB` finds large files
8. ✅ Access control: Can't see files from channels they're not in
9. ✅ Pagination: Works with cursor
10. ✅ Image preview: Shows thumbnail for images
11. ✅ Click to download/open: Navigates to message or downloads

---

## References

- **Search Modal**: `search/components/SearchModal.tsx`
- **Message Search Queries**: `search/queries.ts`
- **Search Types**: `search/types.ts`
- **Search Hook**: `shared/hooks/useSearch.ts`
- **Search API**: `app/api/workspaces/[workspaceId]/search/route.ts`
- **Prisma Schema**: `prisma/schema.prisma` (User, FileAttachment, ChannelMember models)
- **Constants**: `shared/lib/constants.ts`

---

## Appendix: Code Snippets for Implementation

### Snippet 1: searchPeople() Function Skeleton

```typescript
// search/people.ts

import { prisma } from '@/shared/lib/prisma';
import type { SearchFilters } from './types';

export async function searchPeople(
  workspaceId: string,
  userId: string,
  query: string,
  cursor?: string,
  limit: number = 20
) {
  // 1. Get channels user has access to
  const accessibleChannels = await prisma.channel.findMany({
    where: {
      workspaceId,
      members: { some: { userId } },
    },
    select: { id: true, name: true },
  });
  const channelIds = accessibleChannels.map(c => c.id);

  // 2. Find users in workspace who match query
  // Filter to users in at least one channel the user can see
  const where = {
    workspaceMemberships: {
      some: { workspaceId },
    },
    name: { contains: query },
  };

  const total = await prisma.user.count({ where });

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      image: true,
      email: true,
      title: true,
      statusText: true,
      statusEmoji: true,
    },
    orderBy: { name: 'asc' },
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });

  // 3. For each user, find channels they're in (that current user can see)
  // This could be omitted for simple version

  const hasMore = users.length > limit;
  const results = users.slice(0, limit);
  const nextCursor = hasMore ? results[results.length - 1]?.id : null;

  return {
    results: results.map(u => ({
      user: {
        id: u.id,
        name: u.name ?? 'Unknown',
        image: u.image,
        email: u.email,
        title: u.title,
        statusText: u.statusText,
        statusEmoji: u.statusEmoji,
      },
      channelNames: [], // Optional: could populate this
      highlights: [],   // Optional: could show which fields matched
    })),
    cursor: nextCursor,
    hasMore,
    total,
  };
}
```

### Snippet 2: searchFiles() Function Skeleton

```typescript
// search/files.ts

import { prisma } from '@/shared/lib/prisma';

export async function searchFiles(
  workspaceId: string,
  userId: string,
  query: string,
  cursor?: string,
  limit: number = 20
) {
  // 1. Get channels user has access to
  const accessibleChannels = await prisma.channel.findMany({
    where: {
      workspaceId,
      members: { some: { userId } },
    },
    select: { id: true, name: true },
  });
  const channelIds = accessibleChannels.map(c => c.id);

  // 2. Find files in accessible channels
  const where = {
    message: {
      channel: {
        id: { in: channelIds },
      },
      isDeleted: false,
    },
    name: { contains: query }, // Filename search
  };

  const total = await prisma.fileAttachment.count({ where });

  const files = await prisma.fileAttachment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    include: {
      message: {
        select: { id: true, channelId: true },
      },
      user: {
        select: { id: true, name: true, image: true },
      },
    },
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });

  const hasMore = files.length > limit;
  const results = files.slice(0, limit);
  const nextCursor = hasMore ? results[results.length - 1]?.id : null;

  // Get channel names
  const channelMap = new Map(
    accessibleChannels.map(c => [c.id, c.name])
  );

  return {
    results: results.map(f => ({
      file: {
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size,
        url: f.url,
        width: f.width,
        height: f.height,
        createdAt: f.createdAt,
        uploader: {
          id: f.user.id,
          name: f.user.name ?? 'Unknown',
          image: f.user.image,
        },
      },
      message: {
        id: f.message!.id,
        channelId: f.message!.channelId,
        channelName: channelMap.get(f.message!.channelId) ?? 'unknown',
      },
      highlights: [],
    })),
    cursor: nextCursor,
    hasMore,
    total,
  };
}
```

### Snippet 3: People Result Item Component

```typescript
// search/components/PeopleResultItem.tsx

import { User as UserIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { dropdownItemVariants } from '@/shared/lib/animations';
import { cn } from '@/shared/lib/utils';

interface PeopleResultItemProps {
  user: { id: string; name: string; image: string | null; title?: string };
  isSelected: boolean;
  onClick: () => void;
}

export function PeopleResultItem({
  user,
  isSelected,
  onClick,
}: PeopleResultItemProps) {
  return (
    <motion.button
      data-result-item
      variants={dropdownItemVariants}
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors text-left',
        isSelected && 'bg-accent'
      )}
    >
      {user.image ? (
        <img
          src={user.image}
          alt={user.name}
          className="h-8 w-8 rounded-full shrink-0"
        />
      ) : (
        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
          <UserIcon className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="font-medium text-foreground">{user.name}</div>
        {user.title && (
          <div className="text-xs text-muted-foreground truncate">
            {user.title}
          </div>
        )}
      </div>
    </motion.button>
  );
}
```

---

**Document Version**: 1.0
**Status**: Ready for implementation worker assignment
**Next Steps**: Workers should reference this for People & Files tab implementation
