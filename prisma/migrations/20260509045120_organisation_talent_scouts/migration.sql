-- CreateTable
CREATE TABLE "organisation_talent_scouts" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisation_talent_scouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation_talent_scout_matches" (
    "id" TEXT NOT NULL,
    "scoutId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisation_talent_scout_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organisation_talent_scouts_organisationId_idx" ON "organisation_talent_scouts"("organisationId");

-- CreateIndex
CREATE INDEX "organisation_talent_scout_matches_scoutId_idx" ON "organisation_talent_scout_matches"("scoutId");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_talent_scout_matches_scoutId_professionalId_key" ON "organisation_talent_scout_matches"("scoutId", "professionalId");

-- AddForeignKey
ALTER TABLE "organisation_talent_scouts" ADD CONSTRAINT "organisation_talent_scouts_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_talent_scout_matches" ADD CONSTRAINT "organisation_talent_scout_matches_scoutId_fkey" FOREIGN KEY ("scoutId") REFERENCES "organisation_talent_scouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_talent_scout_matches" ADD CONSTRAINT "organisation_talent_scout_matches_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
