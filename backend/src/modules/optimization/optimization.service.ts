/**
 * Optimization Service
 *
 * Coordinates end-to-end safe AI resume optimization:
 * 1. Authorization & Ownership verification
 * 2. Subscription quota & Rate limits check
 * 3. Input size sanitization
 * 4. Deterministic baseline match & ATS score calculation
 * 5. Prompt construction (optimization-v1)
 * 6. AI generation via Provider Boundary
 * 7. Schema validation (rejection of malformed JSON)
 * 8. Fact-checking guardrails (deterministic rejection of fabricated tech/metrics/certs)
 * 9. Change diff generation and layout application
 * 10. Authoritative deterministic ATS re-scoring
 * 11. Persistence to ResumeVersion & OptimizationMetrics
 * 12. Quota & token usage recording
 */

import { prisma } from '../../services/prisma.service';
import { logger } from '../../services/logger.service';
import { IAIProvider } from '../../services/ai/aiProvider.interface';
import { documentGenerationService } from '../../services/documents/documentGeneration.service';
import { GeminiProvider } from '../../services/ai/geminiProvider';

import { MockAIProvider } from '../../services/ai/mockAIProvider';
import { buildOptimizationPrompt, CURRENT_PROMPT_VERSION } from '../../services/ai/prompts/optimization.prompts';
import { validateOptimizationSchema } from '../../services/ai/guardrails/schemaValidator';
import { runFactGuardrails } from '../../services/ai/guardrails/factGuardrail';
import { applyChangesToResume } from '../../services/ai/changeTracker';
import { rescoreOptimizedResume } from '../../services/ai/rescorer.service';
import { checkUserAIQuota, incrementUserAIUsage, validateAIInputSize } from '../../services/ai/costControls';
import { matchResumeToJob, layoutToMatchInput } from '../../services/matchingEngine.service';
import { computeATSScore } from '../../services/atsScorer.service';
import { extractJobDescription } from '../../services/jdExtractor.service';
import {
  OptimizeResumeDTO,
  OptimizationResponseDTO,
  OptimizationErrorCode,
  OptimizationError,
} from './optimization.types';
import { validateOptimizeResumeInput } from './optimization.validation';

// Default provider instance
let defaultProvider: IAIProvider | null = null;

export function getAIProvider(): IAIProvider {
  if (defaultProvider) return defaultProvider;

  const apiKey = process.env.GOOGLE_API_KEY;
  const providerType = process.env.AI_PROVIDER;

  if (providerType === 'mock') {
    defaultProvider = new MockAIProvider('success_standard');
    return defaultProvider;
  }

  if (apiKey && apiKey !== 'your-google-api-key-here') {
    defaultProvider = new GeminiProvider();
    return defaultProvider;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL CONFIGURATION ERROR: GOOGLE_API_KEY is required in production environment. To explicitly use mock provider in production, set AI_PROVIDER=mock.'
    );
  }

  // In test / offline development environments without real API key, use MockAIProvider
  defaultProvider = new MockAIProvider('success_standard');
  return defaultProvider;
}


export function setAIProvider(provider: IAIProvider): void {
  defaultProvider = provider;
}

export async function optimizeResume(
  userId: string,
  dto: OptimizeResumeDTO,
  providerOverride?: IAIProvider
): Promise<OptimizationResponseDTO> {
  validateOptimizeResumeInput(dto);

  const provider = providerOverride || getAIProvider();

  // 1. Authorization: verify resume ownership
  const resume = await prisma.resume.findUnique({
    where: { id: dto.resumeId },
  });

  if (!resume) {
    throw {
      code: OptimizationErrorCode.RESUME_NOT_FOUND,
      message: 'Resume not found.',
      field: 'resumeId',
    } as OptimizationError;
  }

  if (resume.userId !== userId) {
    throw {
      code: OptimizationErrorCode.ACCESS_DENIED,
      message: 'Forbidden: You do not have permission to access this resume.',
    } as OptimizationError;
  }

  if (resume.parseStatus !== 'COMPLETED' || !resume.extractedLayout) {
    throw {
      code: OptimizationErrorCode.RESUME_NOT_PARSED,
      message: 'Resume has not been successfully parsed yet.',
    } as OptimizationError;
  }

  // 2. Authorization: verify job description ownership
  const jd = await prisma.jobDescription.findUnique({
    where: { id: dto.jobDescriptionId },
  });

  if (!jd) {
    throw {
      code: OptimizationErrorCode.JD_NOT_FOUND,
      message: 'Job description not found.',
      field: 'jobDescriptionId',
    } as OptimizationError;
  }

  if (jd.userId !== userId) {
    throw {
      code: OptimizationErrorCode.ACCESS_DENIED,
      message: 'Forbidden: You do not have permission to access this job description.',
    } as OptimizationError;
  }

  // 3. Quota check
  const quotaCheck = await checkUserAIQuota(userId);
  if (!quotaCheck.isAllowed) {
    throw {
      code: OptimizationErrorCode.QUOTA_EXCEEDED,
      message: quotaCheck.reason || 'AI optimization monthly quota exceeded.',
    } as OptimizationError;
  }

  // 4. Input size validation
  const resumeText = resume.extractedText || '';
  const jdText = jd.rawText || '';
  const sizeCheck = validateAIInputSize(resumeText, jdText);
  if (!sizeCheck.isValid) {
    throw {
      code: OptimizationErrorCode.INPUT_TOO_LARGE,
      message: sizeCheck.error || 'Input exceeds maximum allowed length.',
    } as OptimizationError;
  }

  // 5. Build resume & JD representations
  const resumeInput = layoutToMatchInput(resume.extractedLayout, resume.extractedText);
  if (!resumeInput) {
    throw {
      code: OptimizationErrorCode.RESUME_NOT_PARSED,
      message: 'Failed to reconstruct resume layout data.',
    } as OptimizationError;
  }

  const structuredJD = jd.extractedStructure
    ? JSON.parse(jd.extractedStructure)
    : extractJobDescription(jd.rawText, jd.jobTitle, jd.companyName);

  // 6. Compute baseline deterministic match & ATS score
  const beforeMatchResult = matchResumeToJob(resumeInput, structuredJD);
  const beforeScoreResult = computeATSScore(beforeMatchResult);

  const optimizationType = dto.optimizationType || 'conservative';

  // 7. Build structured prompt (treating resume/JD as untrusted data)
  const promptContext = buildOptimizationPrompt(
    resumeText,
    jdText,
    beforeMatchResult,
    CURRENT_PROMPT_VERSION,
    optimizationType
  );

  // 8. Generate optimization via provider
  const startTime = Date.now();
  let aiResponse;
  try {
    aiResponse = await provider.generateOptimization(promptContext, {
      temperature: 0.2,
      maxOutputTokens: 2048,
    });
  } catch (err: any) {
    logger.error('AI provider error during resume optimization', {
      error: err?.message,
      code: err?.code,
    });
    throw {
      code: err?.code === 'AI_TIMEOUT' ? OptimizationErrorCode.AI_TIMEOUT : OptimizationErrorCode.AI_PROVIDER_ERROR,
      message: 'Failed to generate AI optimization suggestions. Please try again.',
    } as OptimizationError;
  }

  // 9. Schema validation guardrail
  const schemaValidation = validateOptimizationSchema(aiResponse.rawContent);
  if (!schemaValidation.isValid || !schemaValidation.data) {
    logger.warn('AI output failed schema validation', { errors: schemaValidation.errors });
    throw {
      code: OptimizationErrorCode.SCHEMA_VALIDATION_FAILED,
      message: 'AI output format was invalid.',
    } as OptimizationError;
  }

  // 10. Fact-checking guardrails (deterministic hallucination rejection)
  const factReport = runFactGuardrails(
    schemaValidation.data.changes,
    resumeInput.rawText,
    resumeInput.skills,
    optimizationType
  );

  // 11. Apply approved changes to generate optimized text and layout
  const diffReport = applyChangesToResume(
    resumeInput,
    factReport.approvedChanges,
    factReport.rejectedChanges,
    schemaValidation.data.summarySuggestion
  );

  // 12. Authoritative deterministic ATS re-scoring
  const scoreComparison = rescoreOptimizedResume(
    diffReport.optimizedLayout,
    structuredJD,
    beforeScoreResult
  );

  // 13. Determine version number
  const existingVersionCount = await prisma.resumeVersion.count({
    where: { resumeId: resume.id },
  });
  const versionNumber = existingVersionCount + 1;

  // 14. Pre-render and store PDF & DOCX documents
  let s3PdfUrl: string | null = null;
  let s3DocxUrl: string | null = null;
  const parsedName = diffReport.optimizedLayout.contact?.fullName?.trim();
  const candidateName = parsedName && parsedName.length > 0
    ? parsedName
    : resume.fileName.replace(/\.[^/.]+$/, '');

  try {
    const pdfDoc = await documentGenerationService.generateAndStoreDocument(userId, diffReport.optimizedLayout, {
      format: 'pdf',
      candidateName,
      contactEmail: diffReport.optimizedLayout.contact?.email,
      contactPhone: diffReport.optimizedLayout.contact?.phone,
      summary: diffReport.summarySuggestion,
    });
    s3PdfUrl = pdfDoc.fileKey;
  } catch (err: any) {
    logger.warn('Failed to pre-render PDF for resume version', { error: err?.message });
  }

  try {
    const docxDoc = await documentGenerationService.generateAndStoreDocument(userId, diffReport.optimizedLayout, {
      format: 'docx',
      candidateName,
      contactEmail: diffReport.optimizedLayout.contact?.email,
      contactPhone: diffReport.optimizedLayout.contact?.phone,
      summary: diffReport.summarySuggestion,
    });
    s3DocxUrl = docxDoc.fileKey;
  } catch (err: any) {
    logger.warn('Failed to pre-render DOCX for resume version', { error: err?.message });
  }

  // 15. Persist to ResumeVersion and OptimizationMetrics
  const savedVersion = await prisma.resumeVersion.create({
    data: {
      resumeId: resume.id,
      versionNumber,
      optimizationType,
      optimizedText: diffReport.optimizedText,
      aiChanges: JSON.stringify(diffReport.changes),
      isValid: true,
      matchScore: scoreComparison.afterScore,
      atsScore: scoreComparison.afterScore,
      recruiterScore: scoreComparison.afterScore,
      overallScore: scoreComparison.afterScore,
      s3PdfUrl,
      s3DocxUrl,
      metrics: {
        create: {
          originalKeywordCount: beforeMatchResult.keywordMatch.matched.length,
          optimizedKeywordCount: scoreComparison.afterMatchResult.keywordMatch.matched.length,
          addedKeywords: JSON.stringify(
            scoreComparison.afterMatchResult.keywordMatch.matched.filter(
              k => !beforeMatchResult.keywordMatch.matched.includes(k)
            )
          ),
          removedKeywords: JSON.stringify([]),
          avgReadabilityScore: 85.0,
          sentenceVariety: 75.0,
          atsCompatibilityScore: scoreComparison.afterScore,
          recruiterReadinessScore: scoreComparison.afterScore,
          impactEmphasisScore: 80.0,
        },
      },
    },
  });


  // 15. Record token and quota usage
  const durationMs = Date.now() - startTime;
  await incrementUserAIUsage(userId, aiResponse.tokenUsage?.totalTokens || 500, durationMs);

  return {
    versionId: savedVersion.id,
    resumeId: resume.id,
    jobDescriptionId: jd.id,
    versionNumber,
    optimizationType,
    promptVersion: CURRENT_PROMPT_VERSION,
    model: aiResponse.model,
    beforeScore: scoreComparison.beforeScore,
    afterScore: scoreComparison.afterScore,
    scoreDelta: scoreComparison.scoreDelta,
    isImproved: scoreComparison.isImproved,
    scoreComparison,
    summarySuggestion: schemaValidation.data.summarySuggestion,
    changes: diffReport.changes,
    totalChangesApplied: diffReport.totalChangesApplied,
    totalChangesRejected: diffReport.totalChangesRejected,
    preservedFacts: schemaValidation.data.preservedFacts || [],
    warnings: [...factReport.warnings, ...(schemaValidation.data.warnings || [])],
    optimizedText: diffReport.optimizedText,
    createdAt: savedVersion.createdAt,
  };
}
