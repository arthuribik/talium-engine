-- Self-declared projects are provisional; they should not use verificationStatus = verified
-- until full evidence/admin verification (see professional.service addProject / updateProject).
UPDATE "professional_projects"
SET
  "verificationStatus" = 'pending',
  "verifiedAt" = NULL
WHERE LOWER(COALESCE("verificationMethod", '')) IN ('self_declaration', 'self_declared')
  AND "verificationStatus" = 'verified';
