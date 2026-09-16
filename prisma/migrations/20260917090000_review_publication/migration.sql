-- AlterTable
ALTER TABLE "Episode" ADD COLUMN     "mergeReason" TEXT,
ADD COLUMN     "mergedAt" TIMESTAMP(3),
ADD COLUMN     "mergedBy" TEXT,
ADD COLUMN     "mergedIntoId" TEXT;

-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "messageId" TEXT;

-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN     "materialVersion" TEXT,
ADD COLUMN     "reviewedSnapshot" JSONB;

-- AlterTable
ALTER TABLE "Decision" ADD COLUMN     "materialVersion" TEXT,
ADD COLUMN     "reviewedSnapshot" JSONB;

-- AlterTable
ALTER TABLE "Interview" ADD COLUMN     "completedBy" TEXT,
ADD COLUMN     "materialVersion" TEXT,
ADD COLUMN     "performedAt" TIMESTAMP(3),
ADD COLUMN     "plan" JSONB,
ADD COLUMN     "result" JSONB;

-- AlterTable
ALTER TABLE "InterviewVersion" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'LEGACY',
ADD COLUMN     "materialVersion" TEXT;

-- CreateTable
CREATE TABLE "DomainReview" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "sourceIds" TEXT[],
    "sufficiency" TEXT NOT NULL,
    "consistency" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "gap" TEXT NOT NULL,
    "observation" TEXT NOT NULL,
    "materialVersion" TEXT NOT NULL,
    "reviewedSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceView" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "correctionIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpisodeAnnotation" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "personalAction" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EpisodeAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackPublication" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "observation" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    "nextAction" TEXT NOT NULL,
    "sourceIds" TEXT[],
    "materialVersion" TEXT NOT NULL,
    "reviewedSnapshot" JSONB NOT NULL,
    "previewedBy" TEXT,
    "previewedAt" TIMESTAMP(3),
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DomainReview_applicationId_domain_createdAt_idx" ON "DomainReview"("applicationId", "domain", "createdAt");

-- CreateIndex
CREATE INDEX "SourceView_sourceId_createdAt_idx" ON "SourceView"("sourceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackPublication_messageId_key" ON "FeedbackPublication"("messageId");

-- CreateIndex
CREATE INDEX "FeedbackPublication_applicationId_createdAt_idx" ON "FeedbackPublication"("applicationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Source_messageId_key" ON "Source"("messageId");

-- AddForeignKey
ALTER TABLE "DomainReview" ADD CONSTRAINT "DomainReview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceView" ADD CONSTRAINT "SourceView_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeAnnotation" ADD CONSTRAINT "EpisodeAnnotation_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeAnnotation" ADD CONSTRAINT "EpisodeAnnotation_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackPublication" ADD CONSTRAINT "FeedbackPublication_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackPublication" ADD CONSTRAINT "FeedbackPublication_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

