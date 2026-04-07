-- AlterTable
ALTER TABLE "educations" ADD COLUMN     "institutionIndustry" TEXT,
ADD COLUMN     "costFrequency" TEXT,
ADD COLUMN     "loanRepaymentFrequency" TEXT,
ADD COLUMN     "scholarshipsAndAid" TEXT,
ADD COLUMN     "programDescription" TEXT,
ADD COLUMN     "academicResponsibilities" TEXT,
ADD COLUMN     "academicAchievements" TEXT,
ADD COLUMN     "programProgression" JSONB;
