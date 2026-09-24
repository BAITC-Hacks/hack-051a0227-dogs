ALTER TABLE "User" ADD COLUMN "avatarRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "avatarPhoto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "avatarCharacter" TEXT;
CREATE TABLE "UserAvatar" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "small" BYTEA NOT NULL,
  "display" BYTEA NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
-- Explicit assignment to fictional seeded records, never inferred from a person's name.
UPDATE "User" u SET "avatarCharacter" = v.character
FROM (VALUES
('aigerim@candidate.local','1'), ('timur@candidate.local','2'),
('sofia@candidate.local','3'), ('alikhan@candidate.local','4'),
('madina@candidate.local','5'), ('daniil@candidate.local','6'),
('aruzhan@candidate.local','7'), ('nurislam@candidate.local','8'),
('zhanel@candidate.local','9'), ('emir@candidate.local','10'),
('alina@candidate.local','11'), ('ruslan@candidate.local','12')
) AS v(email, character)
WHERE u.email = v.email AND u.origin = 'SEED' AND u."avatarCharacter" IS NULL;
