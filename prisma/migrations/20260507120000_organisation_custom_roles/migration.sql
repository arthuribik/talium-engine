-- CreateTable
CREATE TABLE "organisation_custom_roles" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisation_custom_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organisation_custom_roles_organisationId_idx" ON "organisation_custom_roles"("organisationId");

-- AddForeignKey
ALTER TABLE "organisation_custom_roles" ADD CONSTRAINT "organisation_custom_roles_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
