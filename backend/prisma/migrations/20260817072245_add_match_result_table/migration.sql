-- AlterTable
ALTER TABLE "job_descriptions" ADD COLUMN     "analysisStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "extractedStructure" TEXT,
ALTER COLUMN "requiredSkills" SET DEFAULT '[]';

-- CreateTable
CREATE TABLE "match_results" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "jobDescriptionId" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "skillsScore" DOUBLE PRECISION NOT NULL,
    "technologyScore" DOUBLE PRECISION NOT NULL,
    "keywordsScore" DOUBLE PRECISION NOT NULL,
    "experienceScore" DOUBLE PRECISION NOT NULL,
    "educationScore" DOUBLE PRECISION NOT NULL,
    "certificationScore" DOUBLE PRECISION NOT NULL,
    "responsibilityScore" DOUBLE PRECISION NOT NULL,
    "interpretation" TEXT NOT NULL,
    "matchData" TEXT NOT NULL,
    "scoreData" TEXT NOT NULL,
    "scoringVersion" TEXT NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_results_userId_idx" ON "match_results"("userId");

-- CreateIndex
CREATE INDEX "match_results_resumeId_idx" ON "match_results"("resumeId");

-- CreateIndex
CREATE INDEX "match_results_jobDescriptionId_idx" ON "match_results"("jobDescriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "match_results_resumeId_jobDescriptionId_key" ON "match_results"("resumeId", "jobDescriptionId");

-- CreateIndex
CREATE INDEX "job_descriptions_analysisStatus_idx" ON "job_descriptions"("analysisStatus");

-- AddForeignKey
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_jobDescriptionId_fkey" FOREIGN KEY ("jobDescriptionId") REFERENCES "job_descriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
