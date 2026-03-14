-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "distributionChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "qualifyingQuestions" JSONB,
ADD COLUMN     "requiredApplicantData" TEXT[] DEFAULT ARRAY[]::TEXT[];
