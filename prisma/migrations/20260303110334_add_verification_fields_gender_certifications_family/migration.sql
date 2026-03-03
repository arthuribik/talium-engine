-- AlterTable
ALTER TABLE "professionals" ADD COLUMN     "certifications" JSONB,
ADD COLUMN     "familyInfo" JSONB,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "middleName" TEXT;
