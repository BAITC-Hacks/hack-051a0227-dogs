-- CreateTable
CREATE TABLE "OpenAIConnection" (
    "id" TEXT NOT NULL DEFAULT 'local',
    "ownerId" TEXT,
    "vaultId" TEXT NOT NULL,
    "secretCipher" TEXT,
    "secretStorage" TEXT,
    "keySuffix" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "textModel" TEXT NOT NULL DEFAULT 'gpt-5.4-mini',
    "complexModel" TEXT NOT NULL DEFAULT 'gpt-6-sol',
    "transcriptionModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini-transcribe',
    "speechModel" TEXT NOT NULL DEFAULT 'gpt-4o-mini-tts',
    "audioEnabled" BOOLEAN NOT NULL DEFAULT false,
    "startingMicros" INTEGER NOT NULL DEFAULT 50000000,
    "limitMicros" INTEGER NOT NULL DEFAULT 45000000,
    "reserveMicros" INTEGER NOT NULL DEFAULT 5000000,
    "dailyMicros" INTEGER NOT NULL DEFAULT 5000000,
    "parallelLimit" INTEGER NOT NULL DEFAULT 2,
    "catalog" JSONB,
    "checkedAt" TIMESTAMP(3),
    "checkCode" TEXT,
    "pairingHash" TEXT,
    "pairingActor" TEXT,
    "pairingEmail" TEXT,
    "pairingUntil" TIMESTAMP(3),
    "pairingAttempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenAIConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenAICall" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL DEFAULT 'local',
    "requestKey" TEXT NOT NULL,
    "connectionRevision" INTEGER NOT NULL,
    "task" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "pricingVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "reservedMicros" INTEGER NOT NULL,
    "chargedMicros" INTEGER NOT NULL,
    "costBasis" TEXT NOT NULL DEFAULT 'RESERVATION',
    "usage" JSONB,
    "requestId" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "OpenAICall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpenAIConnection_ownerId_key" ON "OpenAIConnection"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "OpenAIConnection_vaultId_key" ON "OpenAIConnection"("vaultId");

-- CreateIndex
CREATE UNIQUE INDEX "OpenAICall_requestKey_key" ON "OpenAICall"("requestKey");

-- CreateIndex
CREATE INDEX "OpenAICall_createdAt_status_idx" ON "OpenAICall"("createdAt", "status");

-- AddForeignKey
ALTER TABLE "OpenAIConnection" ADD CONSTRAINT "OpenAIConnection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenAICall" ADD CONSTRAINT "OpenAICall_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "OpenAIConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

