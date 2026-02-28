/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChannelType } from '@/shared/types';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ workspaceSlug: 'test-workspace', channelId: 'ch-1' }),
}));

// Mock UI components
jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/separator', () => ({
  Separator: () => <hr />,
}));

// Mutable store state
let storeState: Record<string, unknown> = {};
const mockSetSidebarOpen = jest.fn();

function resetStoreState(overrides: Record<string, unknown> = {}) {
  storeState = {
    currentWorkspace: { id: 'ws-1', name: 'Test Workspace', slug: 'test-workspace' },
    channels: [],
    starredChannels: [],
    dmParticipants: {},
    setSidebarOpen: mockSetSidebarOpen,
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

import { ChannelSidebar } from '@/components/layout/ChannelSidebar';

const makeChannel = (overrides: Record<string, unknown> = {}) => ({
  id: 'ch-1',
  workspaceId: 'ws-1',
  name: 'general',
  description: null,
  type: ChannelType.PUBLIC,
  isArchived: false,
  createdById: 'u1',
  createdAt: new Date(),
  unreadCount: 0,
  memberCount: 5,
  ...overrides,
});

describe('ChannelSidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStoreState();
  });

  it('renders workspace name in the header', () => {
    resetStoreState();
    render(<ChannelSidebar />);
    expect(screen.getByText('Test Workspace')).toBeInTheDocument();
  });

  it('renders fallback workspace name when no workspace', () => {
    resetStoreState({ currentWorkspace: null });
    render(<ChannelSidebar />);
    expect(screen.getByText('Workspace')).toBeInTheDocument();
  });

  it('renders public channels in the Channels section', () => {
    resetStoreState({
      channels: [
        makeChannel({ id: 'ch-1', name: 'general', type: ChannelType.PUBLIC }),
        makeChannel({ id: 'ch-2', name: 'random', type: ChannelType.PUBLIC }),
      ],
    });
    render(<ChannelSidebar />);
    expect(screen.getByText('general')).toBeInTheDocument();
    expect(screen.getByText('random')).toBeInTheDocument();
  });

  it('renders DM channels in Direct Messages section', () => {
    resetStoreState({
      channels: [
        makeChannel({ id: 'dm-1', name: 'dm-u1-u2', type: ChannelType.DM }),
      ],
      dmParticipants: {
        'dm-1': [{ id: 'u2', name: 'Bob Jones', image: null }],
      },
    });
    render(<ChannelSidebar />);
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('shows unread count badge on channels with unreads', () => {
    resetStoreState({
      channels: [
        makeChannel({ id: 'ch-2', name: 'random', unreadCount: 3 }),
      ],
    });
    render(<ChannelSidebar />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows 99+ for high unread counts', () => {
    resetStoreState({
      channels: [
        makeChannel({ id: 'ch-2', name: 'random', unreadCount: 150 }),
      ],
    });
    render(<ChannelSidebar />);
    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('navigates to channel on click', () => {
    resetStoreState({
      channels: [
        makeChannel({ id: 'ch-2', name: 'random' }),
      ],
    });
    render(<ChannelSidebar />);
    fireEvent.click(screen.getByText('random'));
    expect(mockPush).toHaveBeenCalledWith('/test-workspace/channel/ch-2');
  });

  it('collapses the Channels section when header is clicked', () => {
    resetStoreState({
      channels: [
        makeChannel({ id: 'ch-1', name: 'general' }),
      ],
    });
    render(<ChannelSidebar />);
    expect(screen.getByText('general')).toBeInTheDocument();

    // Click the "Channels" section toggle
    fireEvent.click(screen.getByText('Channels'));
    expect(screen.queryByText('general')).not.toBeInTheDocument();
  });

  it('re-expands the Channels section when header is clicked again', () => {
    resetStoreState({
      channels: [
        makeChannel({ id: 'ch-1', name: 'general' }),
      ],
    });
    render(<ChannelSidebar />);

    // Collapse
    fireEvent.click(screen.getByText('Channels'));
    expect(screen.queryByText('general')).not.toBeInTheDocument();

    // Expand
    fireEvent.click(screen.getByText('Channels'));
    expect(screen.getByText('general')).toBeInTheDocument();
  });

  it('collapses the Direct Messages section', () => {
    resetStoreState({
      channels: [
        makeChannel({ id: 'dm-1', name: 'dm-u1-u2', type: ChannelType.DM }),
      ],
      dmParticipants: {
        'dm-1': [{ id: 'u2', name: 'Alice Smith', image: null }],
      },
    });
    render(<ChannelSidebar />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Direct Messages'));
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
  });

  it('shows starred section only when starred channels exist', () => {
    resetStoreState({
      channels: [
        makeChannel({ id: 'ch-1', name: 'general' }),
      ],
      starredChannels: [],
    });
    render(<ChannelSidebar />);
    expect(screen.queryByText('Starred')).not.toBeInTheDocument();
  });

  it('shows starred section with starred channels', () => {
    resetStoreState({
      channels: [
        makeChannel({ id: 'ch-1', name: 'general' }),
      ],
      starredChannels: ['ch-1'],
    });
    render(<ChannelSidebar />);
    expect(screen.getByText('Starred')).toBeInTheDocument();
  });

  it('closes sidebar on mobile after channel navigation', () => {
    resetStoreState({
      channels: [
        makeChannel({ id: 'ch-2', name: 'random' }),
      ],
    });
    render(<ChannelSidebar />);
    fireEvent.click(screen.getByText('random'));
    expect(mockSetSidebarOpen).toHaveBeenCalledWith(false);
  });
});
