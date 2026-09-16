-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "sha256" TEXT;

-- CreateTable
CREATE TABLE "AudioConsent" (
    "applicationId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "granted" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudioConsent_pkey" PRIMARY KEY ("applicationId")
);

-- CreateTable
CREATE TABLE "AudioConsentEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioJob" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'LIVE',
    "oralId" TEXT NOT NULL,
    "followupId" TEXT NOT NULL,
    "oralHash" TEXT NOT NULL,
    "followupHash" TEXT NOT NULL,
    "taskVersion" TEXT NOT NULL,
    "taskSnapshot" JSONB NOT NULL,
    "instructionVersion" TEXT NOT NULL,
    "consentRevision" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "transcriptionModel" TEXT NOT NULL,
    "textModel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "errorCode" TEXT,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AudioJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioTranscript" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioTranscriptCorrection" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioTranscriptCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioProviderCall" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STARTED',
    "requestId" TEXT,
    "responseId" TEXT,
    "model" TEXT NOT NULL,
    "usage" JSONB,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AudioProviderCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioReview" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "languageRevision" INTEGER NOT NULL,
    "transcriptVersions" JSONB NOT NULL,
    "rejectedIds" TEXT[],
    "note" TEXT NOT NULL,
    "conclusion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AudioReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AudioConsentEvent_applicationId_revision_key" ON "AudioConsentEvent"("applicationId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "AudioJob_identity_key" ON "AudioJob"("identity");

-- CreateIndex
CREATE INDEX "AudioJob_mode_status_nextRunAt_idx" ON "AudioJob"("mode", "status", "nextRunAt");

-- CreateIndex
CREATE INDEX "AudioJob_applicationId_createdAt_idx" ON "AudioJob"("applicationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AudioTranscript_jobId_kind_key" ON "AudioTranscript"("jobId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "AudioTranscriptCorrection_transcriptId_version_key" ON "AudioTranscriptCorrection"("transcriptId", "version");

-- CreateIndex
CREATE INDEX "AudioProviderCall_createdAt_idx" ON "AudioProviderCall"("createdAt");

-- AddForeignKey
ALTER TABLE "AudioConsent" ADD CONSTRAINT "AudioConsent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioConsentEvent" ADD CONSTRAINT "AudioConsentEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioJob" ADD CONSTRAINT "AudioJob_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioJob" ADD CONSTRAINT "AudioJob_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "LanguageCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioTranscript" ADD CONSTRAINT "AudioTranscript_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AudioJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioTranscriptCorrection" ADD CONSTRAINT "AudioTranscriptCorrection_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "AudioTranscript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioProviderCall" ADD CONSTRAINT "AudioProviderCall_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AudioJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioReview" ADD CONSTRAINT "AudioReview_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AudioJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

