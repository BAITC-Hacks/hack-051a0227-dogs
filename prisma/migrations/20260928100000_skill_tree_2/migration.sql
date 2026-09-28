CREATE TABLE "LearningAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "contentVersion" INTEGER NOT NULL,
  "response" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "requestKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "LearningAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LearningAttempt_requestKey_key" ON "LearningAttempt"("requestKey");
CREATE INDEX "LearningAttempt_userId_nodeId_createdAt_idx" ON "LearningAttempt"("userId", "nodeId", "createdAt");

CREATE TABLE "LearningCompletion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "contentVersion" INTEGER NOT NULL,
  "attemptId" TEXT NOT NULL,
  "origin" TEXT NOT NULL DEFAULT 'USER',
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearningCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LearningCompletion_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "LearningAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LearningCompletion_userId_nodeId_key" ON "LearningCompletion"("userId", "nodeId");
CREATE UNIQUE INDEX "LearningCompletion_attemptId_key" ON "LearningCompletion"("attemptId");

CREATE TABLE "UPointEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "rewardVersion" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "completionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UPointEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UPointEntry_completionId_fkey" FOREIGN KEY ("completionId") REFERENCES "LearningCompletion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "UPointEntry_idempotencyKey_key" ON "UPointEntry"("idempotencyKey");
CREATE UNIQUE INDEX "UPointEntry_completionId_key" ON "UPointEntry"("completionId");
CREATE INDEX "UPointEntry_userId_createdAt_idx" ON "UPointEntry"("userId", "createdAt");

CREATE TABLE "LearningMedia" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "bytes" BYTEA NOT NULL,
  "size" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearningMedia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LearningMedia_userId_nodeId_idx" ON "LearningMedia"("userId", "nodeId");
