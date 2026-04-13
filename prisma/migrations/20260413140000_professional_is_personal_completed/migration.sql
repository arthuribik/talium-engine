-- AlterTable
ALTER TABLE "professionals" ADD COLUMN "isPersonalCompleted" BOOLEAN NOT NULL DEFAULT false;

UPDATE "professionals"
SET "isPersonalCompleted" = true
WHERE "livenessSelfieUrl" IS NOT NULL AND BTRIM("livenessSelfieUrl") <> '';
