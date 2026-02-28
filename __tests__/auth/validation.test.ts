/**
 * Tests for client-side form validation schemas
 *
 * Tests the Zod schemas used in:
 * - app/(auth)/register/page.tsx (registerSchema)
 * - app/(auth)/login/page.tsx (loginSchema)
 *
 * Since these are client components, we test the validation logic
 * by recreating the same schemas used in the components.
 */

import { z } from 'zod';

// Recreate the register schema from register/page.tsx
const registerSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
    email: z.string().email('Please enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// Recreate the login schema from login/page.tsx
const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Also test the server-side register schema from the API route
const serverRegisterSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less')
    .trim(),
  email: z
    .string()
    .email('Invalid email address')
    .max(255, 'Email must be 255 characters or less')
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be 128 characters or less'),
});

describe('Register form validation', () => {
  describe('valid inputs', () => {
    it('accepts valid registration data', () => {
      const result = registerSchema.safeParse({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      });

      expect(result.success).toBe(true);
    });

    it('accepts minimum valid inputs', () => {
      const result = registerSchema.safeParse({
        name: 'A',
        email: 'a@b.co',
        password: '12345678',
        confirmPassword: '12345678',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('name validation', () => {
    it('rejects empty name', () => {
      const result = registerSchema.safeParse({
        name: '',
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const nameError = result.error.errors.find((e) => e.path[0] === 'name');
        expect(nameError).toBeDefined();
        expect(nameError!.message).toBe('Name is required');
      }
    });

    it('rejects name over 100 chars', () => {
      const result = registerSchema.safeParse({
        name: 'a'.repeat(101),
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const nameError = result.error.errors.find((e) => e.path[0] === 'name');
        expect(nameError).toBeDefined();
        expect(nameError!.message).toBe('Name is too long');
      }
    });
  });

  describe('email validation', () => {
    it('rejects invalid email format', () => {
      const result = registerSchema.safeParse({
        name: 'Test',
        email: 'not-an-email',
        password: 'password123',
        confirmPassword: 'password123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const emailError = result.error.errors.find((e) => e.path[0] === 'email');
        expect(emailError).toBeDefined();
        expect(emailError!.message).toBe('Please enter a valid email address');
      }
    });

    it('rejects email without domain', () => {
      const result = registerSchema.safeParse({
        name: 'Test',
        email: 'user@',
        password: 'password123',
        confirmPassword: 'password123',
      });

      expect(result.success).toBe(false);
    });

    it('rejects empty email', () => {
      const result = registerSchema.safeParse({
        name: 'Test',
        email: '',
        password: 'password123',
        confirmPassword: 'password123',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('password validation', () => {
    it('rejects password under 8 characters', () => {
      const result = registerSchema.safeParse({
        name: 'Test',
        email: 'test@example.com',
        password: '1234567',
        confirmPassword: '1234567',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const pwError = result.error.errors.find((e) => e.path[0] === 'password');
        expect(pwError).toBeDefined();
        expect(pwError!.message).toBe('Password must be at least 8 characters');
      }
    });

    it('accepts password of exactly 8 characters', () => {
      const result = registerSchema.safeParse({
        name: 'Test',
        email: 'test@example.com',
        password: '12345678',
        confirmPassword: '12345678',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('confirm password validation', () => {
    it('rejects mismatched passwords', () => {
      const result = registerSchema.safeParse({
        name: 'Test',
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'different456',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const confirmError = result.error.errors.find(
          (e) => e.path[0] === 'confirmPassword'
        );
        expect(confirmError).toBeDefined();
        expect(confirmError!.message).toBe('Passwords do not match');
      }
    });

    it('accepts matching passwords', () => {
      const result = registerSchema.safeParse({
        name: 'Test',
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      });

      expect(result.success).toBe(true);
    });
  });
});

describe('Login form validation', () => {
  describe('valid inputs', () => {
    it('accepts valid login data', () => {
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: 'anypassword',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('email validation', () => {
    it('rejects invalid email', () => {
      const result = loginSchema.safeParse({
        email: 'not-valid',
        password: 'password',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe(
          'Please enter a valid email address'
        );
      }
    });

    it('rejects empty email', () => {
      const result = loginSchema.safeParse({
        email: '',
        password: 'password',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('password validation', () => {
    it('rejects empty password', () => {
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: '',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('Password is required');
      }
    });

    it('accepts single character password (no min length on login)', () => {
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: 'x',
      });

      expect(result.success).toBe(true);
    });
  });
});

describe('Server-side register schema', () => {
  it('trims name whitespace', () => {
    const result = serverRegisterSchema.safeParse({
      name: '  John Doe  ',
      email: 'john@example.com',
      password: 'password123',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('John Doe');
    }
  });

  it('lowercases email', () => {
    const result = serverRegisterSchema.safeParse({
      name: 'Test',
      email: 'TEST@EXAMPLE.COM',
      password: 'password123',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('test@example.com');
    }
  });

  it('rejects password over 128 chars', () => {
    const result = serverRegisterSchema.safeParse({
      name: 'Test',
      email: 'test@example.com',
      password: 'a'.repeat(129),
    });

    expect(result.success).toBe(false);
  });

  it('rejects email over 255 chars', () => {
    const result = serverRegisterSchema.safeParse({
      name: 'Test',
      email: 'a'.repeat(250) + '@b.com',
      password: 'password123',
    });

    expect(result.success).toBe(false);
  });

  it('accepts exactly 128 char password', () => {
    const result = serverRegisterSchema.safeParse({
      name: 'Test',
      email: 'test@example.com',
      password: 'a'.repeat(128),
    });

    expect(result.success).toBe(true);
  });
});
