ALTER TABLE "OpenAIConnection" ADD COLUMN "deskEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Application" ADD COLUMN "deskConsent" JSONB;
CREATE TABLE "DeskAction" (
 "id" TEXT NOT NULL, "runId" TEXT NOT NULL, "authorId" TEXT NOT NULL,
 "kind" TEXT NOT NULL, "content" JSONB NOT NULL, "inputHash" TEXT NOT NULL,
 "digest" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
 "revokedAt" TIMESTAMP(3), "executedAt" TIMESTAMP(3), "result" JSONB,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "DeskAction_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "DeskAction_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScoringRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DeskAction_runId_authorId_idx" ON "DeskAction"("runId","authorId");
