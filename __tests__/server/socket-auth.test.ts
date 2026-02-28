/**
 * Tests for server/socket-auth.ts
 *
 * Verifies the Socket.IO authentication middleware:
 * - Valid JWT cookie allows connection (attaches userId/email to socket.data)
 * - Missing cookie rejects with 'unauthorized'
 * - Invalid/expired token rejects with 'unauthorized'
 * - Cookie parsing from raw header
 */

import { applyAuthMiddleware } from '../../server/socket-auth';

// Mock next-auth/jwt
jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}));

import { getToken } from 'next-auth/jwt';

const mockedGetToken = getToken as jest.MockedFunction<typeof getToken>;

describe('applyAuthMiddleware', () => {
  let io: any;
  let middlewareFn: (socket: any, next: any) => Promise<void>;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_SECRET = 'test-secret';
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true, configurable: true });

    // Capture the middleware function when io.use is called
    io = {
      use: jest.fn((fn: any) => {
        middlewareFn = fn;
      }),
    };

    applyAuthMiddleware(io as any);
  });

  function createMockSocket(cookieHeader?: string) {
    return {
      request: {
        headers: {
          cookie: cookieHeader || '',
        },
      },
      data: {} as Record<string, unknown>,
    };
  }

  it('registers a middleware on the io server', () => {
    expect(io.use).toHaveBeenCalledTimes(1);
    expect(typeof middlewareFn).toBe('function');
  });

  it('allows connection with valid JWT token', async () => {
    mockedGetToken.mockResolvedValue({
      sub: 'user-123',
      email: 'test@example.com',
    } as any);

    const socket = createMockSocket('authjs.session-token=valid-jwt-token');
    const next = jest.fn();

    await middlewareFn(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(next).toHaveBeenCalledTimes(1);
    expect(socket.data.userId).toBe('user-123');
    expect(socket.data.email).toBe('test@example.com');
  });

  it('rejects connection when no cookie is present', async () => {
    mockedGetToken.mockResolvedValue(null);

    const socket = createMockSocket('');
    const next = jest.fn();

    await middlewareFn(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect((next.mock.calls[0][0] as Error).message).toBe('unauthorized');
  });

  it('rejects connection when token is null (invalid JWT)', async () => {
    mockedGetToken.mockResolvedValue(null);

    const socket = createMockSocket('authjs.session-token=invalid-token');
    const next = jest.fn();

    await middlewareFn(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect((next.mock.calls[0][0] as Error).message).toBe('unauthorized');
  });

  it('rejects connection when token has no sub field', async () => {
    mockedGetToken.mockResolvedValue({ email: 'test@example.com' } as any);

    const socket = createMockSocket('authjs.session-token=some-token');
    const next = jest.fn();

    await middlewareFn(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect((next.mock.calls[0][0] as Error).message).toBe('unauthorized');
  });

  it('rejects connection when getToken throws an error', async () => {
    mockedGetToken.mockRejectedValue(new Error('decryption failed'));

    const socket = createMockSocket('authjs.session-token=corrupted-token');
    const next = jest.fn();

    await middlewareFn(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect((next.mock.calls[0][0] as Error).message).toBe('unauthorized');
  });

  it('parses cookies from raw Cookie header correctly', async () => {
    mockedGetToken.mockResolvedValue({
      sub: 'user-456',
      email: 'user@test.com',
    } as any);

    const socket = createMockSocket(
      'other=value; authjs.session-token=my-jwt; another=thing'
    );
    const next = jest.fn();

    await middlewareFn(socket, next);

    // getToken should have been called with the parsed request
    expect(mockedGetToken).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: 'test-secret',
        cookieName: 'authjs.session-token',
      })
    );
    expect(next).toHaveBeenCalledWith();
    expect(socket.data.userId).toBe('user-456');
  });

  it('uses __Secure- prefixed cookie name in production', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true, configurable: true });

    // Re-apply to capture the new middleware
    const prodIo = {
      use: jest.fn((fn: any) => {
        middlewareFn = fn;
      }),
    };
    applyAuthMiddleware(prodIo as any);

    mockedGetToken.mockResolvedValue({
      sub: 'user-789',
      email: 'prod@test.com',
    } as any);

    const socket = createMockSocket(
      '__Secure-authjs.session-token=secure-jwt'
    );
    const next = jest.fn();

    await middlewareFn(socket, next);

    expect(mockedGetToken).toHaveBeenCalledWith(
      expect.objectContaining({
        cookieName: '__Secure-authjs.session-token',
      })
    );
    expect(next).toHaveBeenCalledWith();
    expect(socket.data.userId).toBe('user-789');
  });

  it('sets empty email string when token has no email', async () => {
    mockedGetToken.mockResolvedValue({ sub: 'user-no-email' } as any);

    const socket = createMockSocket('authjs.session-token=valid');
    const next = jest.fn();

    await middlewareFn(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.userId).toBe('user-no-email');
    expect(socket.data.email).toBe('');
  });

  it('skips cookie parsing when cookies are already parsed', async () => {
    mockedGetToken.mockResolvedValue({
      sub: 'user-pre-parsed',
      email: 'pre@test.com',
    } as any);

    const socket = {
      request: {
        headers: { cookie: 'authjs.session-token=raw-value' },
        cookies: { 'authjs.session-token': 'pre-parsed-value' },
      },
      data: {} as Record<string, unknown>,
    };
    const next = jest.fn();

    await middlewareFn(socket, next);

    // Should use the pre-parsed cookies, not re-parse
    expect(socket.request.cookies['authjs.session-token']).toBe('pre-parsed-value');
    expect(next).toHaveBeenCalledWith();
  });
});
