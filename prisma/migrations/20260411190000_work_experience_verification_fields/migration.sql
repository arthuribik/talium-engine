-- Work experience: parity with education verification (method, work email, supporting doc URL)
ALTER TABLE "work_experiences" ADD COLUMN "verificationMethod" TEXT;
ALTER TABLE "work_experiences" ADD COLUMN "workVerificationEmail" TEXT;
ALTER TABLE "work_experiences" ADD COLUMN "supportingMediaUrl" TEXT;
