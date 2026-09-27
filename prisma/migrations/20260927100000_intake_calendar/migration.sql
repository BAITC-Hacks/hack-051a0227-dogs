-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "formField" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "formSection" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "intakeRules" JSONB,
ADD COLUMN     "preparationEvent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "preparationQueued" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "preparationStatus" TEXT NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "extractedText" TEXT,
ADD COLUMN     "previousId" TEXT,
ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "releasedAt" TIMESTAMP(3),
ADD COLUMN     "section" TEXT NOT NULL DEFAULT 'materials',
ADD COLUMN     "uploadKey" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Interview" ADD COLUMN     "attendees" JSONB,
ADD COLUMN     "calendarConnectionId" TEXT,
ADD COLUMN     "calendarEventId" TEXT,
ADD COLUMN     "calendarStatus" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "durationMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "invitationPublishedAt" TIMESTAMP(3),
ADD COLUMN     "meetUrl" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Almaty';

-- AlterTable
ALTER TABLE "VisionMedia" ADD COLUMN     "extractedText" TEXT,
ADD COLUMN     "previousId" TEXT,
ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "releasedAt" TIMESTAMP(3),
ADD COLUMN     "section" TEXT NOT NULL DEFAULT 'materials',
ADD COLUMN     "uploadKey" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "CredentialReview" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "materialVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CredentialReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "calendarName" TEXT NOT NULL,
    "secretId" TEXT NOT NULL,
    "secretCipher" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "secretStorage" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleOAuthState" (
    "hash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "browserHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleOAuthState_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "CalendarOperation" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "connectionRevision" INTEGER NOT NULL,
    "eventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "materialVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CalendarOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionPreview" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionPreview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleConnection_userId_key" ON "GoogleConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarOperation_requestKey_key" ON "CalendarOperation"("requestKey");

-- CreateIndex
CREATE INDEX "CalendarOperation_status_createdAt_idx" ON "CalendarOperation"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Material_uploadKey_key" ON "Material"("uploadKey");

-- CreateIndex
CREATE UNIQUE INDEX "VisionMedia_uploadKey_key" ON "VisionMedia"("uploadKey");

-- AddForeignKey
ALTER TABLE "CredentialReview" ADD CONSTRAINT "CredentialReview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarOperation" ADD CONSTRAINT "CalendarOperation_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

