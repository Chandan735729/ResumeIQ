/**
 * Resume Versions Service
 *
 * Handles version listing, comparison against original, document generation,
 * secure downloads with sanitized headers, and version lifecycle management.
 */

import { prisma } from '../../services/prisma.service';
import { fileStorage } from '../../services/file-storage.service';
import { documentGenerationService } from '../../services/documents/documentGeneration.service';
import { layoutToMatchInput } from '../../services/matchingEngine.service';
import {
  ResumeVersionSummaryDTO,
  ResumeVersionDetailDTO,
  VersionComparisonDTO,
  VersionDownloadResult,
  VersionError,
  VersionErrorCode,
} from './versions.types';
import type { DocumentFormat } from '../../services/documents/document.interface';
import type { ChangeDiffItem } from '../../services/ai/changeTracker';

async function verifyResumeOwnership(userId: string, resumeId: string) {
  const resume = await prisma.resume.findUnique({
    where: { id: resumeId },
  });

  if (!resume) {
    throw {
      code: VersionErrorCode.RESUME_NOT_FOUND,
      message: 'Resume not found.',
      field: 'resumeId',
    } as VersionError;
  }

  if (resume.userId !== userId) {
    throw {
      code: VersionErrorCode.ACCESS_DENIED,
      message: 'Forbidden: You do not have permission to access this resume.',
    } as VersionError;
  }

  return resume;
}

export async function listVersions(
  userId: string,
  resumeId: string,
  limit: number = 20,
  offset: number = 0
): Promise<{ versions: ResumeVersionSummaryDTO[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean } }> {
  await verifyResumeOwnership(userId, resumeId);

  const [total, items] = await Promise.all([
    prisma.resumeVersion.count({ where: { resumeId } }),
    prisma.resumeVersion.findMany({
      where: { resumeId },
      orderBy: { versionNumber: 'desc' },
      skip: offset,
      take: limit,
    }),
  ]);

  return {
    versions: items.map(v => ({
      id: v.id,
      resumeId: v.resumeId,
      versionNumber: v.versionNumber,
      optimizationType: v.optimizationType,
      beforeScore: v.beforeScore,
      overallScore: v.overallScore,
      atsScore: v.atsScore,
      matchScore: v.matchScore,
      recruiterScore: v.recruiterScore,
      pdfAvailable: !!v.s3PdfUrl,
      docxAvailable: !!v.s3DocxUrl,
      createdAt: v.createdAt,
    })),
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    },
  };
}

export async function getVersion(
  userId: string,
  resumeId: string,
  versionId: string
): Promise<ResumeVersionDetailDTO> {
  await verifyResumeOwnership(userId, resumeId);

  const version = await prisma.resumeVersion.findUnique({
    where: { id: versionId },
    include: { metrics: true },
  });

  if (!version || version.resumeId !== resumeId) {
    throw {
      code: VersionErrorCode.VERSION_NOT_FOUND,
      message: 'Resume version not found.',
      field: 'versionId',
    } as VersionError;
  }

  let aiChanges: ChangeDiffItem[] = [];
  try {
    aiChanges = JSON.parse(version.aiChanges);
  } catch {
    aiChanges = [];
  }

  let metricsParsed = null;
  if (version.metrics) {
    let addedKeywords: string[] = [];
    let removedKeywords: string[] = [];
    try {
      addedKeywords = JSON.parse(version.metrics.addedKeywords);
    } catch { addedKeywords = []; }
    try {
      removedKeywords = JSON.parse(version.metrics.removedKeywords);
    } catch { removedKeywords = []; }

    metricsParsed = {
      originalKeywordCount: version.metrics.originalKeywordCount,
      optimizedKeywordCount: version.metrics.optimizedKeywordCount,
      addedKeywords,
      removedKeywords,
      avgReadabilityScore: version.metrics.avgReadabilityScore,
      sentenceVariety: version.metrics.sentenceVariety,
      atsCompatibilityScore: version.metrics.atsCompatibilityScore,
    };
  }

  return {
    id: version.id,
    resumeId: version.resumeId,
    versionNumber: version.versionNumber,
    optimizationType: version.optimizationType,
    beforeScore: version.beforeScore,
    overallScore: version.overallScore,
    atsScore: version.atsScore,
    matchScore: version.matchScore,
    recruiterScore: version.recruiterScore,
    pdfAvailable: !!version.s3PdfUrl,
    docxAvailable: !!version.s3DocxUrl,
    pdfFileKey: version.s3PdfUrl,
    docxFileKey: version.s3DocxUrl,
    optimizedText: version.optimizedText,
    aiChanges,
    validationErrors: version.validationErrors,
    metrics: metricsParsed,
    createdAt: version.createdAt,
  };
}

export async function compareVersion(
  userId: string,
  resumeId: string,
  versionId: string
): Promise<VersionComparisonDTO> {
  const resume = await verifyResumeOwnership(userId, resumeId);

  const version = await prisma.resumeVersion.findUnique({
    where: { id: versionId },
    include: { metrics: true },
  });

  if (!version || version.resumeId !== resumeId) {
    throw {
      code: VersionErrorCode.VERSION_NOT_FOUND,
      message: 'Resume version not found.',
      field: 'versionId',
    } as VersionError;
  }

  let changes: ChangeDiffItem[] = [];
  try {
    changes = JSON.parse(version.aiChanges);
  } catch {
    changes = [];
  }

  let addedKeywords: string[] = [];
  if (version.metrics) {
    try {
      addedKeywords = JSON.parse(version.metrics.addedKeywords);
    } catch {
      addedKeywords = [];
    }
  }

  // The version's own `beforeScore` (captured at optimization time from the
  // ORIGINAL, pre-optimization resume) is the only correct source for this
  // comparison. `metrics.atsCompatibilityScore` is a different, after-only
  // metric (see prisma/schema.prisma) -- using it here was the root cause of
  // every version's comparison page showing a 0.0 delta regardless of what
  // optimization actually changed, since it equals `afterScore` by
  // construction. Versions created before `beforeScore` existed have no
  // recoverable true value, so they fall back to today's (known-inaccurate)
  // behavior rather than crashing.
  const originalScore = version.beforeScore ?? version.atsScore;
  const afterScore = version.overallScore;
  const scoreDelta = Math.round((afterScore - originalScore) * 10) / 10;

  return {
    versionId: version.id,
    resumeId: resume.id,
    versionNumber: version.versionNumber,
    originalText: resume.extractedText || '',
    optimizedText: version.optimizedText,
    beforeScore: originalScore,
    afterScore,
    scoreDelta,
    isImproved: scoreDelta > 0,
    changes,
    addedKeywords,
    preservedFacts: [],
    createdAt: version.createdAt,
  };
}

export async function downloadVersion(
  userId: string,
  resumeId: string,
  versionId: string,
  format: DocumentFormat = 'pdf'
): Promise<VersionDownloadResult> {
  const resume = await verifyResumeOwnership(userId, resumeId);

  const version = await prisma.resumeVersion.findUnique({
    where: { id: versionId },
  });

  if (!version || version.resumeId !== resumeId) {
    throw {
      code: VersionErrorCode.VERSION_NOT_FOUND,
      message: 'Resume version not found.',
      field: 'versionId',
    } as VersionError;
  }

  const existingKey = format === 'docx' ? version.s3DocxUrl : version.s3PdfUrl;
  let fileBuffer: Buffer | null = null;

  // 1. Try reading existing stored document
  if (existingKey) {
    try {
      const exists = await fileStorage.exists(userId, existingKey);
      if (exists) {
        fileBuffer = await fileStorage.download(userId, existingKey);
      }
    } catch {
      fileBuffer = null;
    }
  }

  // 2. If not stored, generate on the fly and save
  if (!fileBuffer) {
    const resumeInput = layoutToMatchInput(resume.extractedLayout, version.optimizedText) || {
      skills: [],
      experience: [],
      education: [],
      certifications: [],
      projectTechnologies: [],
      rawText: version.optimizedText,
    };

    const parsedName = resumeInput.contact?.fullName?.trim();
    const candidateName = parsedName && parsedName.length > 0
      ? parsedName
      : resume.fileName.replace(/\.[^/.]+$/, '');

    const docResult = await documentGenerationService.generateAndStoreDocument(userId, resumeInput, {
      format,
      candidateName,
      contactEmail: resumeInput.contact?.email,
      contactPhone: resumeInput.contact?.phone,
      summary: resumeInput.summary || version.optimizedText.slice(0, 300),
    });

    fileBuffer = docResult.buffer;

    // Update version with generated fileKey
    if (format === 'docx') {
      await prisma.resumeVersion.update({
        where: { id: version.id },
        data: { s3DocxUrl: docResult.fileKey },
      });
    } else {
      await prisma.resumeVersion.update({
        where: { id: version.id },
        data: { s3PdfUrl: docResult.fileKey },
      });
    }
  }

  const sanitizedBase = resume.fileName.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/\.[^/.]+$/, '');
  const fileName = `${sanitizedBase}_v${version.versionNumber}_Optimized.${format}`;
  const mimeType = format === 'docx'
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/pdf';

  return {
    buffer: fileBuffer,
    mimeType,
    fileName,
    format,
    fileSizeBytes: fileBuffer.length,
  };
}

export async function deleteVersion(
  userId: string,
  resumeId: string,
  versionId: string
): Promise<void> {
  await verifyResumeOwnership(userId, resumeId);

  const version = await prisma.resumeVersion.findUnique({
    where: { id: versionId },
  });

  if (!version || version.resumeId !== resumeId) {
    throw {
      code: VersionErrorCode.VERSION_NOT_FOUND,
      message: 'Resume version not found.',
      field: 'versionId',
    } as VersionError;
  }

  // Delete DB record first to prevent ghost references
  await prisma.resumeVersion.delete({
    where: { id: versionId },
  });

  // Clean up physical files if they exist
  if (version.s3PdfUrl) {
    try {
      await fileStorage.delete(userId, version.s3PdfUrl);
    } catch (err: any) {
      // Best-effort cleanup
    }
  }
  if (version.s3DocxUrl) {
    try {
      await fileStorage.delete(userId, version.s3DocxUrl);
    } catch (err: any) {
      // Best-effort cleanup
    }
  }
}

