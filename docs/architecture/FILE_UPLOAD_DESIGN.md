# FILE UPLOAD DESIGN - ResumeIQ Phase 2

**Version**: 1.0  
**Status**: Design Phase (Implementation Ready)  
**Last Updated**: 2026-06-07  
**Owner**: ResumeIQ Backend Team

---

## Executive Summary

This document defines the secure, scalable file upload architecture for ResumeIQ. The design emphasizes:

- **Security First**: Authenticated-only uploads, file validation, malware scanning hooks
- **Performance**: Optimized for 10MB files, parallel processing, async queue
- **User Experience**: Clear progress, detailed error messages, quota management
- **Storage Flexibility**: Local dev/staging, S3-ready production, database backup option
- **Compliance**: Audit logging, data isolation, GDPR compliance

### Key Design Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| **Supported Formats** | PDF + DOCX only | Most common resume formats; reduces parsing complexity |
| **File Size Limit** | 10 MB per file | Covers 99.9% of resumes; prevents abuse |
| **Storage Strategy** | Local filesystem (dev), S3 (prod), with migration path | Simplicity now, cloud flexibility later |
| **Upload Isolation** | Per-user directory structure | Prevents accidental exposure, simplifies backup/restore |
| **Async Processing** | Queue-based with webhooks | UI can show progress without blocking |
| **Validation** | Client + server-side | Defense in depth |
| **Retention** | 30 days soft delete, 90 days hard delete | Compliance + recovery window |

---

## 1. Storage Architecture

### 1.1 Storage Strategy Options & Trade-offs

#### Option A: Local Filesystem (Current Phase 2 Implementation)

**Architecture**:
```
/app/storage/
├── users/
│   ├── user_id_1/
│   │   ├── originals/
│   │   │   ├── resume_1.pdf
│   │   │   ├── resume_2.docx
│   │   │   └── ...
│   │   └── metadata/
│   │       ├── resume_1.json
│   │       └── ...
│   └── user_id_2/
│       └── ...
└── temp/
    ├── upload_session_1/
    │   ├── file.pdf (during validation)
    │   └── metadata.json
    └── ...
```

**Docker Volume Setup**:
```yaml
volumes:
  resumeiq_storage:
    driver: local
  
services:
  backend:
    volumes:
      - resumeiq_storage:/app/storage
      - ./backend/storage:/app/storage-dev  # Development mapping
```

**Pros**:
- ✅ Simple implementation (no API keys, cloud auth)
- ✅ Fast for development and testing
- ✅ Direct file access for processing
- ✅ Zero additional cost
- ✅ Easy to backup (volume snapshots)
- ✅ GDPR compliant (data stays local)

**Cons**:
- ❌ Single-server failure risk
- ❌ Doesn't scale beyond single instance
- ❌ Manual migration to cloud needed
- ❌ Storage limits tied to instance size

#### Option B: AWS S3 (Future Cloud Migration)

**Architecture**:
```
s3://resumeiq-prod/
├── users/
│   ├── user_id_1/
│   │   ├── originals/
│   │   │   └── resume_1.pdf
│   │   ├── versions/
│   │   │   ├── resume_1_v1.pdf
│   │   │   └── resume_1_v1.docx
│   │   └── metadata/
│   │       └── resume_1.json
│   └── user_id_2/
│       └── ...
└── backups/
    └── ...
```

**When to Migrate**:
- Users > 1000 (storage cost becomes factor)
- Multi-region deployment needed
- Requires HA/disaster recovery
- CDN distribution wanted

**Migration Path** (Post-Phase 2):
1. Abstract storage layer with adapter pattern
2. Create S3StorageAdapter matching FileStorage interface
3. Gradually migrate files: background job reads local, writes S3, deletes local
4. Monitor dual-write period before full cutover
5. Keep local storage as hot-cache fallback

**Pros**:
- ✅ Unlimited scalability
- ✅ Built-in redundancy (99.99% uptime)
- ✅ International distribution (CloudFront CDN)
- ✅ Automatic versioning support
- ✅ Integration with AWS ecosystem

**Cons**:
- ❌ Higher complexity
- ❌ Costs money (~$0.023/GB/month)
- ❌ API rate limiting (mitigated by SDK)
- ❌ Network latency for local dev

#### Option C: Database BLOB Storage (Not Recommended)

**Why We're Skipping**:
- ❌ PostgreSQL not optimized for files > 1MB
- ❌ Blobs bloat database backups
- ❌ Slower than filesystem or S3
- ❌ Not suitable for file streaming
- ❌ Only use if files are < 100KB

### 1.2 Chosen Strategy: Hybrid Local-to-S3

**Phase 2 (Current)**:
- Local filesystem storage
- Docker volume persistence
- Reference implementation

**Phase 3 (Cloud Migration)**:
- Pluggable storage adapters
- Transparent migration from local to S3
- Fallback to local for development

**Implementation Pattern**:
```typescript
// Abstract storage interface
interface IFileStorage {
  upload(userId: string, file: Buffer, metadata: FileMetadata): Promise<string>
  download(userId: string, fileKey: string): Promise<Buffer>
  delete(userId: string, fileKey: string): Promise<void>
  exists(userId: string, fileKey: string): Promise<boolean>
  listFiles(userId: string, prefix?: string): Promise<string[]>
}

// Local implementation (Phase 2)
class LocalFileStorage implements IFileStorage { ... }

// S3 implementation (Phase 3)
class S3FileStorage implements IFileStorage { ... }

// Factory
const storage = process.env.STORAGE_PROVIDER === 's3' 
  ? new S3FileStorage()
  : new LocalFileStorage()
```

---

## 2. File Upload API Specification

### 2.1 Endpoint: POST /api/resumes/upload

**Purpose**: Upload a resume file (PDF or DOCX)

**Authentication**: Required (JWT Bearer token)

**Rate Limiting**: 10 uploads per minute per user

**Request**:
```http
POST /api/resumes/upload
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: multipart/form-data

---
[binary file data]
---
```

**Query Parameters**:
```typescript
{
  name?: string        // Optional: Rename file to this (sanitized)
  tags?: string        // Optional: Comma-separated tags (e.g., "tech,2024")
  description?: string // Optional: Text description of resume
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "message": "Resume uploaded successfully",
  "data": {
    "resumeId": "cmq3ka1e7000vxc941wdgzh11",
    "fileName": "John_Doe_Resume_2024.pdf",
    "fileSize": 245678,
    "fileType": "pdf",
    "storageLocation": "/storage/users/user_123/originals/resume_1.pdf",
    "uploadedAt": "2026-06-07T10:30:45.123Z",
    "quotaRemaining": 4,
    "quotaReset": "2026-07-07T00:00:00.000Z",
    "parseStatus": "pending",
    "parseProgress": 0
  }
}
```

### 2.2 Endpoint: GET /api/resumes/:resumeId/upload-status

**Purpose**: Check upload and parse progress

**Authentication**: Required

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Upload status retrieved",
  "data": {
    "resumeId": "cmq3ka1e7000vxc941wdgzh11",
    "uploadStatus": "completed",
    "uploadProgress": 100,
    "uploadedAt": "2026-06-07T10:30:45.123Z",
    "parseStatus": "in_progress",
    "parseProgress": 45,
    "parseStartedAt": "2026-06-07T10:31:00.000Z",
    "estimatedParseComplete": "2026-06-07T10:31:30.000Z",
    "errors": []
  }
}
```

### 2.3 Endpoint: GET /api/resumes

**Purpose**: List user's uploaded resumes

**Authentication**: Required

**Query Parameters**:
```typescript
{
  limit?: number       // Default: 10, Max: 100
  offset?: number      // Default: 0
  sortBy?: 'recent' | 'oldest' | 'name'  // Default: recent
  status?: 'all' | 'parsed' | 'parsing' | 'failed'
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Resumes retrieved",
  "data": {
    "resumes": [
      {
        "resumeId": "cmq3ka1e7000vxc941wdgzh11",
        "fileName": "John_Doe_Resume_2024.pdf",
        "fileSize": 245678,
        "fileType": "pdf",
        "uploadedAt": "2026-06-07T10:30:45.123Z",
        "parseStatus": "completed",
        "parseProgress": 100,
        "extractedText": "John Doe\nSoftware Engineer...",
        "metadata": {
          "hasError": false,
          "errorMessage": null
        }
      }
    ],
    "pagination": {
      "total": 5,
      "limit": 10,
      "offset": 0,
      "hasMore": false
    }
  }
}
```

### 2.4 Endpoint: DELETE /api/resumes/:resumeId

**Purpose**: Delete a resume

**Authentication**: Required (user must own resume)

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Resume deleted successfully",
  "data": {
    "resumeId": "cmq3ka1e7000vxc941wdgzh11",
    "deletedAt": "2026-06-07T10:35:00.000Z",
    "recoveryAvailableUntil": "2026-07-07T10:35:00.000Z"
  }
}
```

---

## 3. File Validation Rules

### 3.1 Validation Pipeline

```
Upload Request
    ↓
[1. Size Check] ← File ≤ 10 MB?
    ↓ Yes
[2. MIME Type] ← application/pdf or application/vnd.openxml...?
    ↓ Yes
[3. Extension] ← .pdf or .docx?
    ↓ Yes
[4. Magic Bytes] ← PDF header (25 50 44 46) or ZIP header?
    ↓ Yes
[5. Filename] ← Sanitize & validate
    ↓ Yes
[6. Quota Check] ← User has uploads remaining?
    ↓ Yes
[7. Virus Scan] ← (Optional) ClamAV/VirusTotal
    ↓ Yes (or optional)
[8. Integrity] ← MD5/SHA256 hash
    ↓ Success
[✅ Accept & Store]
```

### 3.2 Validation Rules

#### Size Validation
```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024  // 10 MB
const MIN_FILE_SIZE = 1 * 1024           // 1 KB

if (file.size < MIN_FILE_SIZE || file.size > MAX_FILE_SIZE) {
  throw new ValidationError(
    `File size must be between 1 KB and 10 MB. Got: ${formatBytes(file.size)}`
  )
}
```

#### MIME Type Validation
```typescript
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword'  // Legacy .doc files
]

if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
  throw new ValidationError(
    `Unsupported file type: ${file.mimetype}. Only PDF and DOCX allowed.`
  )
}
```

#### Magic Bytes Validation
```typescript
// Verify actual file type by header bytes
const magicBytes = {
  pdf: Buffer.from([0x25, 0x50, 0x44, 0x46]),  // %PDF
  docx: Buffer.from([0x50, 0x4B, 0x03, 0x04]),  // ZIP header
}

const header = buffer.slice(0, 4)
const isPdf = header.equals(magicBytes.pdf)
const isDocx = header.equals(magicBytes.docx)

if (!isPdf && !isDocx) {
  throw new ValidationError(
    'File header does not match expected format. File may be corrupted or not a valid PDF/DOCX.'
  )
}
```

#### Filename Sanitization
```typescript
// Remove path traversal, special chars, null bytes
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/\0/g, '')                    // Null bytes
    .replace(/\.\./g, '')                  // Path traversal
    .replace(/^\.+/, '')                   // Leading dots
    .replace(/[\/\\]/g, '')                // Path separators
    .replace(/[^a-zA-Z0-9._-]/g, '_')     // Special characters
    .slice(0, 255)                         // Max filename length
}

// Result: "../../evil.pdf" → "evil.pdf"
//         "Resume@#$%.pdf" → "Resume____.pdf"
```

#### Quota Validation
```typescript
// Get user's subscription
const subscription = await prisma.subscription.findUnique({
  where: { userId }
})

const uploadedThisMonth = await prisma.resume.count({
  where: {
    userId,
    createdAt: {
      gte: getMonthStart(now())
    }
  }
})

if (uploadedThisMonth >= subscription.monthlyQuota) {
  throw new QuotaExceededError(
    `Monthly upload limit (${subscription.monthlyQuota}) reached. Resets ${getNextMonthStart()}.`
  )
}
```

### 3.3 Optional Security Layer: Virus Scanning

**When to Enable**:
- Production environment
- Enterprise deployments
- Users uploading potentially untrusted files

**Implementation Options**:

**Option 1: ClamAV (Self-Hosted)**
```typescript
import NodeClam from 'clamscan'

const clamscan = await new NodeClam().init({
  clamdscan: {
    host: 'localhost',
    port: 3310
  }
})

const { isInfected, viruses } = await clamscan.scanFile(filePath)
if (isInfected) {
  throw new SecurityError(`File infected: ${viruses.join(', ')}`)
}
```

**Option 2: VirusTotal API (Cloud-Based)**
```typescript
import axios from 'axios'

const formData = new FormData()
formData.append('file', fileBuffer)

const response = await axios.post(
  'https://www.virustotal.com/api/v3/files',
  formData,
  { headers: { 'x-apikey': process.env.VIRUSTOTAL_API_KEY } }
)

const analysisId = response.data.data.id
// Poll for results
const results = await pollVirusTotal(analysisId)
```

**Decision**: Implement ClamAV in production, skip for Phase 2 dev/staging.

---

## 4. Database Interactions

### 4.1 Resume Model (from schema.prisma)

```prisma
model Resume {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // File information
  fileName  String
  fileSize  Int      // bytes
  fileType  String   // "pdf" or "docx"
  
  // Original file reference
  originalFile OriginalFile?
  
  // Content extracted from original (after parsing)
  extractedText String?
  extractedLayout String?  // JSON: Layout metadata
  
  // Resume versions
  versions  ResumeVersion[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([userId])
  @@map("resumes")
}

model OriginalFile {
  id        String   @id @default(cuid())
  resumeId  String   @unique
  resume    Resume   @relation(fields: [resumeId], references: [id], onDelete: Cascade)
  
  // File location
  s3Key     String   // Will be local path in Phase 2
  s3Url     String   // Will be local path in Phase 2
  
  uploadedAt DateTime @default(now())
  
  @@map("original_files")
}
```

### 4.2 Upload Flow (Database)

```
User submits file
    ↓
[Create Resume record]
  INSERT INTO resumes (
    userId, fileName, fileSize, fileType, createdAt, updatedAt
  ) VALUES (...)
  → resumeId = "cmq3ka1e7000..."
    ↓
[Store file to disk]
  /storage/users/{userId}/originals/{resumeId}.{ext}
    ↓
[Create OriginalFile record]
  INSERT INTO original_files (
    resumeId, s3Key, s3Url, uploadedAt
  ) VALUES (
    "cmq3ka1e7000...",
    "/storage/users/{userId}/originals/{resumeId}.pdf",
    "file:///storage/users/{userId}/originals/{resumeId}.pdf",
    NOW()
  )
    ↓
[Return resumeId to client]
  Queue parser job with resumeId
  Return 201 with status="pending"
```

### 4.3 Quota Tracking

The `Subscription` model tracks monthly quotas:

```prisma
model Subscription {
  id        String   @id @default(cuid())
  userId    String   @unique
  plan      String   @default("free")
  monthlyQuota Int   @default(5)     // Free tier: 5 uploads/month
  usedQuota Int      @default(0)
  expiresAt DateTime?
}
```

**Monthly Reset Logic**:
```typescript
function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function getMonthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1)
}

// Count uploads in current month
const monthStart = getMonthStart(new Date())
const uploadCount = await prisma.resume.count({
  where: {
    userId,
    createdAt: { gte: monthStart }
  }
})

const remainingQuota = subscription.monthlyQuota - uploadCount
```

---

## 5. Security Implementation

### 5.1 Authentication & Authorization

**All endpoints require**:
```typescript
// Middleware checks
1. Bearer token present
2. Token signature valid
3. Token not expired
4. User account active
5. User owns the resume (for GET/DELETE operations)
```

**Example**:
```typescript
@Post('/upload')
@UseGuards(AuthenticationGuard)
async uploadResume(
  @Req() req: AuthenticatedRequest,  // User must be logged in
  @UploadedFile() file: Express.Multer.File
) {
  // req.user.id is guaranteed to exist and be authentic
  const resumeId = await this.resumeService.upload(req.user.id, file)
  return sendSuccess(res, resumeId, 'Resume uploaded successfully', 201)
}
```

### 5.2 Input Sanitization

**Filename Sanitization**:
```typescript
// Prevents path traversal attacks
const unsafe = '../../etc/passwd'
const safe = sanitizeFilename(unsafe)  // 'etcpasswd'
```

**SQL Injection Prevention**:
```typescript
// Prisma parameterized queries prevent SQL injection
// NOT vulnerable:
await prisma.resume.create({
  data: { userId, fileName }  // Parameters escaped automatically
})

// WOULD be vulnerable if using raw SQL:
// await db.query(`INSERT INTO resumes VALUES ('${userId}', '${fileName}')`)
```

### 5.3 File Type Validation

**Triple Defense**:
1. Client-side: MIME type check (UX, not security)
2. Server MIME header: Prevent plaintext uploads (defense layer 1)
3. Magic bytes: Verify actual file type (defense layer 2)

### 5.4 Storage Isolation

**Directory Structure Prevents Cross-User Access**:
```
/storage/
├── users/
│   ├── user_123/
│   │   └── originals/
│   │       └── resume_1.pdf
│   └── user_456/
│       └── originals/
│           └── resume_1.pdf
```

**Permission Model**:
- User can only access `/storage/users/{their-id}/`
- Backend enforces `userId` check on all file operations
- No symlinks allowed (prevents breakout)

### 5.5 Audit Logging

```typescript
// Log every upload/delete
await prisma.auditLog.create({
  data: {
    userId,
    action: 'RESUME_UPLOAD',
    status: 'SUCCESS',
    resource: 'resume',
    resourceId: resumeId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  }
})
```

---

## 6. Error Handling

### 6.1 Validation Error Responses

**400 Bad Request** (Validation Failed):
```json
{
  "success": false,
  "message": "File validation failed",
  "errors": [
    {
      "field": "file",
      "code": "FILE_SIZE_EXCEEDED",
      "message": "File size (12.5 MB) exceeds maximum (10 MB)"
    }
  ]
}
```

### 6.2 Authentication Error Responses

**401 Unauthorized** (Missing/Invalid Token):
```json
{
  "success": false,
  "message": "Authentication required",
  "errors": [
    {
      "field": "authorization",
      "code": "MISSING_TOKEN",
      "message": "Authorization header required"
    }
  ]
}
```

### 6.3 Quota Error Response

**429 Too Many Requests** (Quota Exceeded):
```json
{
  "success": false,
  "message": "Monthly upload limit reached",
  "data": {
    "quotaUsed": 5,
    "quotaLimit": 5,
    "quotaReset": "2026-07-07T00:00:00.000Z",
    "upgradeUrl": "/pricing"
  }
}
```

### 6.4 Server Error Responses

**500 Internal Server Error** (Unexpected):
```json
{
  "success": false,
  "message": "An unexpected error occurred",
  "data": {
    "errorId": "err_abc123xyz",
    "timestamp": "2026-06-07T10:30:45.123Z"
  }
}
```

---

## 7. File Lifecycle & Retention

### 7.1 Timeline

```
Day 0: File Uploaded
├─ Status: ACTIVE
├─ Access: User can view, parse, optimize
└─ Storage: /storage/users/{userId}/originals/

Day 30: Soft Delete (if user deletes)
├─ Status: DELETED_SOFT
├─ Access: Hidden from UI, not accessible via API
├─ Storage: Moved to /storage/deleted/{timestamp}/
└─ Recovery: Available

Day 90: Hard Delete
├─ Status: DELETED_HARD
├─ Access: Completely removed
└─ Storage: File purged from filesystem
```

**Soft Delete SQL**:
```typescript
await prisma.resume.update({
  where: { id: resumeId },
  data: {
    deletedAt: new Date(),
    isDeleted: true
  }
})

// File moved to cold storage
moveFileToDeletedFolder(userId, resumeId)
```

**Hard Delete Cleanup Job** (Runs daily):
```typescript
// Find soft-deleted files > 90 days old
const hardDeleteThreshold = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

const filesToDelete = await prisma.resume.findMany({
  where: {
    isDeleted: true,
    deletedAt: { lte: hardDeleteThreshold }
  }
})

for (const file of filesToDelete) {
  await deleteFileFromDisk(file)
  await prisma.resume.delete({ where: { id: file.id } })
  logger.info(`Hard-deleted resume ${file.id}`)
}
```

---

## 8. Performance & Scalability

### 8.1 Upload Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Small file (< 1 MB) | < 500 ms | Single system memory |
| Medium file (1-5 MB) | < 1000 ms | Stream buffering |
| Large file (5-10 MB) | < 2000 ms | Disk I/O bound |
| P95 latency | < 3000 ms | 95th percentile |
| Success rate | > 99.9% | Across 1000+ uploads |

### 8.2 Optimization Strategies

**Streaming Upload**:
```typescript
// Instead of loading entire file in memory
const buffer = await file.buffer  // Bad: loads 10MB into RAM

// Use streams
file.stream()
  .pipe(fs.createWriteStream(filepath))
  .on('finish', () => { ... })
  .on('error', (err) => { ... })
```

**Parallel Validation**:
```typescript
// Run validations in parallel
await Promise.all([
  validateSize(file),
  validateMimeType(file),
  validateMagicBytes(file),
  validateQuota(userId)
])
```

**Async Parsing**:
```typescript
// Don't wait for parsing to complete
res.status(201).json({
  resumeId,
  parseStatus: 'pending'
})

// Queue parsing job separately
await uploadQueue.enqueue({
  resumeId,
  userId,
  filePath
})
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

```typescript
describe('FileValidator', () => {
  it('should reject files > 10 MB', () => {
    const largeFile = createMockFile({ size: 11 * 1024 * 1024 })
    expect(() => validateSize(largeFile)).toThrow('FILE_SIZE_EXCEEDED')
  })

  it('should reject non-PDF/DOCX MIME types', () => {
    const textFile = createMockFile({ mimeType: 'text/plain' })
    expect(() => validateMime(textFile)).toThrow('UNSUPPORTED_MIME_TYPE')
  })

  it('should sanitize malicious filenames', () => {
    const unsafe = '../../evil.pdf'
    const safe = sanitizeFilename(unsafe)
    expect(safe).toBe('evil.pdf')
  })
})
```

### 9.2 Integration Tests

```typescript
describe('POST /api/resumes/upload', () => {
  it('should upload valid PDF and create Resume record', async () => {
    const response = await request(app)
      .post('/api/resumes/upload')
      .set('Authorization', `Bearer ${validToken}`)
      .attach('file', pdfFilePath)
    
    expect(response.status).toBe(201)
    expect(response.body.data.resumeId).toBeDefined()
    
    // Verify database record
    const resume = await prisma.resume.findUnique({
      where: { id: response.body.data.resumeId }
    })
    expect(resume.fileType).toBe('pdf')
  })
})
```

### 9.3 Edge Case Tests

- Empty files
- Corrupted PDF headers
- Extremely large files (100 MB+)
- Rapid successive uploads
- Network interruption mid-upload
- Special characters in filename
- Non-UTF8 encoded content

---

## 10. Migration Path to Cloud Storage

### 10.1 Migration Plan (Phase 3)

**Step 1: Adapter Pattern Implementation** (Week 1)
```typescript
// Create abstract interface
interface IFileStorage {
  upload(userId: string, file: Buffer, key: string): Promise<void>
  download(userId: string, key: string): Promise<Buffer>
  delete(userId: string, key: string): Promise<void>
}

// Update code to use interface
const storage: IFileStorage = ...
await storage.upload(...)
```

**Step 2: S3 Adapter Implementation** (Week 2)
```typescript
class S3FileStorage implements IFileStorage {
  async upload(userId: string, file: Buffer, key: string): Promise<void> {
    await this.s3.putObject({
      Bucket: this.bucket,
      Key: `users/${userId}/${key}`,
      Body: file
    }).promise()
  }
}
```

**Step 3: Dual-Write Migration** (Week 3-4)
```typescript
// Write to both storage systems simultaneously
async upload(...) {
  const promises = []
  promises.push(localStorage.upload(...))
  promises.push(s3Storage.upload(...))
  await Promise.all(promises)
  
  // Read from local (faster)
  return await localStorage.download(...)
}
```

**Step 4: Gradual Cutover** (Week 5+)
```typescript
// Gradually switch read operations to S3
const useS3 = Math.random() < migrationPercentage  // Start at 5%, increase daily
const storage = useS3 ? s3Storage : localStorage
```

**Step 5: Cleanup** (After migration complete)
```typescript
// Delete local copies once S3 is proven stable
await localStorage.delete(...)
```

### 10.2 Rollback Plan

If S3 migration fails:
```typescript
const storage = useS3 && isHealthy(s3Storage)
  ? s3Storage
  : localStorage  // Automatic fallback
```

---

## 11. Future Enhancements

### Phase 3 Features
- **Virus Scanning**: ClamAV integration for malware detection
- **Cloud Migration**: AWS S3 with CloudFront CDN
- **Compression**: Automatic PDF/DOCX compression before storage
- **Version Control**: Multiple file versions with diff view
- **Drag-and-Drop**: Enhanced UI with progress bars
- **Batch Upload**: Multiple files at once

### Phase 4+ Features
- **OCR for Images**: Support JPG/PNG resumes with image OCR
- **Web-based Editor**: In-browser resume editing
- **Collaborative Uploads**: Share draft with recruiter/mentor
- **Template Library**: Auto-convert to ATS-friendly template if desired
- **International Support**: Support for non-Latin alphabets
- **Accessibility**: Screen reader optimization for uploaded content

---

## 12. Implementation Checklist

- [ ] Create `FileStorage` abstract interface
- [ ] Implement `LocalFileStorage` adapter
- [ ] Create `/storage/users/{userId}/originals/` directory structure
- [ ] Implement file validation (size, MIME, magic bytes)
- [ ] Implement filename sanitization
- [ ] Create `POST /api/resumes/upload` endpoint
- [ ] Add quota checking and enforcement
- [ ] Implement `GET /api/resumes` endpoint
- [ ] Implement `GET /api/resumes/:id/upload-status` endpoint
- [ ] Implement `DELETE /api/resumes/:id` endpoint
- [ ] Create audit logging for uploads/deletes
- [ ] Write unit tests (validation, sanitization)
- [ ] Write integration tests (upload, list, delete)
- [ ] Write edge case tests (malicious files, large files)
- [ ] Create Multer configuration for Express
- [ ] Implement error handling and messages
- [ ] Add progress tracking endpoint
- [ ] Create cleanup job for soft-deleted files
- [ ] Document API in Swagger/OpenAPI
- [ ] Update PROJECT_CONTEXT.md with implementation details

---

## 13. Success Criteria (Phase 2)

### Functional Requirements
✅ Users can upload PDF and DOCX resumes  
✅ Files stored securely in user-isolated directories  
✅ Upload quota enforced (free tier: 5/month)  
✅ Comprehensive validation (size, MIME, magic bytes)  
✅ Async parsing queued but doesn't block response  
✅ 100% test coverage for validation logic  
✅ All uploads audited with IP/user-agent  
✅ Soft delete after 30 days, hard delete after 90 days  

### Security Requirements
✅ Authentication required for all endpoints  
✅ Users can only access own files  
✅ Filename sanitization prevents path traversal  
✅ MIME type validation prevents malicious uploads  
✅ Magic bytes verification detects fake files  
✅ Quota prevents abuse/DoS  
✅ Audit logging for compliance  

### Performance Requirements
✅ Files < 10 MB upload in < 2 seconds  
✅ File list endpoint returns < 100 ms  
✅ Parsing doesn't block upload response  
✅ Database queries indexed for performance  

### Documentation Requirements
✅ FILE_UPLOAD_DESIGN.md completed  
✅ API endpoints documented with examples  
✅ Database interactions explained  
✅ Storage migration path clearly defined  
✅ Integration tests demonstrate correctness  

---

**Next Phase**: Implement File Upload endpoints, then move to Resume Parser design and implementation.
