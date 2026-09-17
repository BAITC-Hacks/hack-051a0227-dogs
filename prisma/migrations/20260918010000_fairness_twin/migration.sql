-- AlterTable
ALTER TABLE "ScoringRun" ADD COLUMN     "auditId" TEXT,
ADD COLUMN     "context" TEXT NOT NULL DEFAULT 'OFFICIAL',
ADD COLUMN     "variant" TEXT;

-- CreateTable
CREATE TABLE "TwinAudit" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "caseKey" TEXT NOT NULL,
    "caseVersion" TEXT NOT NULL,
    "baseInputHash" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "definitionHash" TEXT NOT NULL,
    "comparison" JSONB,
    "comparisonVersion" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwinAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwinReview" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "viewedVersions" JSONB NOT NULL,
    "requestKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwinReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TwinAudit_requestKey_key" ON "TwinAudit"("requestKey");

-- CreateIndex
CREATE INDEX "TwinAudit_applicationId_createdAt_idx" ON "TwinAudit"("applicationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TwinReview_requestKey_key" ON "TwinReview"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringRun_auditId_variant_key" ON "ScoringRun"("auditId", "variant");

-- AddForeignKey
ALTER TABLE "ScoringRun" ADD CONSTRAINT "ScoringRun_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "TwinAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwinAudit" ADD CONSTRAINT "TwinAudit_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwinReview" ADD CONSTRAINT "TwinReview_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "TwinAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwinReview" ADD CONSTRAINT "TwinReview_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

