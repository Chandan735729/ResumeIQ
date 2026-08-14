-- Add explicit parsing lifecycle tracking to resumes
CREATE TYPE "ResumeParseStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "resumes"
ADD COLUMN "parseStatus" "ResumeParseStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "parseStartedAt" TIMESTAMP(3),
ADD COLUMN "parsedAt" TIMESTAMP(3),
ADD COLUMN "parseError" TEXT;

UPDATE "resumes"
SET
  "parseStatus" = CASE
    WHEN "extractedText" IS NOT NULL THEN 'COMPLETED'::"ResumeParseStatus"
    ELSE 'PENDING'::"ResumeParseStatus"
  END,
  "parseStartedAt" = CASE
    WHEN "extractedText" IS NOT NULL THEN "createdAt"
    ELSE NULL
  END,
  "parsedAt" = CASE
    WHEN "extractedText" IS NOT NULL THEN "updatedAt"
    ELSE NULL
  END;
