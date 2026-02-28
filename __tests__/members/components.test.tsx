/**
 * Tests for members/components/
 *
 * Covers:
 * - UserAvatar: renders image or initials fallback, size variants, presence dot
 * - PresenceIndicator: correct colors for online/away/offline, reads from store
 * - MemberProfileCard: renders profile fields, role badge, Message button
 * - MemberList: groups by status, search filtering
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

// Mock the presence store
const mockPresenceStore: Record<string, any> = {
  presenceMap: {},
  typingByChannel: {},
};

jest.mock('@/presence/store', () => ({
  usePresenceStore: (selector: (state: any) => any) => selector(mockPresenceStore),
}));

// Mock Radix UI Dialog (simplified for testing)
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogClose: ({ children }: any) => <button>{children}</button>,
}));

// Mock Radix ScrollArea
jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: any) => <div className={className}>{children}</div>,
  ScrollBar: () => null,
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  MessageSquare: () => <span data-testid="icon-message" />,
  Clock: () => <span data-testid="icon-clock" />,
  Search: () => <span data-testid="icon-search" />,
}));

import { UserAvatar } from '@/members/components/UserAvatar';
import { PresenceIndicator } from '@/members/components/PresenceIndicator';
import { MemberProfileCard } from '@/members/components/MemberProfileCard';
import { MemberList } from '@/members/components/MemberList';
import { PresenceStatus, MemberRole } from '@/shared/types';

const testUser = {
  id: 'user-1',
  name: 'Alice Smith',
  email: 'alice@example.com',
  image: null as string | null,
  title: 'Engineer' as string | null,
  statusText: 'Working' as string | null,
  statusEmoji: '🧪' as string | null,
  timezone: 'America/New_York' as string | null,
};

const testMember = {
  id: 'member-1',
  workspaceId: 'ws-1',
  userId: 'user-1',
  role: MemberRole.OWNER,
  joinedAt: new Date('2024-01-01'),
  user: testUser,
};

// --- UserAvatar Tests ---

describe('UserAvatar', () => {
  it('renders initials when no image is set', () => {
    render(<UserAvatar user={{ id: 'user-1', name: 'Alice Smith', image: null }} />);

    expect(screen.getByText('AS')).toBeInTheDocument();
  });

  it('renders single initial for single name', () => {
    render(<UserAvatar user={{ id: 'user-1', name: 'Alice', image: null }} />);

    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders "U" initial when name is null', () => {
    render(<UserAvatar user={{ id: 'user-1', name: null, image: null }} />);

    expect(screen.getByText('U')).toBeInTheDocument();
  });

  it('renders image when image URL is provided', () => {
    render(
      <UserAvatar
        user={{ id: 'user-1', name: 'Alice', image: 'https://example.com/alice.jpg' }}
      />
    );

    const img = screen.getByAltText('Alice');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/alice.jpg');
  });

  it('applies correct size class for xs', () => {
    const { container } = render(
      <UserAvatar user={{ id: 'user-1', name: 'Alice', image: null }} size="xs" />
    );

    const fallback = container.querySelector('.h-5.w-5');
    expect(fallback).toBeInTheDocument();
  });

  it('applies correct size class for lg', () => {
    const { container } = render(
      <UserAvatar user={{ id: 'user-1', name: 'Alice', image: null }} size="lg" />
    );

    const fallback = container.querySelector('[class*="h-\\[72px\\]"]');
    expect(fallback).toBeInTheDocument();
  });

  it('shows PresenceIndicator when showPresence is true', () => {
    render(
      <UserAvatar
        user={{ id: 'user-1', name: 'Alice', image: null }}
        showPresence
      />
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does not show PresenceIndicator when showPresence is false', () => {
    render(
      <UserAvatar
        user={{ id: 'user-1', name: 'Alice', image: null }}
        showPresence={false}
      />
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('applies role=button when onClick is provided', () => {
    const onClick = jest.fn();
    const { container } = render(
      <UserAvatar
        user={{ id: 'user-1', name: 'Alice', image: null }}
        onClick={onClick}
      />
    );

    const button = container.querySelector('[role="button"]');
    expect(button).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = jest.fn();
    const { container } = render(
      <UserAvatar
        user={{ id: 'user-1', name: 'Alice', image: null }}
        onClick={onClick}
      />
    );

    const button = container.querySelector('[role="button"]')!;
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('uses deterministic color for same user ID', () => {
    const { container: container1 } = render(
      <UserAvatar user={{ id: 'same-id', name: 'X', image: null }} />
    );
    const { container: container2 } = render(
      <UserAvatar user={{ id: 'same-id', name: 'Y', image: null }} />
    );

    const fallback1 = container1.querySelector('[class*="bg-"]');
    const fallback2 = container2.querySelector('[class*="bg-"]');
    expect(fallback1?.className).toBe(fallback2?.className);
  });
});

// --- PresenceIndicator Tests ---

describe('PresenceIndicator', () => {
  it('shows green for online status', () => {
    mockPresenceStore.presenceMap = { 'user-1': PresenceStatus.ONLINE };

    render(<PresenceIndicator userId="user-1" />);

    const indicator = screen.getByRole('status');
    expect(indicator).toHaveClass('bg-green-500');
    expect(indicator).toHaveAttribute('aria-label', 'Status: online');
  });

  it('shows yellow for away status', () => {
    mockPresenceStore.presenceMap = { 'user-1': PresenceStatus.AWAY };

    render(<PresenceIndicator userId="user-1" />);

    const indicator = screen.getByRole('status');
    expect(indicator).toHaveClass('bg-yellow-500');
  });

  it('shows transparent/gray for offline status', () => {
    mockPresenceStore.presenceMap = { 'user-1': PresenceStatus.OFFLINE };

    render(<PresenceIndicator userId="user-1" />);

    const indicator = screen.getByRole('status');
    expect(indicator).toHaveClass('bg-transparent');
  });

  it('defaults to offline when user not in presenceMap', () => {
    mockPresenceStore.presenceMap = {};

    render(<PresenceIndicator userId="unknown-user" />);

    const indicator = screen.getByRole('status');
    expect(indicator).toHaveClass('bg-transparent');
    expect(indicator).toHaveAttribute('aria-label', 'Status: offline');
  });

  it('renders correct size class for sm variant', () => {
    mockPresenceStore.presenceMap = { 'user-1': PresenceStatus.ONLINE };

    const { container } = render(<PresenceIndicator userId="user-1" size="sm" />);

    const indicator = container.querySelector('.h-2\\.5');
    expect(indicator).toBeInTheDocument();
  });
});

// --- MemberProfileCard Tests ---

describe('MemberProfileCard', () => {
  beforeEach(() => {
    mockPresenceStore.presenceMap = {};
  });

  it('renders nothing when dialog is closed', () => {
    render(
      <MemberProfileCard
        member={testMember}
        open={false}
        onOpenChange={jest.fn()}
      />
    );

    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
  });

  it('renders display name when dialog is open', () => {
    render(
      <MemberProfileCard
        member={testMember}
        open={true}
        onOpenChange={jest.fn()}
      />
    );

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('renders title when present', () => {
    render(
      <MemberProfileCard
        member={testMember}
        open={true}
        onOpenChange={jest.fn()}
      />
    );

    expect(screen.getByText('Engineer')).toBeInTheDocument();
  });

  it('renders status emoji and text', () => {
    render(
      <MemberProfileCard
        member={testMember}
        open={true}
        onOpenChange={jest.fn()}
      />
    );

    expect(screen.getByText('🧪')).toBeInTheDocument();
    expect(screen.getByText('Working')).toBeInTheDocument();
  });

  it('renders role badge for OWNER', () => {
    render(
      <MemberProfileCard
        member={testMember}
        open={true}
        onOpenChange={jest.fn()}
      />
    );

    expect(screen.getByText('OWNER')).toBeInTheDocument();
  });

  it('renders role badge for ADMIN', () => {
    const adminMember = { ...testMember, role: MemberRole.ADMIN };
    render(
      <MemberProfileCard
        member={adminMember}
        open={true}
        onOpenChange={jest.fn()}
      />
    );

    expect(screen.getByText('ADMIN')).toBeInTheDocument();
  });

  it('does not render role badge for regular MEMBER', () => {
    const regularMember = { ...testMember, role: MemberRole.MEMBER };
    render(
      <MemberProfileCard
        member={regularMember}
        open={true}
        onOpenChange={jest.fn()}
      />
    );

    expect(screen.queryByText('MEMBER')).not.toBeInTheDocument();
  });

  it('renders Message button', () => {
    render(
      <MemberProfileCard
        member={testMember}
        open={true}
        onOpenChange={jest.fn()}
      />
    );

    expect(screen.getByText('Message')).toBeInTheDocument();
  });

  it('calls onMessageClick when Message button clicked', () => {
    const onMessageClick = jest.fn();
    const onOpenChange = jest.fn();
    render(
      <MemberProfileCard
        member={testMember}
        open={true}
        onOpenChange={onOpenChange}
        onMessageClick={onMessageClick}
      />
    );

    fireEvent.click(screen.getByText('Message'));
    expect(onMessageClick).toHaveBeenCalledWith('user-1');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('uses email as display name when name is null', () => {
    const noNameMember = {
      ...testMember,
      user: { ...testUser, name: null },
    };
    render(
      <MemberProfileCard
        member={noNameMember}
        open={true}
        onOpenChange={jest.fn()}
      />
    );

    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('renders timezone info when timezone is set', () => {
    render(
      <MemberProfileCard
        member={testMember}
        open={true}
        onOpenChange={jest.fn()}
      />
    );

    expect(screen.getByText(/America\/New_York/)).toBeInTheDocument();
    expect(screen.getByTestId('icon-clock')).toBeInTheDocument();
  });
});

// --- MemberList Tests ---

describe('MemberList', () => {
  const members = [
    testMember,
    {
      ...testMember,
      id: 'member-2',
      userId: 'user-2',
      role: MemberRole.ADMIN,
      user: {
        ...testUser,
        id: 'user-2',
        name: 'Bob Jones',
        email: 'bob@example.com',
        statusText: null,
        statusEmoji: null,
      },
    },
    {
      ...testMember,
      id: 'member-3',
      userId: 'user-3',
      role: MemberRole.MEMBER,
      user: {
        ...testUser,
        id: 'user-3',
        name: 'Charlie Brown',
        email: 'charlie@example.com',
        statusText: null,
        statusEmoji: null,
      },
    },
  ];

  beforeEach(() => {
    mockPresenceStore.presenceMap = {
      'user-1': PresenceStatus.ONLINE,
      'user-2': PresenceStatus.AWAY,
      // user-3 not set -> defaults to OFFLINE
    };
  });

  it('renders all members', () => {
    render(<MemberList members={members} />);

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
  });

  it('groups members by presence status', () => {
    render(<MemberList members={members} />);

    expect(screen.getByText(/Online/)).toBeInTheDocument();
    expect(screen.getByText(/Away/)).toBeInTheDocument();
    expect(screen.getByText(/Offline/)).toBeInTheDocument();
  });

  it('shows count in group headers', () => {
    render(<MemberList members={members} />);

    expect(screen.getByText(/Online — 1/)).toBeInTheDocument();
    expect(screen.getByText(/Away — 1/)).toBeInTheDocument();
    expect(screen.getByText(/Offline — 1/)).toBeInTheDocument();
  });

  it('shows role badges for OWNER and ADMIN', () => {
    render(<MemberList members={members} />);

    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('has a search input', () => {
    render(<MemberList members={members} />);

    expect(screen.getByPlaceholderText('Find members')).toBeInTheDocument();
  });

  it('filters members when search query typed', () => {
    render(<MemberList members={members} />);

    const searchInput = screen.getByPlaceholderText('Find members');
    fireEvent.change(searchInput, { target: { value: 'bob' } });

    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
    expect(screen.queryByText('Charlie Brown')).not.toBeInTheDocument();
  });

  it('shows "No members found" when search has no results', () => {
    render(<MemberList members={members} />);

    const searchInput = screen.getByPlaceholderText('Find members');
    fireEvent.change(searchInput, { target: { value: 'zzzzz' } });

    expect(screen.getByText('No members found')).toBeInTheDocument();
  });

  it('filters by email too', () => {
    render(<MemberList members={members} />);

    const searchInput = screen.getByPlaceholderText('Find members');
    fireEvent.change(searchInput, { target: { value: 'charlie@' } });

    expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
  });

  it('shows status text when member has one', () => {
    render(<MemberList members={members} />);

    expect(screen.getByText('Working')).toBeInTheDocument();
  });
});
