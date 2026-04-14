-- Work verification no longer uses HR email / company website JSON
ALTER TABLE "work_experiences" DROP COLUMN IF EXISTS "verificationContact";
