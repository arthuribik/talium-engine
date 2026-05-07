-- CreateTable
CREATE TABLE "organisation_integrations" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisation_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organisation_integrations_organisationId_provider_key" ON "organisation_integrations"("organisationId", "provider");

-- CreateIndex
CREATE INDEX "organisation_integrations_organisationId_idx" ON "organisation_integrations"("organisationId");

-- AddForeignKey
ALTER TABLE "organisation_integrations" ADD CONSTRAINT "organisation_integrations_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
