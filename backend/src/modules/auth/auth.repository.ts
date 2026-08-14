/**
 * Authentication Repository
 * 
 * Data access layer for authentication operations
 * Encapsulates all Prisma database queries
 */

import { User } from '@prisma/client';
import { logger } from '../../services/logger.service';
import * as crypto from 'crypto';
import { prisma } from '../../services/prisma.service';


// ============================================
// User Operations
// ============================================

export async function createUser(data: {
  email: string;
  name: string;
  password: string; // hashed
}): Promise<User> {
  try {
    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        password: data.password,
        role: 'USER',
        // Create default free subscription
        subscription: {
          create: {
            plan: 'free',
            monthlyQuota: 5,
            usedQuota: 0,
          },
        },
      },
    });
    return user;
  } catch (error: any) {
    if (error.code === 'P2002') {
      throw new Error('Email already registered');
    }
    logger.error('Error creating user:', error);
    throw error;
  }
}

export async function findUserByEmail(email: string): Promise<User | null> {
  try {
    return await prisma.user.findUnique({
      where: { email },
    });
  } catch (error) {
    logger.error('Error finding user by email:', error);
    throw error;
  }
}

export async function findUserById(id: string): Promise<User | null> {
  try {
    return await prisma.user.findUnique({
      where: { id },
    });
  } catch (error) {
    logger.error('Error finding user by id:', error);
    throw error;
  }
}

export async function updateUser(
  id: string,
  data: Partial<{
    lastLogin: Date;
    isActive: boolean;
    emailVerified: boolean;
  }>
): Promise<User> {
  try {
    return await prisma.user.update({
      where: { id },
      data,
    });
  } catch (error) {
    logger.error('Error updating user:', error);
    throw error;
  }
}

// ============================================
// Refresh Token Operations
// ============================================

export async function createRefreshToken(data: {
  userId: string;
  expiresAt: Date;
}): Promise<any> {
  try {
    // Generate random token and hash it for storage
    const randomToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(randomToken).digest('hex');

    const token = await prisma.refreshToken.create({
      data: {
        userId: data.userId,
        token: hashedToken,
        expiresAt: data.expiresAt,
      },
    });

    // Return original token (not hashed) to send to client
    return {
      ...token,
      token: randomToken,
    };
  } catch (error) {
    logger.error('Error creating refresh token:', error);
    throw error;
  }
}

export async function findRefreshToken(token: string): Promise<any> {
  try {
    // Hash the token to find it
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const refreshToken = await prisma.refreshToken.findUnique({
      where: { token: hashedToken },
      include: { user: true },
    });

    if (!refreshToken) {
      return null;
    }

    // Don't expose the hashed token
    return refreshToken;
  } catch (error) {
    logger.error('Error finding refresh token:', error);
    throw error;
  }
}

export async function revokeRefreshToken(id: string): Promise<any> {
  try {
    return await prisma.refreshToken.update({
      where: { id },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });
  } catch (error) {
    logger.error('Error revoking refresh token:', error);
    throw error;
  }
}

export async function deleteExpiredRefreshTokens(): Promise<number> {
  try {
    const result = await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
    return result.count;
  } catch (error) {
    logger.error('Error deleting expired refresh tokens:', error);
    throw error;
  }
}

// ============================================
// Audit Log Operations
// ============================================

export async function createAuditLog(data: {
  userId: string | null;
  action: string;
  status?: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<any> {
  try {
    const baseData = {
      action: data.action,
      status: data.status || 'SUCCESS',
      reason: data.reason,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    };

    if (data.userId) {
      return await prisma.auditLog.create({
        data: {
          ...baseData,
          user: {
            connect: { id: data.userId },
          },
        },
      });
    }

    return await prisma.auditLog.create({
      data: baseData,
    });
  } catch (error) {
    logger.error('Error creating audit log:', error);
    throw error;
  }
}

export async function getAuditLogs(
  userId: string,
  limit: number = 50
): Promise<any[]> {
  try {
    return await prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  } catch (error) {
    logger.error('Error getting audit logs:', error);
    throw error;
  }
}

// ============================================
// Cleanup Operations
// ============================================

export async function cleanup(): Promise<void> {
  try {
    await prisma.$disconnect();
  } catch (error) {
    logger.error('Error during Prisma cleanup:', error);
  }
}

export default {
  // User operations
  createUser,
  findUserByEmail,
  findUserById,
  updateUser,
  // Refresh token operations
  createRefreshToken,
  findRefreshToken,
  revokeRefreshToken,
  deleteExpiredRefreshTokens,
  // Audit log operations
  createAuditLog,
  getAuditLogs,
  // Cleanup
  cleanup,
};
