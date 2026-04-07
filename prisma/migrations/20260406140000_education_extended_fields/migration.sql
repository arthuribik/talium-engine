-- AlterTable
ALTER TABLE "educations" ADD COLUMN     "schoolType" TEXT,
ADD COLUMN     "pendingLoanAmount" DOUBLE PRECISION,
ADD COLUMN     "loanCurrency" TEXT,
ADD COLUMN     "activitiesSocieties" TEXT,
ADD COLUMN     "associatedSkills" TEXT,
ADD COLUMN     "supportingMediaUrl" TEXT;
