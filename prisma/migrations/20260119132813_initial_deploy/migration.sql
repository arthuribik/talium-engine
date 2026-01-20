-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'ACTIVE', 'SUSPENDED', 'PENDING_INVITATION');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('ADMIN', 'ORGANISATION', 'PROFESSIONAL');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('super_admin', 'admin', 'support', 'auditor');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('org_owner', 'org_admin', 'org_recruiter', 'org_member');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('pending', 'under_review', 'verified', 'rejected', 'not_activated');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('draft', 'published', 'paused', 'closed');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('full_time', 'part_time', 'contract', 'internship');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('remote', 'hybrid', 'on_site', 'global_remote');

-- CreateEnum
CREATE TYPE "IDType" AS ENUM ('national_id', 'passport', 'drivers_license', 'voters_card');

-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('high_school', 'associate', 'bachelor', 'master', 'doctorate', 'certificate', 'diploma');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "userType" "UserType" NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifyToken" TEXT,
    "emailVerifyExpiry" TIMESTAMP(3),
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "firstLogin" BOOLEAN NOT NULL DEFAULT true,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'admin',
    "invitationToken" TEXT,
    "invitationExpiresAt" TIMESTAMP(3),
    "invitationSentAt" TIMESTAMP(3),

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "isRegistered" BOOLEAN NOT NULL DEFAULT false,
    "incorporationStatus" TEXT,
    "countryOfIncorporation" TEXT,
    "incorporationNumber" TEXT,
    "yearOfCommencement" INTEGER,
    "industry" TEXT,
    "companySize" TEXT,
    "website" TEXT,
    "description" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'not_activated',
    "setupCompleted" BOOLEAN NOT NULL DEFAULT false,
    "profileCompleteness" INTEGER NOT NULL DEFAULT 0,
    "address" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation_members" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'org_member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisation_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation_verifications" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'under_review',
    "documents" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estimatedCompletionDate" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisation_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professionals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "country" TEXT,
    "nationality" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "identityVerified" BOOLEAN NOT NULL DEFAULT false,
    "identityStatus" "VerificationStatus" NOT NULL DEFAULT 'not_activated',
    "setupCompleted" BOOLEAN NOT NULL DEFAULT false,
    "profileCompleteness" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_verifications" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "nationality" TEXT NOT NULL,
    "idType" "IDType" NOT NULL,
    "idNumber" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "livenessCheckData" JSONB,
    "verifiedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educations" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "levelOfEducation" "EducationLevel" NOT NULL,
    "institutionName" TEXT NOT NULL,
    "degreeType" TEXT,
    "fieldOfStudy" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "currentlyAttending" BOOLEAN NOT NULL DEFAULT false,
    "grade" TEXT,
    "costOfEducation" DOUBLE PRECISION,
    "currency" TEXT,
    "country" TEXT NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "verificationDocuments" JSONB,
    "verifiedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "educations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_experiences" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "organisationName" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "location" JSONB NOT NULL,
    "role" TEXT NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "workMode" "WorkMode" NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "currentlyWorking" BOOLEAN NOT NULL DEFAULT false,
    "responsibilities" TEXT[],
    "achievements" TEXT[],
    "paymentMode" TEXT,
    "currency" TEXT,
    "salaryRange" JSONB,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "verificationContact" JSONB,
    "verifiedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "workMode" "WorkMode" NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "experienceYears" INTEGER,
    "jobLevel" TEXT,
    "pay" JSONB NOT NULL,
    "closingDate" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "requirements" TEXT[],
    "applyCTA" JSONB,
    "status" "JobStatus" NOT NULL DEFAULT 'draft',
    "views" INTEGER NOT NULL DEFAULT 0,
    "postedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_applications" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "applicationData" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admins_userId_key" ON "admins"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "admins_invitationToken_key" ON "admins"("invitationToken");

-- CreateIndex
CREATE UNIQUE INDEX "organisations_userId_key" ON "organisations"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_members_organisationId_userId_key" ON "organisation_members"("organisationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "professionals_userId_key" ON "professionals"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "identity_verifications_professionalId_key" ON "identity_verifications"("professionalId");

-- CreateIndex
CREATE UNIQUE INDEX "job_applications_jobId_professionalId_key" ON "job_applications"("jobId", "professionalId");

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_members" ADD CONSTRAINT "organisation_members_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_verifications" ADD CONSTRAINT "organisation_verifications_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educations" ADD CONSTRAINT "educations_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_experiences" ADD CONSTRAINT "work_experiences_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
