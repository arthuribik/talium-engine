-- CreateTable
CREATE TABLE "professional_profile_edit_requests" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "supportingDocumentUrl" TEXT,
    "status" "VerificationStatus" NOT NULL DEFAULT 'under_review',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professional_profile_edit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "professional_profile_edit_requests_professionalId_idx" ON "professional_profile_edit_requests"("professionalId");

-- AddForeignKey
ALTER TABLE "professional_profile_edit_requests" ADD CONSTRAINT "professional_profile_edit_requests_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
