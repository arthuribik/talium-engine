-- AlterTable
ALTER TABLE "educations" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "educations" ADD COLUMN "verificationMethod" TEXT;
