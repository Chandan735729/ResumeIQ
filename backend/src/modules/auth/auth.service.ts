/**
 * Authentication Service
 * 
 * Core business logic for authentication operations
 * Handles password hashing, JWT generation, user login/registration
 */

import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { logger } from '../../services/logger.service';
import * as authRepository from './auth.repository';
import { User } from '@prisma/client';
import {
  UserResponse,
  LoginResponse,
  RefreshTokenResponse,
  JWTPayload,
} from './auth.types';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
  }
  return secret;
}
const ACCESS_TOKEN_EXPIRY = 900; // 15 minutes in seconds
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds
const BCRYPT_ROUNDS = 12;

// ============================================
// Password Operations
// ============================================

/**
 * Hash password with bcrypt
 * Uses 12 rounds for strong security
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password) {
    throw new Error('Password cannot be empty');
  }
  try {
    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    return await bcrypt.hash(password, salt);
  } catch (error) {
    logger.error('Error hashing password:', error);
    throw new Error('Password hashing failed');
  }
}

/**
 * Verify password against hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    logger.error('Error verifying password:', error);
    return false;
  }
}

// ============================================
// JWT Operations
// ============================================

/**
 * Generate JWT access token (15 minutes)
 */
export function generateAccessToken(payload: {
  sub: string;
  email: string;
  role: string;
}): string {
  try {
    const jwtPayload: JWTPayload = {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_EXPIRY,
    };
    return jwt.sign(jwtPayload, getJwtSecret(), { algorithm: 'HS256' });
  } catch (error) {
    logger.error('Error generating access token:', error);
    throw new Error('Token generation failed');
  }
}

/**
 * Generate refresh token (7 days)
 */
export function generateRefreshToken(): string {
  // Returns a random hex string, not a JWT
  // Real token is hashed and stored in DB
  const randomToken = crypto.randomBytes(32).toString('hex');
  return randomToken;
}

/**
 * Verify JWT access token
 */
export function verifyAccessToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'],
    }) as JWTPayload;
    return decoded;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    }
    logger.error('Error verifying token:', error);
    throw new Error('Token verification failed');
  }
}

// ============================================
// User Registration
// ============================================

/**
 * Register new user
 */
export async function register(data: {
  email: string;
  name: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<UserResponse> {
  try {
    // Hash password
    const hashedPassword = await hashPassword(data.password);

    // Create user
    const user = await authRepository.createUser({
      email: data.email,
      name: data.name,
      password: hashedPassword,
    });

    // Log registration
    await authRepository.createAuditLog({
      userId: user.id,
      action: 'REGISTER',
      status: 'SUCCESS',
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    });

    logger.info(`User registered: ${user.id}`);

    return formatUserResponse(user);
  } catch (error: any) {
    logger.error('Registration error:', error);

    if (error.message === 'Email already registered') {
      throw new Error('Email already registered');
    }

    throw new Error('Registration failed');
  }
}

// ============================================
// User Login
// ============================================

/**
 * Login user and generate tokens
 */
export async function login(
  email: string,
  password: string,
  ipAddress?: string,
  userAgent?: string
): Promise<LoginResponse> {
  try {
    // Find user by email
    const user = await authRepository.findUserByEmail(email);

    if (!user) {
      // Log failed attempt (without revealing user doesn't exist)
      await authRepository.createAuditLog({
        userId: null,
        action: 'LOGIN_FAILURE',
        status: 'FAILURE',
        reason: 'User not found',
        ipAddress,
        userAgent,
      });

      throw new Error('Invalid credentials');
    }

    // Check if account is active
    if (!user.isActive) {
      await authRepository.createAuditLog({
        userId: user.id,
        action: 'LOGIN_FAILURE',
        status: 'FAILURE',
        reason: 'Account inactive',
        ipAddress,
        userAgent,
      });

      throw new Error('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, user.password);

    if (!isPasswordValid) {
      // Log failed attempt
      await authRepository.createAuditLog({
        userId: user.id,
        action: 'LOGIN_FAILURE',
        status: 'FAILURE',
        reason: 'Invalid password',
        ipAddress,
        userAgent,
      });

      throw new Error('Invalid credentials');
    }

    // Generate tokens
    const accessToken = generateAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    // Store refresh token in DB
    const refreshTokenExpiry = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRY * 1000
    );

    const refreshTokenData = await authRepository.createRefreshToken({
      userId: user.id,
      expiresAt: refreshTokenExpiry,
    });

    // Update last login
    await authRepository.updateUser(user.id, {
      lastLogin: new Date(),
    });

    // Log successful login
    await authRepository.createAuditLog({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      status: 'SUCCESS',
      ipAddress,
      userAgent,
    });

    logger.info(`User logged in: ${user.id}`);

    return {
      accessToken,
      refreshToken: refreshTokenData.token,
      expiresIn: ACCESS_TOKEN_EXPIRY,
      user: formatUserResponse(user),
    };
  } catch (error: any) {
    logger.error('Login error:', error);
    throw error;
  }
}

// ============================================
// Token Refresh
// ============================================

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  refreshToken: string,
  _ipAddress?: string,
  _userAgent?: string
): Promise<RefreshTokenResponse> {
  try {
    // Find refresh token in DB
    const storedToken = await authRepository.findRefreshToken(refreshToken);

    if (!storedToken) {
      throw new Error('Refresh token not found');
    }

    // Check if revoked
    if (storedToken.isRevoked) {
      throw new Error('Token revoked');
    }

    // Check if expired
    if (new Date() > storedToken.expiresAt) {
      throw new Error('Refresh token expired');
    }

    // Check if user is active
    if (!storedToken.user.isActive) {
      throw new Error('User account is inactive');
    }

    // Generate new access token
    const accessToken = generateAccessToken({
      sub: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role,
    });

    const refreshTokenExpiry = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRY * 1000
    );
    const nextRefreshToken = await authRepository.createRefreshToken({
      userId: storedToken.user.id,
      expiresAt: refreshTokenExpiry,
    });
    await authRepository.revokeRefreshToken(storedToken.id);

    logger.debug(`Token refreshed for user: ${storedToken.userId}`);

    return {
      accessToken,
      refreshToken: nextRefreshToken.token,
      expiresIn: ACCESS_TOKEN_EXPIRY,
    };
  } catch (error: any) {
    logger.error('Token refresh error:', error);
    throw error;
  }
}

// ============================================
// Logout
// ============================================

/**
 * Logout user by revoking refresh token
 */
export async function logout(
  refreshToken: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  try {
    // Find refresh token
    const storedToken = await authRepository.findRefreshToken(refreshToken);

    if (storedToken && storedToken.userId !== userId) {
      throw new Error('Access denied');
    }

    if (storedToken && !storedToken.isRevoked) {
      // Revoke token
      await authRepository.revokeRefreshToken(storedToken.id);
    }

    // Log logout
    await authRepository.createAuditLog({
      userId,
      action: 'LOGOUT',
      status: 'SUCCESS',
      ipAddress,
      userAgent,
    });

    logger.debug(`User logged out: ${userId}`);
  } catch (error: any) {
    logger.error('Logout error:', error);
    if (error.message === 'Access denied') {
      throw error;
    }

    // Don't throw on logout, always succeed
  }
}

// ============================================
// Profile
// ============================================

/**
 * Get user profile
 */
export async function getProfile(userId: string): Promise<UserResponse> {
  try {
    const user = await authRepository.findUserById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    return formatUserResponse(user);
  } catch (error: any) {
    logger.error('Error getting profile:', error);
    throw error;
  }
}

// ============================================
// Utilities
// ============================================

/**
 * Format user response (excludes password)
 */
function formatUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerified,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
  };
}

export default {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  register,
  login,
  refreshAccessToken,
  logout,
  getProfile,
};
