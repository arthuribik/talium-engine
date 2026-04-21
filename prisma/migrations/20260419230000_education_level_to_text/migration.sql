-- Allow new education level taxonomy (string); column was PostgreSQL enum "EducationLevel".
ALTER TABLE "educations" ALTER COLUMN "levelOfEducation" DROP DEFAULT;
ALTER TABLE "educations" ALTER COLUMN "levelOfEducation" TYPE TEXT USING "levelOfEducation"::text;

DROP TYPE IF EXISTS "EducationLevel";
