-- CreateEnum
CREATE TYPE "OrganisationActivityLogLevel" AS ENUM ('success', 'info', 'warning', 'error');

-- CreateTable
CREATE TABLE "organisation_activity_logs" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorUserId" TEXT,
    "details" TEXT NOT NULL,
    "level" "OrganisationActivityLogLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisation_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organisation_activity_logs_organisationId_createdAt_idx" ON "organisation_activity_logs"("organisationId", "createdAt");

-- AddForeignKey
ALTER TABLE "organisation_activity_logs" ADD CONSTRAINT "organisation_activity_logs_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
