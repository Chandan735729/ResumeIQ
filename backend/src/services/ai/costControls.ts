/**
 * AI Cost Controls & Quota Management
 *
 * Enforces input size caps, tracks token usage, and manages user subscription quotas.
 */

import { prisma } from '../prisma.service';
import { logger } from '../logger.service';

export const MAX_RESUME_INPUT_CHARS = 50_000;
export const MAX_JD_INPUT_CHARS = 50_000;

export interface QuotaCheckResult {
  isAllowed: boolean;
  usedQuota: number;
  monthlyQuota: number;
  remainingQuota: number;
  reason?: string;
}

export async function checkUserAIQuota(userId: string): Promise<QuotaCheckResult> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (!subscription) {
    // Default free tier
    return {
      isAllowed: true,
      usedQuota: 0,
      monthlyQuota: 100,
      remainingQuota: 100,
    };
  }

  const isDev = process.env.NODE_ENV !== 'production';
  const effectiveQuota = isDev ? Math.max(subscription.monthlyQuota, 100) : subscription.monthlyQuota;
  const remaining = Math.max(0, effectiveQuota - subscription.usedQuota);
  const isAllowed = isDev || subscription.usedQuota < effectiveQuota;

  return {
    isAllowed,
    usedQuota: subscription.usedQuota,
    monthlyQuota: effectiveQuota,
    remainingQuota: remaining,
    reason: isAllowed ? undefined : 'Monthly AI optimization quota exceeded. Please upgrade your subscription.',
  };

}

export async function incrementUserAIUsage(
  userId: string,
  tokensUsed: number = 0,
  durationMs: number = 0
): Promise<void> {
  try {
    // Increment subscription used quota
    await prisma.subscription.upsert({
      where: { userId },
      update: { usedQuota: { increment: 1 } },
      create: { userId, plan: 'free', monthlyQuota: 5, usedQuota: 1 },
    });

    // Record API usage log for cost observability
    await prisma.apiUsageLog.create({
      data: {
        userId,
        endpoint: '/api/optimization/optimize',
        method: 'POST',
        statusCode: 200,
        responseTimeMs: durationMs,
        tokensUsed,
        costUsd: (tokensUsed / 1_000_000) * 0.15, // Approximate flash tier pricing ($0.15 / 1M tokens)
      },
    });
  } catch (err: any) {
    logger.warn('Failed to increment AI usage record', { userId, error: err?.message });
  }
}

export function validateAIInputSize(resumeText: string, jdText: string): { isValid: boolean; error?: string } {
  if (resumeText.length > MAX_RESUME_INPUT_CHARS) {
    return {
      isValid: false,
      error: `Resume text size (${resumeText.length.toLocaleString()} chars) exceeds maximum allowed limit of ${MAX_RESUME_INPUT_CHARS.toLocaleString()} characters.`,
    };
  }

  if (jdText.length > MAX_JD_INPUT_CHARS) {
    return {
      isValid: false,
      error: `Job description size (${jdText.length.toLocaleString()} chars) exceeds maximum allowed limit of ${MAX_JD_INPUT_CHARS.toLocaleString()} characters.`,
    };
  }

  return { isValid: true };
}
