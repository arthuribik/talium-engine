-- CreateTable
CREATE TABLE "saved_jobs" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saved_jobs_professionalId_jobId_key" ON "saved_jobs"("professionalId", "jobId");

-- AddForeignKey
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
