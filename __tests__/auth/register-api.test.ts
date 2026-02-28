/**
 * Tests for app/api/auth/register/route.ts
 *
 * Covers:
 * - Valid registration creates user with bcrypt-hashed password
 * - Duplicate email returns 409 with EMAIL_EXISTS code
 * - Missing/invalid fields return 400 with fieldErrors
 * - Password < 8 chars rejected
 * - Name too long rejected
 * - Email format validation
 * - Successful response shape { ok: true, user: { id, name, email } }
 */

import { POST } from '@/app/api/auth/register/route';

// Mock prisma
jest.mock('@/shared/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  hashSync: jest.fn((password: string, rounds: number) => `hashed_${password}_${rounds}`),
}));

import { prisma } from '@/shared/lib/prisma';
import { hashSync } from 'bcryptjs';

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;
const mockedHashSync = hashSync as jest.MockedFunction<typeof hashSync>;

function createRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3000/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('successful registration', () => {
    it('creates a user and returns 201 with user data', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (mockedPrisma.user.create as jest.Mock).mockResolvedValue({
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
      });

      const req = createRequest({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.ok).toBe(true);
      expect(data.user).toEqual({
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
      });
    });

    it('hashes password with bcrypt 12 rounds', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (mockedPrisma.user.create as jest.Mock).mockResolvedValue({
        id: 'user-1',
        name: 'Test',
        email: 'test@example.com',
      });

      const req = createRequest({
        name: 'Test',
        email: 'test@example.com',
        password: 'mypassword',
      });

      await POST(req);

      expect(mockedHashSync).toHaveBeenCalledWith('mypassword', 12);
    });

    it('stores the hashed password in the database', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (mockedPrisma.user.create as jest.Mock).mockResolvedValue({
        id: 'user-1',
        name: 'Test',
        email: 'test@example.com',
      });

      const req = createRequest({
        name: 'Test',
        email: 'test@example.com',
        password: 'securepass',
      });

      await POST(req);

      expect(mockedPrisma.user.create).toHaveBeenCalledWith({
        data: {
          name: 'Test',
          email: 'test@example.com',
          password: 'hashed_securepass_12',
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });
    });

    it('trims name and lowercases email', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (mockedPrisma.user.create as jest.Mock).mockResolvedValue({
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
      });

      const req = createRequest({
        name: '  Test User  ',
        email: 'TEST@Example.COM',
        password: 'password123',
      });

      await POST(req);

      expect(mockedPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Test User',
            email: 'test@example.com',
          }),
        })
      );
    });

    it('does not return the password in the response', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (mockedPrisma.user.create as jest.Mock).mockResolvedValue({
        id: 'user-1',
        name: 'Test',
        email: 'test@example.com',
      });

      const req = createRequest({
        name: 'Test',
        email: 'test@example.com',
        password: 'password123',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(data.user.password).toBeUndefined();
      // Verify select only asks for id, name, email
      expect(mockedPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { id: true, name: true, email: true },
        })
      );
    });
  });

  describe('duplicate email', () => {
    it('returns 409 with EMAIL_EXISTS code', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'existing-user',
        email: 'taken@example.com',
      });

      const req = createRequest({
        name: 'New User',
        email: 'taken@example.com',
        password: 'password123',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.ok).toBe(false);
      expect(data.code).toBe('EMAIL_EXISTS');
      expect(data.error).toContain('already exists');
    });

    it('does not create a user when email exists', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'existing-user',
        email: 'taken@example.com',
      });

      const req = createRequest({
        name: 'New User',
        email: 'taken@example.com',
        password: 'password123',
      });

      await POST(req);

      expect(mockedPrisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('validation errors', () => {
    it('returns 400 when name is missing', async () => {
      const req = createRequest({
        email: 'test@example.com',
        password: 'password123',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.ok).toBe(false);
      expect(data.code).toBe('VALIDATION_ERROR');
      expect(data.fieldErrors.name).toBeDefined();
    });

    it('returns 400 when email is missing', async () => {
      const req = createRequest({
        name: 'Test',
        password: 'password123',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.fieldErrors.email).toBeDefined();
    });

    it('returns 400 when password is missing', async () => {
      const req = createRequest({
        name: 'Test',
        email: 'test@example.com',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.fieldErrors.password).toBeDefined();
    });

    it('returns 400 when password is too short (< 8 chars)', async () => {
      const req = createRequest({
        name: 'Test',
        email: 'test@example.com',
        password: 'short',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.fieldErrors.password).toBeDefined();
      expect(data.fieldErrors.password[0]).toContain('8 characters');
    });

    it('returns 400 when password is too long (> 128 chars)', async () => {
      const req = createRequest({
        name: 'Test',
        email: 'test@example.com',
        password: 'a'.repeat(129),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.fieldErrors.password).toBeDefined();
    });

    it('returns 400 for invalid email format', async () => {
      const req = createRequest({
        name: 'Test',
        email: 'not-an-email',
        password: 'password123',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.fieldErrors.email).toBeDefined();
    });

    it('returns 400 when name exceeds 100 chars', async () => {
      const req = createRequest({
        name: 'a'.repeat(101),
        email: 'test@example.com',
        password: 'password123',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.fieldErrors.name).toBeDefined();
    });

    it('returns 400 with empty name string', async () => {
      const req = createRequest({
        name: '',
        email: 'test@example.com',
        password: 'password123',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.fieldErrors.name).toBeDefined();
    });

    it('returns multiple field errors when multiple fields invalid', async () => {
      const req = createRequest({
        name: '',
        email: 'bad',
        password: 'short',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.fieldErrors.name).toBeDefined();
      expect(data.fieldErrors.email).toBeDefined();
      expect(data.fieldErrors.password).toBeDefined();
    });

    it('does not call prisma when validation fails', async () => {
      const req = createRequest({
        name: '',
        email: 'bad',
        password: 'short',
      });

      await POST(req);

      expect(mockedPrisma.user.findUnique).not.toHaveBeenCalled();
      expect(mockedPrisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('server errors', () => {
    it('returns 500 when prisma throws', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockRejectedValue(
        new Error('DB connection failed')
      );

      const req = createRequest({
        name: 'Test',
        email: 'test@example.com',
        password: 'password123',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.ok).toBe(false);
      expect(data.code).toBe('INTERNAL_ERROR');
    });

    it('returns 500 when request body is not JSON', async () => {
      const req = new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'not json',
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.ok).toBe(false);
    });
  });
});
