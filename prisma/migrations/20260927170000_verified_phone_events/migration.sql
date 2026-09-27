CREATE TABLE "VerifiedPhoneEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "phoneE164" TEXT,
  "action" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerifiedPhoneEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VerifiedPhoneEvent_userId_createdAt_idx" ON "VerifiedPhoneEvent"("userId", "createdAt");
ALTER TABLE "VerifiedPhoneEvent" ADD CONSTRAINT "VerifiedPhoneEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerifiedPhoneEvent" ADD CONSTRAINT "VerifiedPhoneEvent_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
