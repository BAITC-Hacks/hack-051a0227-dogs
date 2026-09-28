CREATE TABLE "WorldSave" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "state" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "worldVersion" INTEGER NOT NULL DEFAULT 1,
  "origin" TEXT NOT NULL DEFAULT 'USER',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorldSave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "WorldEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "origin" TEXT NOT NULL DEFAULT 'USER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorldEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorldEvent_userId_eventKey_key" ON "WorldEvent"("userId", "eventKey");
CREATE INDEX "WorldEvent_userId_createdAt_idx" ON "WorldEvent"("userId", "createdAt");
ALTER TABLE "UPointEntry" ALTER COLUMN "completionId" DROP NOT NULL;
ALTER TABLE "UPointEntry" ADD COLUMN "worldEventId" TEXT;
CREATE UNIQUE INDEX "UPointEntry_worldEventId_key" ON "UPointEntry"("worldEventId");
ALTER TABLE "UPointEntry" ADD CONSTRAINT "UPointEntry_worldEventId_fkey" FOREIGN KEY ("worldEventId") REFERENCES "WorldEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UPointEntry" ADD CONSTRAINT "UPointEntry_exactly_one_origin" CHECK (("completionId" IS NOT NULL) <> ("worldEventId" IS NOT NULL));
