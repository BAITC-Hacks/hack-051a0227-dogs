CREATE TABLE "WorkflowSession" (
  "id" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "participant" TEXT NOT NULL,
  "technical" BOOLEAN NOT NULL, "requestKey" TEXT NOT NULL,
  "caseKey" TEXT NOT NULL, "caseVersion" TEXT NOT NULL, "family" TEXT NOT NULL, "mode" TEXT NOT NULL,
  "materialVersion" TEXT NOT NULL, "profileVersion" TEXT, "package" JSONB NOT NULL,
  "order" INTEGER NOT NULL, "familiar" BOOLEAN NOT NULL, "familiarityNote" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE', "revision" INTEGER NOT NULL DEFAULT 1,
  "work" JSONB NOT NULL, "events" JSONB NOT NULL, "annotations" JSONB NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pausedAt" TIMESTAMP(3), "pausedMs" INTEGER NOT NULL DEFAULT 0, "completedAt" TIMESTAMP(3),
  CONSTRAINT "WorkflowSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkflowSession_requestKey_key" ON "WorkflowSession"("requestKey");
CREATE INDEX "WorkflowSession_ownerId_startedAt_idx" ON "WorkflowSession"("ownerId", "startedAt");
ALTER TABLE "WorkflowSession" ADD CONSTRAINT "WorkflowSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
