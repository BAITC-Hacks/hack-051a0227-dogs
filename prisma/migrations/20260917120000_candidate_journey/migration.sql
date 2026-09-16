-- AlterTable
ALTER TABLE "ProjectAttempt" ADD COLUMN     "context" TEXT NOT NULL DEFAULT 'WORKSHOP',
ADD COLUMN     "hintsUsed" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "parentVersionId" TEXT,
ADD COLUMN     "startKey" TEXT;

-- AlterTable
ALTER TABLE "AttemptVersion" ADD COLUMN     "basedOnRevision" INTEGER,
ADD COLUMN     "completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hintsUsed" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ruleVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "saveKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAttempt_startKey_key" ON "ProjectAttempt"("startKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAttempt_parentVersionId_context_key" ON "ProjectAttempt"("parentVersionId", "context");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptVersion_attemptId_saveKey_key" ON "AttemptVersion"("attemptId", "saveKey");

-- AddForeignKey
ALTER TABLE "ProjectAttempt" ADD CONSTRAINT "ProjectAttempt_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "AttemptVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

