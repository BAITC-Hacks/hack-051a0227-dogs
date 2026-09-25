-- Explicit display-only casting for the six existing fictional acceptance stories.
-- Never infer appearance from names or assign characters to arbitrary real accounts.
UPDATE "User" u SET "avatarCharacter" = v.character
FROM (VALUES
  ('mission.leya.20260924@candidate.local', 'QA', '7'),
  ('assessment.unclear.20260917@candidate.local', 'ASSESSMENT_QA', '8'),
  ('final.vera.20260918@candidate.local', 'USER', '9'),
  ('assessment.conflict.20260917@candidate.local', 'ASSESSMENT_QA', '10'),
  ('assessment.rich.20260917@candidate.local', 'ASSESSMENT_QA', '11'),
  ('assessment.language.20260917@candidate.local', 'ASSESSMENT_QA', '12')
) AS v(email, origin, character)
WHERE u.email = v.email AND u.origin = v.origin
  AND u."avatarCharacter" IS NULL AND u."avatarPhoto" = false;
