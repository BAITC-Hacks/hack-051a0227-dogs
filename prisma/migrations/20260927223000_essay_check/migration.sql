ALTER TABLE "Application" ADD COLUMN "essayPreparedEvent" INTEGER NOT NULL DEFAULT 0;
UPDATE "Application" SET "essayPreparedEvent" = "preparationEvent";
CREATE TABLE "EssayCheck" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "applicationVersionId" TEXT NOT NULL,
  "textHash" TEXT NOT NULL,
  "modelVersion" TEXT NOT NULL,
  "identity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "language" TEXT NOT NULL,
  "wordCount" INTEGER NOT NULL,
  "signalScore" DOUBLE PRECISION,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "EssayCheck_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EssayCheck_identity_key" ON "EssayCheck"("identity");
CREATE INDEX "EssayCheck_applicationId_createdAt_idx" ON "EssayCheck"("applicationId", "createdAt");
ALTER TABLE "EssayCheck" ADD CONSTRAINT "EssayCheck_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
