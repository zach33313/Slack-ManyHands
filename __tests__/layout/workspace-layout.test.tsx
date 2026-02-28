/**
 * Tests for workspace layout (app/(app)/[workspaceSlug]/layout.tsx)
 * redirect and validation logic.
 *
 * @jest-environment jsdom
 */

import React from 'react';

// Mock redirect/notFound to throw (like Next.js does)
const mockRedirect = jest.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
const mockNotFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

jest.mock('next/navigation', () => ({
  redirect: mockRedirect,
  notFound: mockNotFound,
}));

// Mock auth
const mockAuth = jest.fn();
jest.mock('@/auth/auth', () => ({
  auth: mockAuth,
}));

// Mock prisma with chainable methods
const mockFindUnique = jest.fn();
const mockFindMany = jest.fn();
const mockMessageCount = jest.fn();
const mockChannelMemberFindMany = jest.fn();

jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    workspace: { findUnique: mockFindUnique },
    workspaceMember: {
      findUnique: mockFindUnique,
      findMany: mockFindMany,
    },
    channelMember: { findMany: mockChannelMemberFindMany },
    channel: { findMany: mockFindMany },
    message: { count: mockMessageCount },
  },
}));

// Mock layout child components
jest.mock('@/components/layout/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));
jest.mock('@/components/layout/RightPanel', () => ({
  RightPanel: () => <div data-testid="right-panel" />,
}));
jest.mock('@/components/layout/WorkspaceHydrator', () => ({
  WorkspaceHydrator: () => null,
}));

import WorkspaceLayout from '@/app/(app)/[workspaceSlug]/layout';

describe('WorkspaceLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to /login when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(
      WorkspaceLayout({
        children: <div>child</div>,
        params: { workspaceSlug: 'acme' },
      })
    ).rejects.toThrow('NEXT_REDIRECT:/login');

    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });

  it('returns 404 for invalid workspace slug', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
    // workspace.findUnique returns null for invalid slug
    mockFindUnique.mockResolvedValueOnce(null);

    await expect(
      WorkspaceLayout({
        children: <div>child</div>,
        params: { workspaceSlug: 'nonexistent' },
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mockNotFound).toHaveBeenCalled();
  });

  it('redirects to / when user is not a workspace member', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
    // workspace.findUnique returns a workspace
    mockFindUnique.mockResolvedValueOnce({
      id: 'ws-1',
      name: 'Acme',
      slug: 'acme',
      iconUrl: null,
      ownerId: 'u2',
      createdAt: new Date(),
    });
    // workspaceMember.findUnique returns null (not a member)
    mockFindUnique.mockResolvedValueOnce(null);

    await expect(
      WorkspaceLayout({
        children: <div>child</div>,
        params: { workspaceSlug: 'acme' },
      })
    ).rejects.toThrow('NEXT_REDIRECT:/');

    expect(mockRedirect).toHaveBeenCalledWith('/');
  });
});
