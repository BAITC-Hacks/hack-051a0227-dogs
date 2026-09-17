-- CreateTable
CREATE TABLE "ScoringRun" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "materialVersion" TEXT NOT NULL,
    "criteriaVersion" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "scenarioVersion" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "result" JSONB,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "requestedBy" TEXT NOT NULL,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "errorCode" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ScoringRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringReview" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "rejectedEvidenceIds" TEXT[],
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoringReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringFixture" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "scenarioVersion" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoringFixture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScoringRun_identity_key" ON "ScoringRun"("identity");

-- CreateIndex
CREATE INDEX "ScoringRun_applicationId_createdAt_idx" ON "ScoringRun"("applicationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringReview_requestKey_key" ON "ScoringReview"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringFixture_applicationId_inputHash_key" ON "ScoringFixture"("applicationId", "inputHash");

-- AddForeignKey
ALTER TABLE "ScoringRun" ADD CONSTRAINT "ScoringRun_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringReview" ADD CONSTRAINT "ScoringReview_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScoringRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringReview" ADD CONSTRAINT "ScoringReview_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringFixture" ADD CONSTRAINT "ScoringFixture_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

