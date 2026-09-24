ALTER TABLE "DevelopmentStep" ADD COLUMN "treeNode" TEXT,
ADD COLUMN "treeConfig" TEXT,
ADD COLUMN "treeState" JSONB;
CREATE INDEX "DevelopmentStep_userId_treeNode_idx" ON "DevelopmentStep"("userId", "treeNode");
