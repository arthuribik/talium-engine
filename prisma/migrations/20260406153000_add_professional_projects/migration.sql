-- CreateTable
CREATE TABLE "professional_projects" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "projectLink" TEXT,
    "mediaUrl" TEXT,
    "teamMembers" JSONB,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "verifiedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professional_projects_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "professional_projects" ADD CONSTRAINT "professional_projects_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
