/**
 * Tests for auth/middleware.ts
 *
 * Covers:
 * - getAuthSession returns session when authenticated
 * - getAuthSession returns null when not authenticated
 * - requireAuth returns session when authenticated
 * - requireAuth throws AuthError when not authenticated
 * - AuthError class properties (message, status, name)
 */

// Mock the auth function from auth/auth
jest.mock('@/auth/auth', () => ({
  auth: jest.fn(),
}));

import { getAuthSession, requireAuth, AuthError } from '@/auth/middleware';
import { auth } from '@/auth/auth';

const mockedAuth = auth as jest.MockedFunction<typeof auth>;

describe('getAuthSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns session when user is authenticated', async () => {
    const mockSession = {
      user: { id: 'user-1', name: 'Test', email: 'test@example.com' },
      expires: '2026-12-31',
    };

    (mockedAuth as jest.Mock).mockResolvedValue(mockSession);

    const result = await getAuthSession();

    expect(result).toEqual(mockSession);
  });

  it('returns null when user is not authenticated', async () => {
    (mockedAuth as jest.Mock).mockResolvedValue(null);

    const result = await getAuthSession();

    expect(result).toBeNull();
  });

  it('calls auth() from next-auth', async () => {
    (mockedAuth as jest.Mock).mockResolvedValue(null);

    await getAuthSession();

    expect(mockedAuth).toHaveBeenCalledTimes(1);
  });
});

describe('requireAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns session when user is authenticated with userId', async () => {
    const mockSession = {
      user: { id: 'user-1', name: 'Test', email: 'test@example.com' },
      expires: '2026-12-31',
    };

    (mockedAuth as jest.Mock).mockResolvedValue(mockSession);

    const result = await requireAuth();

    expect(result).toEqual(mockSession);
  });

  it('throws AuthError when session is null', async () => {
    (mockedAuth as jest.Mock).mockResolvedValue(null);

    await expect(requireAuth()).rejects.toThrow(AuthError);
    await expect(requireAuth()).rejects.toThrow('Unauthorized');
  });

  it('throws AuthError when session has no user', async () => {
    (mockedAuth as jest.Mock).mockResolvedValue({ expires: '2026-12-31' });

    await expect(requireAuth()).rejects.toThrow(AuthError);
  });

  it('throws AuthError when user has no id', async () => {
    (mockedAuth as jest.Mock).mockResolvedValue({
      user: { name: 'Test', email: 'test@example.com' },
      expires: '2026-12-31',
    });

    await expect(requireAuth()).rejects.toThrow(AuthError);
  });
});

describe('AuthError', () => {
  it('has default message "Unauthorized"', () => {
    const error = new AuthError();

    expect(error.message).toBe('Unauthorized');
  });

  it('has default status 401', () => {
    const error = new AuthError();

    expect(error.status).toBe(401);
  });

  it('has name "AuthError"', () => {
    const error = new AuthError();

    expect(error.name).toBe('AuthError');
  });

  it('accepts custom message', () => {
    const error = new AuthError('Forbidden');

    expect(error.message).toBe('Forbidden');
  });

  it('accepts custom status', () => {
    const error = new AuthError('Forbidden', 403);

    expect(error.status).toBe(403);
  });

  it('is an instance of Error', () => {
    const error = new AuthError();

    expect(error).toBeInstanceOf(Error);
  });

  it('is an instance of AuthError', () => {
    const error = new AuthError();

    expect(error).toBeInstanceOf(AuthError);
  });
});
