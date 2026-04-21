-- Billing catalog + organisation ledger / invoices

CREATE TYPE "BillingEntityType" AS ENUM ('professional', 'organisation');

CREATE TABLE "billing_subscription_plans" (
    "id" TEXT NOT NULL,
    "planSlug" TEXT NOT NULL,
    "entityType" "BillingEntityType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceMonthlyUsd" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "priceAnnualUsd" DECIMAL(12,2),
    "priceMonthlyNgn" INTEGER,
    "priceAnnualNgn" INTEGER,
    "features" JSONB,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_subscription_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_subscription_plans_entityType_planSlug_key" ON "billing_subscription_plans"("entityType", "planSlug");
CREATE INDEX "billing_subscription_plans_entityType_isActive_idx" ON "billing_subscription_plans"("entityType", "isActive");

CREATE TABLE "organisation_billing_transactions" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountNgn" INTEGER NOT NULL DEFAULT 0,
    "ttkDelta" INTEGER,
    "ttkColor" TEXT,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisation_billing_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "organisation_billing_transactions_organisationId_occurredAt_idx" ON "organisation_billing_transactions"("organisationId", "occurredAt");

CREATE TABLE "organisation_invoices" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amountNgn" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "downloadUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisation_invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organisation_invoices_organisationId_invoiceNumber_key" ON "organisation_invoices"("organisationId", "invoiceNumber");
CREATE INDEX "organisation_invoices_organisationId_issuedAt_idx" ON "organisation_invoices"("organisationId", "issuedAt");

ALTER TABLE "organisation_billing_transactions" ADD CONSTRAINT "organisation_billing_transactions_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organisation_invoices" ADD CONSTRAINT "organisation_invoices_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
