/**
 * Unit Tests: Storage File Reconciliation Service
 */

import fs from 'fs-extra';
import path from 'path';
import { FileReconciliationService } from '@services/fileReconciliation.service';

describe('File Reconciliation Service', () => {
  const testStorageDir = path.join(__dirname, '../../test_reconciliation_storage');
  const service = new FileReconciliationService(testStorageDir);

  beforeAll(async () => {
    await fs.ensureDir(testStorageDir);
  });

  afterAll(async () => {
    await fs.remove(testStorageDir);
  });

  it('handles non-existent or empty storage directories gracefully', async () => {
    const report = await service.reconcileFiles(24, false);
    expect(report.scannedFilesCount).toBe(0);
    expect(report.orphanFilesCount).toBe(0);
    expect(report.deletedFilesCount).toBe(0);
  });

  it('detects unreferenced files older than threshold', async () => {
    const userDir = path.join(testStorageDir, 'users/test-user-123/originals');
    await fs.ensureDir(userDir);

    const oldOrphanFile = path.join(userDir, 'orphan_old.pdf');
    await fs.writeFile(oldOrphanFile, 'dummy-content');

    // Artificially age the file to 48 hours ago
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await fs.utimes(oldOrphanFile, twoDaysAgo, twoDaysAgo);

    // Dry run
    const dryRunReport = await service.reconcileFiles(24, false, async () => new Set<string>());
    expect(dryRunReport.scannedFilesCount).toBeGreaterThanOrEqual(1);
    expect(dryRunReport.orphanFilesCount).toBeGreaterThanOrEqual(1);
    expect(dryRunReport.deletedFilesCount).toBe(0);
    expect(await fs.pathExists(oldOrphanFile)).toBe(true);

    // Execution run with deletion
    const cleanupReport = await service.reconcileFiles(24, true, async () => new Set<string>());
    expect(cleanupReport.deletedFilesCount).toBeGreaterThanOrEqual(1);
    expect(await fs.pathExists(oldOrphanFile)).toBe(false);

  });
});
