/**
 * Tests for auth/auth.config.ts
 *
 * Covers:
 * - CredentialsProvider authorize function
 *   - Valid credentials return user object
 *   - Invalid password returns null
 *   - Non-existent email returns null
 *   - Missing credentials returns null
 *   - User without password (OAuth-only) returns null
 * - JWT callback attaches userId on sign-in
 * - Session callback exposes userId and role
 */

// Mock next-auth provider modules (ESM that Jest can't parse)
jest.mock('next-auth/providers/credentials', () => ({
  __esModule: true,
  default: (config: any) => ({ ...config, type: 'credentials' }),
}));

jest.mock('next-auth/providers/google', () => ({
  __esModule: true,
  default: (config: any) => ({ ...config, type: 'google' }),
}));

// Mock prisma before importing auth config
jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  compareSync: jest.fn(),
}));

import { authConfig } from '@/auth/auth.config';
import { prisma } from '@/shared/lib/prisma';
import { compareSync } from 'bcryptjs';

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;
const mockedCompareSync = compareSync as jest.MockedFunction<typeof compareSync>;

// Extract the authorize function from the Credentials provider
function getAuthorize() {
  const credentialsProvider = authConfig.providers[0] as any;
  return credentialsProvider.authorize;
}

describe('CredentialsProvider authorize', () => {
  let authorize: ReturnType<typeof getAuthorize>;

  beforeEach(() => {
    jest.clearAllMocks();
    authorize = getAuthorize();
  });

  it('returns user object for valid credentials', async () => {
    const mockUser = {
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      password: '$2a$12$hashedpassword',
      image: null,
    };

    (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (mockedCompareSync as jest.Mock).mockReturnValue(true);

    const result = await authorize({
      email: 'test@example.com',
      password: 'correctpassword',
    });

    expect(result).toEqual({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      image: null,
    });
  });

  it('looks up user by email in prisma', async () => {
    (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await authorize({
      email: 'lookup@example.com',
      password: 'password',
    });

    expect(mockedPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'lookup@example.com' },
    });
  });

  it('returns null for invalid password', async () => {
    const mockUser = {
      id: 'user-1',
      name: 'Test',
      email: 'test@example.com',
      password: '$2a$12$hashedpassword',
      image: null,
    };

    (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (mockedCompareSync as jest.Mock).mockReturnValue(false);

    const result = await authorize({
      email: 'test@example.com',
      password: 'wrongpassword',
    });

    expect(result).toBeNull();
  });

  it('returns null for non-existent email', async () => {
    (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await authorize({
      email: 'nobody@example.com',
      password: 'password123',
    });

    expect(result).toBeNull();
    expect(mockedCompareSync).not.toHaveBeenCalled();
  });

  it('returns null when credentials are missing', async () => {
    const result = await authorize({});
    expect(result).toBeNull();
    expect(mockedPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns null when email is missing', async () => {
    const result = await authorize({ password: 'password123' });
    expect(result).toBeNull();
  });

  it('returns null when password is missing', async () => {
    const result = await authorize({ email: 'test@example.com' });
    expect(result).toBeNull();
  });

  it('returns null for OAuth-only user (no password set)', async () => {
    const oauthUser = {
      id: 'oauth-user',
      name: 'OAuth User',
      email: 'oauth@example.com',
      password: null,
      image: 'https://avatar.url',
    };

    (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue(oauthUser);

    const result = await authorize({
      email: 'oauth@example.com',
      password: 'anypassword',
    });

    expect(result).toBeNull();
    expect(mockedCompareSync).not.toHaveBeenCalled();
  });

  it('uses compareSync from bcryptjs for password verification', async () => {
    const mockUser = {
      id: 'user-1',
      name: 'Test',
      email: 'test@example.com',
      password: '$2a$12$storedHash',
      image: null,
    };

    (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (mockedCompareSync as jest.Mock).mockReturnValue(true);

    await authorize({
      email: 'test@example.com',
      password: 'plaintext',
    });

    expect(mockedCompareSync).toHaveBeenCalledWith('plaintext', '$2a$12$storedHash');
  });
});

describe('JWT callback', () => {
  const jwtCallback = authConfig.callbacks!.jwt!;

  it('attaches userId to token on initial sign-in', async () => {
    const token = { sub: 'sub-1' } as any;
    const user = { id: 'user-123', name: 'Test', email: 'test@example.com' } as any;

    const result = await jwtCallback({ token, user } as any) as any;

    expect(result.userId).toBe('user-123');
  });

  it('preserves existing token fields on subsequent calls', async () => {
    const token = { sub: 'sub-1', userId: 'user-123', customField: 'value' } as any;

    const result = await jwtCallback({ token, user: undefined } as any) as any;

    expect(result.userId).toBe('user-123');
    expect(result.customField).toBe('value');
  });

  it('does not overwrite userId when user is not provided', async () => {
    const token = { sub: 'sub-1', userId: 'existing-id' } as any;

    const result = await jwtCallback({ token } as any) as any;

    expect(result.userId).toBe('existing-id');
  });
});

describe('Session callback', () => {
  const sessionCallback = authConfig.callbacks!.session!;

  it('exposes userId from token to session', async () => {
    const session = { user: { name: 'Test', email: 'test@example.com' } } as any;
    const token = { userId: 'user-456' } as any;

    const result = await sessionCallback({ session, token } as any) as any;

    expect(result.user.id).toBe('user-456');
  });

  it('exposes role from token to session when present', async () => {
    const session = { user: { name: 'Test', email: 'test@example.com' } } as any;
    const token = { userId: 'user-789', role: 'admin' } as any;

    const result = await sessionCallback({ session, token } as any) as any;

    expect(result.user.id).toBe('user-789');
    expect(result.user.role).toBe('admin');
  });

  it('does not set role when not in token', async () => {
    const session = { user: { name: 'Test', email: 'test@example.com' } } as any;
    const token = { userId: 'user-1' } as any;

    const result = await sessionCallback({ session, token } as any) as any;

    expect(result.user.role).toBeUndefined();
  });
});

describe('Auth config structure', () => {
  it('uses JWT session strategy', () => {
    expect(authConfig.session?.strategy).toBe('jwt');
  });

  it('sets custom sign-in page to /login', () => {
    expect(authConfig.pages?.signIn).toBe('/login');
  });

  it('sets new user page to /register', () => {
    expect(authConfig.pages?.newUser).toBe('/register');
  });
});
