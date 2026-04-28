-- CreateTable
CREATE TABLE "professional_job_settings" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "jobTitles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "workMode" TEXT,
    "location" TEXT,
    "employmentType" TEXT,
    "allowRecruiters" BOOLEAN NOT NULL DEFAULT true,
    "automationFlows" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professional_job_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "professional_job_settings_professionalId_key" ON "professional_job_settings"("professionalId");

-- AddForeignKey
ALTER TABLE "professional_job_settings" ADD CONSTRAINT "professional_job_settings_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
