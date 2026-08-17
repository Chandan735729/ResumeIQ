/**
 * File Storage Interface and Implementation
 * Abstracts file storage operations for easy migration from local to S3
 */

import fs from 'fs-extra'
import path from 'path'
import crypto from 'crypto'

// ============================================
// Storage Interface (Pluggable)
// ============================================

export interface IFileStorage {
  upload(userId: string, fileBuffer: Buffer, fileName: string): Promise<string>
  download(userId: string, fileKey: string): Promise<Buffer>
  delete(userId: string, fileKey: string): Promise<void>
  exists(userId: string, fileKey: string): Promise<boolean>
  listFiles(userId: string, prefix?: string): Promise<string[]>
}

// ============================================
// Local File Storage (Phase 2)
// ============================================

export class LocalFileStorage implements IFileStorage {
  private baseDir: string

  constructor(baseDir: string = '/app/storage') {
    this.baseDir = baseDir
  }

  /**
   * Upload file to local filesystem
   * Returns: File key (path relative to base dir)
   */
  async upload(userId: string, fileBuffer: Buffer, fileName: string): Promise<string> {
    try {
      // Create user directory if it doesn't exist
      const userDir = path.join(this.baseDir, 'users', userId, 'originals')
      await fs.ensureDir(userDir)

      // Generate unique filename with hash to prevent collisions
      const timestamp = Date.now()
      const hash = crypto.randomBytes(8).toString('hex')
      const ext = path.extname(fileName)
      const uniqueFileName = `${timestamp}_${hash}${ext}`
      const filePath = path.join(userDir, uniqueFileName)

      // Write file to disk
      await fs.writeFile(filePath, fileBuffer)

      // Return relative key for storage. Normalize to forward slashes so the
      // key is a stable, portable identifier (matches S3 key conventions and
      // the `file:///${fileKey}` URL built from it) regardless of host OS —
      // path.relative returns backslashes on Windows, which would otherwise
      // leak into s3Key/s3Url and any URL built from it.
      const fileKey = path.relative(this.baseDir, filePath).split(path.sep).join('/')
      return fileKey
    } catch (error) {
      throw new Error(`Failed to upload file: ${(error as Error).message}`)
    }
  }

  /**
   * Download file from local filesystem
   */
  async download(userId: string, fileKey: string): Promise<Buffer> {
    try {
      // Prevent path traversal attacks
      if (fileKey.includes('..') || fileKey.startsWith('/')) {
        throw new Error('Invalid file key')
      }

      const filePath = path.join(this.baseDir, fileKey)
      
      // Verify file is within user's directory
      const userDir = path.join(this.baseDir, 'users', userId)
      const resolvedPath = path.resolve(filePath)
      const resolvedUserDir = path.resolve(userDir)
      
      // A bare prefix check without a trailing separator is bypassable: a
      // sibling directory like "users/user1-evil" also starts with the
      // string "users/user1". Requiring an exact match or a match followed
      // by the OS path separator closes that gap.
      if (resolvedPath !== resolvedUserDir && !resolvedPath.startsWith(resolvedUserDir + path.sep)) {
        throw new Error('Access denied: File not in user directory')
      }

      const buffer = await fs.readFile(filePath)
      return buffer
    } catch (error) {
      throw new Error(`Failed to download file: ${(error as Error).message}`)
    }
  }

  /**
   * Delete file from local filesystem
   */
  async delete(userId: string, fileKey: string): Promise<void> {
    try {
      // Prevent path traversal
      if (fileKey.includes('..') || fileKey.startsWith('/')) {
        throw new Error('Invalid file key')
      }

      const filePath = path.join(this.baseDir, fileKey)
      
      // Verify file is within user's directory
      const userDir = path.join(this.baseDir, 'users', userId)
      const resolvedPath = path.resolve(filePath)
      const resolvedUserDir = path.resolve(userDir)
      
      // A bare prefix check without a trailing separator is bypassable: a
      // sibling directory like "users/user1-evil" also starts with the
      // string "users/user1". Requiring an exact match or a match followed
      // by the OS path separator closes that gap.
      if (resolvedPath !== resolvedUserDir && !resolvedPath.startsWith(resolvedUserDir + path.sep)) {
        throw new Error('Access denied: File not in user directory')
      }

      await fs.remove(filePath)
    } catch (error) {
      throw new Error(`Failed to delete file: ${(error as Error).message}`)
    }
  }

  /**
   * Check if file exists
   */
  async exists(userId: string, fileKey: string): Promise<boolean> {
    try {
      if (fileKey.includes('..') || fileKey.startsWith('/')) {
        return false
      }

      const filePath = path.join(this.baseDir, fileKey)
      const userDir = path.join(this.baseDir, 'users', userId)
      const resolvedPath = path.resolve(filePath)
      const resolvedUserDir = path.resolve(userDir)
      
      // A bare prefix check without a trailing separator is bypassable: a
      // sibling directory like "users/user1-evil" also starts with the
      // string "users/user1". Requiring an exact match or a match followed
      // by the OS path separator closes that gap.
      if (resolvedPath !== resolvedUserDir && !resolvedPath.startsWith(resolvedUserDir + path.sep)) {
        return false
      }

      return await fs.pathExists(filePath)
    } catch {
      return false
    }
  }

  /**
   * List files in user's directory
   */
  async listFiles(userId: string, prefix: string = ''): Promise<string[]> {
    try {
      const userDir = path.join(this.baseDir, 'users', userId, 'originals')
      
      if (!await fs.pathExists(userDir)) {
        return []
      }

      const files = await fs.readdir(userDir)
      return files.filter(f => f.startsWith(prefix))
    } catch (error) {
      throw new Error(`Failed to list files: ${(error as Error).message}`)
    }
  }
}

// ============================================
// Factory Function
// ============================================

export function createFileStorage(provider: string = 'local'): IFileStorage {
  if (provider === 's3') {
    throw new Error('S3 storage not yet implemented. Use local storage.')
  }
  
  const baseDir = process.env.STORAGE_BASE_DIR || '/app/storage'
  return new LocalFileStorage(baseDir)
}

// Export singleton instance
export const fileStorage = createFileStorage(process.env.STORAGE_PROVIDER || 'local')
