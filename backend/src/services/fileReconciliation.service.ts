/**
 * Storage File Reconciliation Service
 *
 * Scans storage directories and cross-references with database records to detect
 * and safely clean up orphaned files older than a safety threshold.
 */

import fs from 'fs-extra';
import path from 'path';
import { prisma } from './prisma.service';
import { logger } from './logger.service';

export interface ReconciliationReport {
  scannedFilesCount: number;
  validFilesCount: number;
  orphanFilesCount: number;
  orphanFileKeys: string[];
  deletedFilesCount: number;
  durationMs: number;
}

export class FileReconciliationService {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || process.env.STORAGE_BASE_DIR || '/app/storage';
  }

  /**
   * Reconciles files on disk against database records for a given user or all users.
   *
   * @param minAgeHours Minimum age in hours for a file to be considered a candidate orphan (default: 24h)
   * @param deleteOrphans If true, permanently deletes confirmed orphan files older than minAgeHours
   * @param knownKeysProvider Optional provider to supply known database keys without direct DB queries
   */
  async reconcileFiles(
    minAgeHours: number = 24,
    deleteOrphans: boolean = false,
    knownKeysProvider?: () => Promise<Set<string>>
  ): Promise<ReconciliationReport> {
    const startTime = Date.now();
    const usersDir = path.join(this.baseDir, 'users');

    if (!await fs.pathExists(usersDir)) {
      return {
        scannedFilesCount: 0,
        validFilesCount: 0,
        orphanFilesCount: 0,
        orphanFileKeys: [],
        deletedFilesCount: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // 1. Fetch all known file references from DB or provider
    let knownKeys = new Set<string>();
    if (knownKeysProvider) {
      knownKeys = await knownKeysProvider();
    } else {
      try {
        const [originalFiles, resumeVersions] = await Promise.all([
          prisma.originalFile.findMany({ select: { s3Key: true } }),
          prisma.resumeVersion.findMany({ select: { s3PdfUrl: true, s3DocxUrl: true } }),
        ]);

        for (const f of originalFiles) {
          if (f.s3Key) knownKeys.add(f.s3Key.replace(/\\/g, '/'));
        }
        for (const v of resumeVersions) {
          if (v.s3PdfUrl) knownKeys.add(v.s3PdfUrl.replace(/\\/g, '/'));
          if (v.s3DocxUrl) knownKeys.add(v.s3DocxUrl.replace(/\\/g, '/'));
        }
      } catch (err: any) {
        logger.warn('Failed to query database for known files in reconciliation', { error: err?.message });
      }
    }



    // 2. Scan physical directories
    const scannedKeys: { key: string; fullPath: string; mtime: Date }[] = [];
    const userDirs = await fs.readdir(usersDir);

    for (const userId of userDirs) {
      const userRoot = path.join(usersDir, userId);
      const subdirs = ['originals', 'versions'];

      for (const sub of subdirs) {
        const targetDir = path.join(userRoot, sub);
        if (await fs.pathExists(targetDir)) {
          const files = await fs.readdir(targetDir);
          for (const file of files) {
            const fullPath = path.join(targetDir, file);
            const stat = await fs.stat(fullPath);
            if (stat.isFile()) {
              const relKey = path.relative(this.baseDir, fullPath).replace(/\\/g, '/');
              scannedKeys.push({ key: relKey, fullPath, mtime: stat.mtime });
            }
          }
        }
      }
    }

    // 3. Identify orphans beyond the age threshold
    const now = Date.now();
    const ageThresholdMs = minAgeHours * 60 * 60 * 1000;
    const orphanKeys: string[] = [];
    let deletedCount = 0;

    for (const item of scannedKeys) {
      if (!knownKeys.has(item.key)) {
        const fileAgeMs = now - item.mtime.getTime();
        if (fileAgeMs >= ageThresholdMs) {
          orphanKeys.push(item.key);
          if (deleteOrphans) {
            try {
              await fs.remove(item.fullPath);
              deletedCount++;
              logger.info('Deleted orphaned storage file', { key: item.key });
            } catch (err: any) {
              logger.warn('Failed to delete orphaned storage file', { key: item.key, error: err?.message });
            }
          }
        }
      }
    }

    const durationMs = Date.now() - startTime;
    return {
      scannedFilesCount: scannedKeys.length,
      validFilesCount: scannedKeys.length - orphanKeys.length,
      orphanFilesCount: orphanKeys.length,
      orphanFileKeys: orphanKeys,
      deletedFilesCount: deletedCount,
      durationMs,
    };
  }
}

export const fileReconciliationService = new FileReconciliationService();
