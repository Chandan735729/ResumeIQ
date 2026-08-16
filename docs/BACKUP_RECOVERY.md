# ResumeIQ — Backup & Recovery Runbook

This document defines disaster recovery, database snapshot procedures, file storage backups, and restoration verification for ResumeIQ.

---

## 1. Backup Strategy

### 1.1 PostgreSQL Database Snapshots
- **Frequency**: Daily full backup at 02:00 UTC + continuous Write-Ahead Log (WAL) archiving for Point-in-Time Recovery (PITR).
- **Tooling**: `pg_dump` for logical backups / AWS RDS Automated Backups / Google Cloud SQL automated snapshots.
- **Retention**: 30 days retention policy for daily snapshots; 7 days PITR window.

#### Automated Dump Command:
```bash
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME -F c -b -v -f /backups/resumeiq_$(date +%Y%m%d_%H%M%S).dump
```

### 1.2 Storage Files (Resumes & Generated Artifacts)
- **Local Storage**: `rsync` or filesystem volume snapshots mirroring `/app/storage/users` to durable cold storage.
- **Object Storage (S3 / GCS)**: S3 Cross-Region Replication (CRR) and Versioning enabled on `resumeiq-documents-*` bucket with 90-day Glacier lifecycle transitions.

---

## 2. Recovery Procedure

### 2.1 Database Restore Procedure
1. Stop backend services to avoid concurrent writes:
   ```bash
   docker compose stop backend
   ```
2. Create fresh target database:
   ```bash
   dropdb -h $DB_HOST -U $DB_USER $DB_NAME
   createdb -h $DB_HOST -U $DB_USER $DB_NAME
   ```
3. Restore from verified snapshot:
   ```bash
   pg_restore -h $DB_HOST -U $DB_USER -d $DB_NAME -v /backups/resumeiq_target.dump
   ```
4. Run Prisma database sanity check:
   ```bash
   npx prisma migrate status
   ```
5. Restart backend services:
   ```bash
   docker compose start backend
   ```

### 2.2 File Storage Restore Procedure
1. Restore `/app/storage/users/` from backup archive.
2. Execute orphan reconciliation check in dry-run mode:
   ```bash
   node dist/scripts/runReconciliation.js --dry-run
   ```
3. Verify integrity of document downloads via smoke test suite.

---

## 3. Disaster Recovery Objectives

- **Recovery Point Objective (RPO)**: < 15 minutes (via WAL streaming).
- **Recovery Time Objective (RTO)**: < 30 minutes from incident declaration to verified health check status.
