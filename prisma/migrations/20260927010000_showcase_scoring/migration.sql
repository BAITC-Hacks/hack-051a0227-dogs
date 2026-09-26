ALTER TABLE "ScoringRun"
  ADD COLUMN "showcaseScore" INTEGER,
  ADD COLUMN "showcaseScoreBasis" TEXT,
  ADD COLUMN "showcaseScoreEvidenceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
