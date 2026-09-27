ALTER TABLE "Application" ADD COLUMN "scoringPreparedEvent" INTEGER NOT NULL DEFAULT 0;
-- Existing submitted records retain their analyses; no historical bulk processing.
UPDATE "Application" SET "scoringPreparedEvent" = "preparationEvent";
