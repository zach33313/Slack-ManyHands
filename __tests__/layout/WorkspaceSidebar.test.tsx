/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock tooltip components to render children directly
jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="tooltip">{children}</span>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mutable store state
let storeState: Record<string, unknown> = {};
const mockSetSidebarOpen = jest.fn();

function resetStoreState(overrides: Record<string, unknown> = {}) {
  storeState = {
    workspaces: [],
    currentWorkspace: null,
    unreadCounts: {},
    channels: [],
    setSidebarOpen: mockSetSidebarOpen,
    ...overrides,
  };
}

jest.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: Function) => selector(storeState),
    { getState: () => storeState }
  ),
}));

import { WorkspaceSidebar } from '@/components/layout/WorkspaceSidebar';

const makeWorkspace = (overrides: Record<string, unknown> = {}) => ({
  id: 'ws-1',
  name: 'Acme Corp',
  slug: 'acme',
  iconUrl: null,
  ownerId: 'u1',
  createdAt: new Date(),
  ...overrides,
});

describe('WorkspaceSidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStoreState();
  });

  it('renders workspace buttons with initials', () => {
    resetStoreState({
      workspaces: [makeWorkspace()],
    });
    render(<WorkspaceSidebar />);
    expect(screen.getByText('AC')).toBeInTheDocument();
  });

  it('renders multiple workspaces', () => {
    resetStoreState({
      workspaces: [
        makeWorkspace({ id: 'ws-1', name: 'Acme Corp', slug: 'acme' }),
        makeWorkspace({ id: 'ws-2', name: 'Test Inc', slug: 'test' }),
      ],
    });
    render(<WorkspaceSidebar />);
    expect(screen.getByText('AC')).toBeInTheDocument();
    expect(screen.getByText('TI')).toBeInTheDocument();
  });

  it('renders workspace image when iconUrl is provided', () => {
    resetStoreState({
      workspaces: [makeWorkspace({ name: 'Acme', iconUrl: '/icon.png' })],
    });
    render(<WorkspaceSidebar />);
    const img = screen.getByAltText('Acme');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/icon.png');
  });

  it('navigates to workspace slug on click', () => {
    resetStoreState({
      workspaces: [makeWorkspace()],
    });
    render(<WorkspaceSidebar />);
    fireEvent.click(screen.getByText('AC'));
    expect(mockPush).toHaveBeenCalledWith('/acme');
  });

  it('closes sidebar on mobile after workspace click', () => {
    resetStoreState({
      workspaces: [makeWorkspace()],
    });
    render(<WorkspaceSidebar />);
    fireEvent.click(screen.getByText('AC'));
    expect(mockSetSidebarOpen).toHaveBeenCalledWith(false);
  });

  it('highlights the active workspace with primary background', () => {
    const ws = makeWorkspace();
    resetStoreState({
      workspaces: [ws],
      currentWorkspace: ws,
    });
    render(<WorkspaceSidebar />);
    const button = screen.getByText('AC').closest('button');
    expect(button?.className).toContain('bg-primary');
  });

  it('does not show unread badge on active workspace', () => {
    const ws = makeWorkspace();
    resetStoreState({
      workspaces: [ws],
      currentWorkspace: ws,
      channels: [{ id: 'ch-1', unreadCount: 5 }],
    });
    render(<WorkspaceSidebar />);
    // Badge text would show "5" if displayed — it should not be in the DOM
    // because badge is hidden when workspace isActive
    expect(screen.queryByText('5')).not.toBeInTheDocument();
  });

  it('renders the create workspace button', () => {
    render(<WorkspaceSidebar />);
    // The "Create workspace" text appears in TooltipContent
    expect(screen.getByText('Create workspace')).toBeInTheDocument();
  });

  it('shows workspace name in tooltip', () => {
    resetStoreState({
      workspaces: [makeWorkspace({ name: 'Acme Corp' })],
    });
    render(<WorkspaceSidebar />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });
});
