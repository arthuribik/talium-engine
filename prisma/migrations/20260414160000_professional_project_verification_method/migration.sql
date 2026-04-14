-- Professional projects: store how the row was verified (e.g. self_declaration)
ALTER TABLE "professional_projects" ADD COLUMN "verificationMethod" TEXT;
