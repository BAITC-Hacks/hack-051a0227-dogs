CREATE TABLE "VerificationRequest" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "claim" TEXT NOT NULL,
  "quote" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "requestKey" TEXT NOT NULL,
  "questionMessageId" TEXT,
  "answerMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  "answeredAt" TIMESTAMP(3),
  CONSTRAINT "VerificationRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VerificationRequest_requestKey_key" ON "VerificationRequest"("requestKey");
CREATE UNIQUE INDEX "VerificationRequest_questionMessageId_key" ON "VerificationRequest"("questionMessageId");
CREATE INDEX "VerificationRequest_applicationId_status_createdAt_idx" ON "VerificationRequest"("applicationId","status","createdAt");
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "ReReviewCase" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "basisKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "sourceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "materialVersion" TEXT NOT NULL,
  "openedBy" TEXT NOT NULL,
  "assigneeId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "ReReviewCase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReReviewCase_basisKey_key" ON "ReReviewCase"("basisKey");
CREATE INDEX "ReReviewCase_applicationId_status_createdAt_idx" ON "ReReviewCase"("applicationId","status","createdAt");
ALTER TABLE "ReReviewCase" ADD CONSTRAINT "ReReviewCase_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Material" ADD COLUMN "verificationRequestId" TEXT;
ALTER TABLE "Material" ADD CONSTRAINT "Material_verificationRequestId_fkey" FOREIGN KEY ("verificationRequestId") REFERENCES "VerificationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
