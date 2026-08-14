/**
 * Authentication Validation Schemas (Zod)
 * 
 * Input validation for all auth endpoints
 * Ensures type-safe, validated data before reaching business logic
 */

import { z } from 'zod';

// ============================================
// Password Validation
// ============================================

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit')
  .regex(/[!@#$%^&*]/, 'Password must contain at least one special character (!@#$%^&*)');

// ============================================
// Email Validation
// ============================================

const emailSchema = z.string().email('Invalid email address').max(255);

// ============================================
// Registration Schema
// ============================================

export const RegisterSchema = z.object({
  email: emailSchema,
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(255, 'Name must not exceed 255 characters'),
  password: passwordSchema,
}).strict();

export type RegisterInput = z.infer<typeof RegisterSchema>;

// ============================================
// Login Schema
// ============================================

export const LoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
}).strict();

export type LoginInput = z.infer<typeof LoginSchema>;

// ============================================
// Refresh Token Schema
// ============================================

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
}).strict();

export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;

// ============================================
// Logout Schema
// ============================================

export const LogoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
}).strict();

export type LogoutInput = z.infer<typeof LogoutSchema>;

/**
 * Validate input against schema and throw detailed errors
 * 
 * @param schema Zod schema to validate against
 * @param data Data to validate
 * @returns Validated data
 * @throws Detailed validation errors
 */
export function validateInput<T>(schema: z.ZodSchema, data: unknown): T {
  try {
    return schema.parse(data) as T;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors = error.errors.map(err => ({
        field: err.path.join('.') || 'root',
        code: err.code,
        message: err.message,
      }));
      throw {
        type: 'VALIDATION_ERROR',
        errors: fieldErrors,
      };
    }
    throw error;
  }
}
