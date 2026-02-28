/**
 * @jest-environment jsdom
 */

/**
 * __tests__/search/SearchModal.tabs.test.tsx
 *
 * Tests for People and Files tabs in search/components/SearchModal.tsx
 *
 * Test cases (as specified):
 *  1. People tab renders user results with avatar, name, email, and role
 *  2. People tab shows loading skeleton during fetch
 *  3. People tab shows empty state when no results
 *  4. Files tab renders file results with icon, name, size, and uploader
 *  5. Files tab shows loading skeleton during fetch
 *  6. Files tab shows empty state when no results
 *  7. Search is debounced (300ms)
 *  8. No 'coming soon' placeholder text remains in either tab
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

// ---------------------------------------------------------------------------
// Store mock  (@/store → useAppStore)
// The SearchModal calls useAppStore((s) => s.channels), .user, .presenceMap.
// ---------------------------------------------------------------------------

let mockStoreChannels: any[] = [];
let mockStorePresenceMap: Record<string, string> = {};

jest.mock('@/store', () => ({
  useAppStore: (selector: any) =>
    selector({ channels: mockStoreChannels, user: null, presenceMap: mockStorePresenceMap }),
}));

// ---------------------------------------------------------------------------
// Router mock
// ---------------------------------------------------------------------------

const mockPush = jest.fn();

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

// ---------------------------------------------------------------------------
// useSearch mock — controllable external state
// ---------------------------------------------------------------------------

const mockSetQuery = jest.fn();

const defaultUseSearchReturn = {
  query: '',
  setQuery: mockSetQuery,
  results: [] as any[],
  isLoading: false,
  error: null as string | null,
  total: 0,
  filters: { query: '' },
  setFilters: jest.fn(),
  hasMore: false,
  loadMore: jest.fn(),
};

let useSearchState = { ...defaultUseSearchReturn };

jest.mock('../../shared/hooks/useSearch', () => ({
  useSearch: () => useSearchState,
}));

// ---------------------------------------------------------------------------
// useDebounce mock — return value immediately (no delay); records call args
// so we can assert the 300ms delay is wired correctly.
// ---------------------------------------------------------------------------

const mockUseDebounce = jest.fn(<T,>(value: T, _delay?: number): T => value);

jest.mock('../../shared/hooks/useDebounce', () => ({
  useDebounce: mockUseDebounce,
}));

// ---------------------------------------------------------------------------
// Shared lib mocks
// ---------------------------------------------------------------------------

jest.mock('@/shared/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
  formatFileSize: (bytes: number) =>
    bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`,
}));

jest.mock('@/shared/lib/animations', () => ({
  modalVariants: {},
  backdropVariants: {},
  staggerContainer: {},
  dropdownItemVariants: {},
}));

// ---------------------------------------------------------------------------
// date-fns mock
// ---------------------------------------------------------------------------

jest.mock('date-fns', () => ({
  formatDistanceToNow: () => '2 days ago',
}));

// ---------------------------------------------------------------------------
// @/members/components/UserAvatar mock
// ---------------------------------------------------------------------------

jest.mock('@/members/components/UserAvatar', () => ({
  UserAvatar: ({ user }: any) => (
    <div data-testid="user-avatar" data-user-id={user?.id} aria-label={user?.name ?? '?'} />
  ),
}));

// ---------------------------------------------------------------------------
// @/channels/actions mock
// ---------------------------------------------------------------------------

jest.mock('@/channels/actions', () => ({
  openDM: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// framer-motion mock — strip animation-specific props, render plain HTML
// ---------------------------------------------------------------------------

jest.mock('framer-motion', () => {
  function strip({ children, variants, initial, animate, exit, transition, whileHover, whileTap, ...rest }: any) {
    return { children, rest };
  }
  return {
    motion: {
      div: (props: any) => {
        const { children, rest } = strip(props);
        return <div {...rest}>{children}</div>;
      },
      button: (props: any) => {
        const { children, rest } = strip(props);
        return <button {...rest}>{children}</button>;
      },
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

// ---------------------------------------------------------------------------
// lucide-react mock — simple testable icons
// ---------------------------------------------------------------------------

jest.mock('lucide-react', () => ({
  Search:        () => <span data-testid="icon-search" />,
  X:             () => <span data-testid="icon-x" />,
  Hash:          () => <span data-testid="icon-hash" />,
  User:          () => <span data-testid="icon-user" />,
  Paperclip:     () => <span data-testid="icon-paperclip" />,
  Clock:         () => <span data-testid="icon-clock" />,
  Loader2:       () => <span data-testid="icon-loader2" />,
  MessageSquare: () => <span data-testid="icon-message-square" />,
  Zap:           () => <span data-testid="icon-zap" />,
  ChevronRight:  () => <span data-testid="icon-chevron-right" />,
  Users:         () => <span data-testid="icon-users" />,
  Bell:          () => <span data-testid="icon-bell" />,
  Moon:          () => <span data-testid="icon-moon" />,
  Sun:           () => <span data-testid="icon-sun" />,
  Settings:      () => <span data-testid="icon-settings" />,
  Phone:         () => <span data-testid="icon-phone" />,
  Plus:          () => <span data-testid="icon-plus" />,
  FileText:      () => <span data-testid="icon-file-text" />,
  FileImage:     () => <span data-testid="icon-file-image" />,
  FileVideo:     () => <span data-testid="icon-file-video" />,
  Music:         () => <span data-testid="icon-music" />,
  File:          () => <span data-testid="icon-file" />,
  Download:      () => <span data-testid="icon-download" />,
  ExternalLink:  () => <span data-testid="icon-external-link" />,
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { SearchModal } from '../../search/components/SearchModal';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type PersonFixture = {
  id?: string;
  name?: string | null;
  email?: string;
  image?: string | null;
  role?: string;
  title?: string | null;
  statusText?: string | null;
  statusEmoji?: string | null;
};

function makePerson(overrides: PersonFixture = {}) {
  return {
    id:          overrides.id          ?? 'user-1',
    name:        overrides.name        ?? 'Alice Smith',
    email:       overrides.email       ?? 'alice@example.com',
    image:       overrides.image       ?? null,
    role:        overrides.role        ?? 'MEMBER',
    title:       overrides.title       ?? null,
    statusText:  overrides.statusText  ?? null,
    statusEmoji: overrides.statusEmoji ?? null,
  };
}

type FileFixture = {
  id?: string;
  name?: string;
  url?: string;
  size?: number;
  mimeType?: string;
  uploadedBy?: { id: string; name: string | null; image: string | null };
  channelName?: string;
  createdAt?: string;
};

function makeFile(overrides: FileFixture = {}) {
  return {
    id:          overrides.id          ?? 'file-1',
    name:        overrides.name        ?? 'report.pdf',
    url:         overrides.url         ?? 'https://example.com/report.pdf',
    size:        overrides.size        ?? 20480,   // 20 KB
    mimeType:    overrides.mimeType    ?? 'application/pdf',
    uploadedBy:  overrides.uploadedBy  ?? { id: 'u2', name: 'Bob Jones', image: null },
    channelName: overrides.channelName ?? 'general',
    createdAt:   overrides.createdAt   ?? new Date('2026-01-01').toISOString(),
  };
}

/** Mock global.fetch to resolve once with a JSON-shaped response */
function mockFetchOk(data: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  } as Response);
}

/** Mock global.fetch to a promise that never settles (simulates in-flight request) */
function mockFetchPending() {
  global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderModal() {
  return render(<SearchModal workspaceId="ws-1" workspaceSlug="test-workspace" />);
}

/** Click the sidebar trigger button to open the modal. */
function openModal() {
  // Trigger is: <button><Search icon /><span>Search</span><kbd /></button>
  fireEvent.click(screen.getByText('Search'));
}

/** Click a tab by its exact visible label. */
function clickTab(label: string) {
  // Tab buttons live in the tabs strip; label is e.g. "People" or "Files"
  fireEvent.click(screen.getByRole('button', { name: label }));
}

// ---------------------------------------------------------------------------
// Global setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();

  // Reset controllable state
  useSearchState   = { ...defaultUseSearchReturn };
  mockStoreChannels      = [];
  mockStorePresenceMap   = {};
  localStorage.clear();

  // Default fetch → returns empty results (individual tests override as needed)
  mockFetchOk({ ok: true, data: [] });
});

// ===========================================================================
// Tests
// ===========================================================================

describe('SearchModal — People tab', () => {
  // -------------------------------------------------------------------------
  // Test 1: renders user results with avatar, name, email, and role
  // -------------------------------------------------------------------------

  it('renders user result with avatar, name, email, and role badge', async () => {
    const person = makePerson({
      name: 'Alice Smith',
      email: 'alice@example.com',
      role: 'OWNER',
      statusText: null,
      title: null, // ensures email falls through to secondary line
    });
    mockFetchOk({ ok: true, data: [person] });
    useSearchState = { ...defaultUseSearchReturn, query: 'alice' };

    renderModal();
    openModal();
    clickTab('People');

    await waitFor(() => {
      // Name rendered
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    // Avatar rendered (via UserAvatar mock)
    expect(screen.getByTestId('user-avatar')).toBeInTheDocument();

    // Email shown in secondary row (no statusText or title, so email is the fallback)
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();

    // OWNER role badge shown
    expect(screen.getByText('Owner')).toBeInTheDocument();
  });

  it('shows email as the secondary line when person has no status text or title', async () => {
    const person = makePerson({
      email: 'nobody@example.com',
      statusText: null,
      title: null,
    });
    mockFetchOk({ ok: true, data: [person] });
    useSearchState = { ...defaultUseSearchReturn, query: 'nobody' };

    renderModal();
    openModal();
    clickTab('People');

    await waitFor(() => expect(screen.getByText('nobody@example.com')).toBeInTheDocument());
  });

  it('shows statusText as the secondary line when available', async () => {
    const person = makePerson({ statusText: 'On vacation 🌴', email: 'bob@ex.com' });
    mockFetchOk({ ok: true, data: [person] });
    useSearchState = { ...defaultUseSearchReturn, query: 'bob' };

    renderModal();
    openModal();
    clickTab('People');

    await waitFor(() => expect(screen.getByText('On vacation 🌴')).toBeInTheDocument());
    // Email not shown when statusText is present
    expect(screen.queryByText('bob@ex.com')).not.toBeInTheDocument();
  });

  it('shows Owner badge for OWNER role', async () => {
    const person = makePerson({ name: 'Carol', role: 'OWNER' });
    mockFetchOk({ ok: true, data: [person] });
    useSearchState = { ...defaultUseSearchReturn, query: 'carol' };

    renderModal();
    openModal();
    clickTab('People');

    await waitFor(() => expect(screen.getByText('Owner')).toBeInTheDocument());
  });

  it('shows Admin badge for ADMIN role', async () => {
    const person = makePerson({ name: 'Dave', role: 'ADMIN' });
    mockFetchOk({ ok: true, data: [person] });
    useSearchState = { ...defaultUseSearchReturn, query: 'dave' };

    renderModal();
    openModal();
    clickTab('People');

    await waitFor(() => expect(screen.getByText('Admin')).toBeInTheDocument());
  });

  it('shows no role badge for regular MEMBER', async () => {
    const person = makePerson({ name: 'Eve', role: 'MEMBER' });
    mockFetchOk({ ok: true, data: [person] });
    useSearchState = { ...defaultUseSearchReturn, query: 'eve' };

    renderModal();
    openModal();
    clickTab('People');

    await waitFor(() => expect(screen.getByText('Eve')).toBeInTheDocument());
    expect(screen.queryByText('Owner')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('shows result count heading (People (N))', async () => {
    const people = [
      makePerson({ id: 'u1', name: 'Alice' }),
      makePerson({ id: 'u2', name: 'Alan' }),
    ];
    mockFetchOk({ ok: true, data: people });
    useSearchState = { ...defaultUseSearchReturn, query: 'al' };

    renderModal();
    openModal();
    clickTab('People');

    await waitFor(() => expect(screen.getByText('People (2)')).toBeInTheDocument());
  });

  it('fetches /api/search/people with workspaceId and query params', async () => {
    mockFetchOk({ ok: true, data: [] });
    useSearchState = { ...defaultUseSearchReturn, query: 'alice' };

    renderModal();
    openModal();
    clickTab('People');

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [[url]] = (global.fetch as jest.Mock).mock.calls;
    expect(url).toContain('/api/search/people');
    expect(url).toContain('workspaceId=ws-1');
    expect(url).toContain('q=alice');
  });

  // -------------------------------------------------------------------------
  // Test 2: loading skeleton during fetch
  // -------------------------------------------------------------------------

  it('shows loading skeleton while people fetch is in flight', async () => {
    mockFetchPending(); // never settles
    useSearchState = { ...defaultUseSearchReturn, query: 'alice' };

    renderModal();
    openModal();
    clickTab('People');

    await waitFor(() => {
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });
    // Results not shown while loading
    expect(screen.queryByTestId('user-avatar')).not.toBeInTheDocument();
  });

  it('hides loading skeleton once results arrive', async () => {
    const person = makePerson({ name: 'Alice' });
    mockFetchOk({ ok: true, data: [person] });
    useSearchState = { ...defaultUseSearchReturn, query: 'alice' };

    renderModal();
    openModal();
    clickTab('People');

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(document.querySelector('.animate-pulse')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 3: empty state when no results
  // -------------------------------------------------------------------------

  it('shows empty state message when search returns no people', async () => {
    mockFetchOk({ ok: true, data: [] });
    useSearchState = { ...defaultUseSearchReturn, query: 'zzz' };

    renderModal();
    openModal();
    clickTab('People');

    await waitFor(() => {
      expect(screen.getByText(/no people found/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('user-avatar')).not.toBeInTheDocument();
  });

  it('includes the search term in the empty state message', async () => {
    mockFetchOk({ ok: true, data: [] });
    useSearchState = { ...defaultUseSearchReturn, query: 'nobody' };

    renderModal();
    openModal();
    clickTab('People');

    await waitFor(() => {
      expect(screen.getByText(/nobody/)).toBeInTheDocument();
    });
  });

  it('shows prompt to type when People tab is active with empty query', () => {
    useSearchState = { ...defaultUseSearchReturn, query: '' };

    renderModal();
    openModal();
    clickTab('People');

    // No fetch should happen for empty query
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText('Search for people')).toBeInTheDocument();
  });

  it('does NOT fetch people when the query is empty', () => {
    useSearchState = { ...defaultUseSearchReturn, query: '' };

    renderModal();
    openModal();
    clickTab('People');

    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Files tab
// ===========================================================================

describe('SearchModal — Files tab', () => {
  // -------------------------------------------------------------------------
  // Test 4: renders file results with icon, name, size, and uploader
  // -------------------------------------------------------------------------

  it('renders file result with icon, filename, formatted size, and uploader name', async () => {
    const file = makeFile({
      name: 'report.pdf',
      size: 20480,
      mimeType: 'application/pdf',
      uploadedBy: { id: 'u2', name: 'Bob Jones', image: null },
    });
    mockFetchOk({ ok: true, data: [file] });
    useSearchState = { ...defaultUseSearchReturn, query: 'report' };

    renderModal();
    openModal();
    clickTab('Files');

    await waitFor(() => {
      expect(screen.getByText('report.pdf')).toBeInTheDocument();
    });

    // Formatted file size
    expect(screen.getByText('20.0 KB')).toBeInTheDocument();

    // Uploader name
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();

    // PDF → FileText icon
    expect(screen.getByTestId('icon-file-text')).toBeInTheDocument();
  });

  it('renders image files with an <img> thumbnail instead of an icon', async () => {
    const file = makeFile({
      name: 'photo.png',
      mimeType: 'image/png',
      url: 'https://example.com/photo.png',
    });
    mockFetchOk({ ok: true, data: [file] });
    useSearchState = { ...defaultUseSearchReturn, query: 'photo' };

    renderModal();
    openModal();
    clickTab('Files');

    await waitFor(() => expect(screen.getByText('photo.png')).toBeInTheDocument());
    // Image files get an <img> tag with alt = filename
    expect(screen.getByAltText('photo.png')).toBeInTheDocument();
  });

  it('shows the correct icon for image files when mimeType is image/*', async () => {
    // For image files the component renders an img, not getMimeIcon, so no icon data-testid
    // But for other mime types (audio, video, doc) it uses icons:
    const audioFile = makeFile({ name: 'track.mp3', mimeType: 'audio/mpeg' });
    mockFetchOk({ ok: true, data: [audioFile] });
    useSearchState = { ...defaultUseSearchReturn, query: 'track' };

    renderModal();
    openModal();
    clickTab('Files');

    await waitFor(() => expect(screen.getByText('track.mp3')).toBeInTheDocument());
    expect(screen.getByTestId('icon-music')).toBeInTheDocument();
  });

  it('renders the channel name prefixed with # where the file was uploaded', async () => {
    const file = makeFile({ channelName: 'design' });
    mockFetchOk({ ok: true, data: [file] });
    useSearchState = { ...defaultUseSearchReturn, query: 'report' };

    renderModal();
    openModal();
    clickTab('Files');

    await waitFor(() => expect(screen.getByText('#design')).toBeInTheDocument());
  });

  it('shows "Unknown" for uploader when name is null', async () => {
    const file = makeFile({ uploadedBy: { id: 'u3', name: null, image: null } });
    mockFetchOk({ ok: true, data: [file] });
    useSearchState = { ...defaultUseSearchReturn, query: 'report' };

    renderModal();
    openModal();
    clickTab('Files');

    await waitFor(() => expect(screen.getByText('Unknown')).toBeInTheDocument());
  });

  it('shows result count heading (Files (N))', async () => {
    const files = [
      makeFile({ id: 'f1', name: 'a.pdf' }),
      makeFile({ id: 'f2', name: 'b.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      makeFile({ id: 'f3', name: 'c.mp4',  mimeType: 'video/mp4' }),
    ];
    mockFetchOk({ ok: true, data: files });
    useSearchState = { ...defaultUseSearchReturn, query: 'file' };

    renderModal();
    openModal();
    clickTab('Files');

    await waitFor(() => expect(screen.getByText('Files (3)')).toBeInTheDocument());
  });

  it('fetches /api/search/files with workspaceId and query params', async () => {
    mockFetchOk({ ok: true, data: [] });
    useSearchState = { ...defaultUseSearchReturn, query: 'report' };

    renderModal();
    openModal();
    clickTab('Files');

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [[url]] = (global.fetch as jest.Mock).mock.calls;
    expect(url).toContain('/api/search/files');
    expect(url).toContain('workspaceId=ws-1');
    expect(url).toContain('q=report');
  });

  // -------------------------------------------------------------------------
  // Test 5: loading skeleton during fetch
  // -------------------------------------------------------------------------

  it('shows loading skeleton while files fetch is in flight', async () => {
    mockFetchPending();
    useSearchState = { ...defaultUseSearchReturn, query: 'report' };

    renderModal();
    openModal();
    clickTab('Files');

    await waitFor(() => {
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });
    expect(screen.queryByText('report.pdf')).not.toBeInTheDocument();
  });

  it('hides loading skeleton once file results arrive', async () => {
    const file = makeFile({ name: 'result.pdf' });
    mockFetchOk({ ok: true, data: [file] });
    useSearchState = { ...defaultUseSearchReturn, query: 'result' };

    renderModal();
    openModal();
    clickTab('Files');

    await waitFor(() => expect(screen.getByText('result.pdf')).toBeInTheDocument());
    expect(document.querySelector('.animate-pulse')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test 6: empty state when no results
  // -------------------------------------------------------------------------

  it('shows empty state message when search returns no files', async () => {
    mockFetchOk({ ok: true, data: [] });
    useSearchState = { ...defaultUseSearchReturn, query: 'zzz' };

    renderModal();
    openModal();
    clickTab('Files');

    await waitFor(() => {
      expect(screen.getByText(/no files found/i)).toBeInTheDocument();
    });
  });

  it('includes the search term in the files empty state message', async () => {
    mockFetchOk({ ok: true, data: [] });
    useSearchState = { ...defaultUseSearchReturn, query: 'missing' };

    renderModal();
    openModal();
    clickTab('Files');

    await waitFor(() => {
      expect(screen.getByText(/missing/)).toBeInTheDocument();
    });
  });

  it('shows prompt to type when Files tab is active with empty query', () => {
    useSearchState = { ...defaultUseSearchReturn, query: '' };

    renderModal();
    openModal();
    clickTab('Files');

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText('Search for files')).toBeInTheDocument();
  });

  it('does NOT fetch files when the query is empty', () => {
    useSearchState = { ...defaultUseSearchReturn, query: '' };

    renderModal();
    openModal();
    clickTab('Files');

    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Test 7: Debounce
// ===========================================================================

describe('SearchModal — search debounce (300 ms)', () => {
  it('passes 300ms delay to useDebounce for people/files search', () => {
    useSearchState = { ...defaultUseSearchReturn, query: 'hello' };

    renderModal();
    openModal();

    // SearchModal does: const debouncedQuery = useDebounce(query, 300)
    expect(mockUseDebounce).toHaveBeenCalledWith('hello', 300);
  });

  it('does not fetch people until the debounced query is non-empty', () => {
    // Query is empty → debounced is also empty → no fetch
    useSearchState = { ...defaultUseSearchReturn, query: '' };

    renderModal();
    openModal();
    clickTab('People');

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not fetch files until the debounced query is non-empty', () => {
    useSearchState = { ...defaultUseSearchReturn, query: '' };

    renderModal();
    openModal();
    clickTab('Files');

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does NOT fetch people while on a different tab (All), only after switching to People', async () => {
    mockFetchOk({ ok: true, data: [] });
    useSearchState = { ...defaultUseSearchReturn, query: 'test' };

    renderModal();
    openModal();

    // Default tab is 'all' after opening — no people/files fetch yet
    expect(global.fetch).not.toHaveBeenCalled();

    // Switch to People tab → fetch fires
    clickTab('People');
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  it('does NOT fetch files while on the People tab', async () => {
    mockFetchOk({ ok: true, data: [] });
    useSearchState = { ...defaultUseSearchReturn, query: 'test' };

    renderModal();
    openModal();
    clickTab('People');

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    // The one fetch should be for people, not files
    const [[url]] = (global.fetch as jest.Mock).mock.calls;
    expect(url).toContain('/api/search/people');
    expect(url).not.toContain('/api/search/files');
  });
});

// ===========================================================================
// Test 8: No 'coming soon' placeholder text
// ===========================================================================

describe('SearchModal — no "coming soon" placeholder text', () => {
  it('People tab has no "coming soon" text', () => {
    renderModal();
    openModal();
    clickTab('People');

    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it('Files tab has no "coming soon" text', () => {
    renderModal();
    openModal();
    clickTab('Files');

    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it('People tab has no "not yet implemented" text', () => {
    renderModal();
    openModal();
    clickTab('People');

    expect(screen.queryByText(/not yet implemented/i)).not.toBeInTheDocument();
  });

  it('Files tab has no "not yet implemented" text', () => {
    renderModal();
    openModal();
    clickTab('Files');

    expect(screen.queryByText(/not yet implemented/i)).not.toBeInTheDocument();
  });

  it('People tab has no "placeholder" or "stub" text', () => {
    renderModal();
    openModal();
    clickTab('People');

    expect(screen.queryByText(/placeholder/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bstub\b/i)).not.toBeInTheDocument();
  });

  it('Files tab has no "placeholder" or "stub" text', () => {
    renderModal();
    openModal();
    clickTab('Files');

    expect(screen.queryByText(/placeholder/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bstub\b/i)).not.toBeInTheDocument();
  });
});
