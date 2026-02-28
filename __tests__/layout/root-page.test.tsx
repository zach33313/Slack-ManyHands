/**
 * Tests for root page (app/page.tsx) redirect logic.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock redirect to throw (like Next.js does) so execution halts
const mockRedirect = jest.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

jest.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

// Mock auth
const mockAuth = jest.fn();
jest.mock('@/auth/auth', () => ({
  auth: mockAuth,
}));

// Mock prisma
const mockFindFirst = jest.fn();
jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    workspaceMember: {
      findFirst: mockFindFirst,
    },
  },
}));

import RootPage from '@/app/page';

describe('RootPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to /login when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(RootPage()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });

  it('redirects to /login when session has no user id', async () => {
    mockAuth.mockResolvedValue({ user: {} });

    await expect(RootPage()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });

  it('redirects to first workspace slug when user has workspaces', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', email: 'test@example.com' } });
    mockFindFirst.mockResolvedValue({
      workspace: { slug: 'acme-corp' },
    });

    await expect(RootPage()).rejects.toThrow('NEXT_REDIRECT:/acme-corp');
    expect(mockRedirect).toHaveBeenCalledWith('/acme-corp');
  });

  it('renders welcome message when user has no workspaces', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', email: 'test@example.com' } });
    mockFindFirst.mockResolvedValue(null);

    const result = await RootPage();
    render(result as React.ReactElement);

    expect(screen.getByText('Welcome to Slack Clone')).toBeInTheDocument();
    expect(screen.getByText(/test@example\.com/)).toBeInTheDocument();
  });
});
