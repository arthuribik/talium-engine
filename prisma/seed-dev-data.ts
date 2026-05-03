/**
 * Dev-only seed: professionals for scout-search + localStorage scout list snippet.
 * Scout *lists* (tab=scouted&scout=…) live in the browser; this prints `localStorage.setItem` for the target org.
 *
 * Usage: `cd api-engine && npm run db:seed:dev`
 *
 * Env:
 *   SEED_TARGET_ORG_EMAIL — organisation login email (default: salam.hill@business.com)
 *   SEED_PROF_PASSWORD — password for seeded professional users (default: SeedProf@123)
 *   SEED_DEV_SCOUT_ID — scout list id for ?scout= (default: full UUID below)
 *   SEED_SCOUT_JOB_TITLE — fuzzy job title to match seeded roles (default: Hala madrid)
 */
import {
  PrismaClient,
  UserStatus,
  UserType,
  VerificationStatus,
  EmploymentType,
  WorkMode,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TARGET_ORG_EMAIL =
  process.env.SEED_TARGET_ORG_EMAIL || 'salam.hill@business.com';
const PROF_PASSWORD = process.env.SEED_PROF_PASSWORD || 'SeedProf@123';
const SCOUT_LIST_ID =
  process.env.SEED_DEV_SCOUT_ID || '87e83b8a-0ec1-49c7-9d07-637475336d6e';
const SCOUT_JOB_TITLE = (process.env.SEED_SCOUT_JOB_TITLE || 'Hala madrid').trim();

/** Fuzzy scout title splits on words; every word must appear in role (see ViewProfessionals). */
function professionForSeed(suffix: string): string {
  return `${SCOUT_JOB_TITLE} ${suffix}`.trim();
}

/** `profession` column + work-experience role (API scout-search uses the latest role). */
const SEED_PROFESSIONALS: Array<{
  email: string;
  firstName: string;
  lastName: string;
  country: string;
  nationality: string;
  profession: string;
  city: string;
}> = [
  { email: 'scouted-seed-01@taldium.local', firstName: 'Amaka', lastName: 'Nwosu', country: 'Nigeria', nationality: 'Nigerian', profession: professionForSeed('Coordinator'), city: 'Lagos' },
  { email: 'scouted-seed-02@taldium.local', firstName: 'Ibrahim', lastName: 'Danladi', country: 'Nigeria', nationality: 'Nigerian', profession: professionForSeed('Lead I'), city: 'Abuja' },
  { email: 'scouted-seed-03@taldium.local', firstName: 'Yewande', lastName: 'Adeyemi', country: 'Nigeria', nationality: 'Nigerian', profession: professionForSeed('Lead II'), city: 'Port Harcourt' },
  { email: 'scouted-seed-04@taldium.local', firstName: 'Kemi', lastName: 'Ogunleye', country: 'Nigeria', nationality: 'Nigerian', profession: professionForSeed('Analyst'), city: 'Ibadan' },
  { email: 'scouted-seed-05@taldium.local', firstName: 'Tunde', lastName: 'Bakare', country: 'Nigeria', nationality: 'Nigerian', profession: professionForSeed('Specialist'), city: 'Kano' },
  { email: 'scouted-seed-06@taldium.local', firstName: 'Ngozi', lastName: 'Eze', country: 'Nigeria', nationality: 'Nigerian', profession: professionForSeed('Associate'), city: 'Enugu' },
  { email: 'scouted-seed-07@taldium.local', firstName: 'Femi', lastName: 'Ajayi', country: 'Nigeria', nationality: 'Nigerian', profession: professionForSeed('Consultant'), city: 'Lagos' },
  { email: 'scouted-seed-08@taldium.local', firstName: 'Chioma', lastName: 'Okoro', country: 'Nigeria', nationality: 'Nigerian', profession: professionForSeed('Manager'), city: 'Benin City' },
  { email: 'scouted-seed-09@taldium.local', firstName: 'Emeka', lastName: 'Obi', country: 'Nigeria', nationality: 'Nigerian', profession: professionForSeed('Director'), city: 'Owerri' },
  { email: 'scouted-seed-10@taldium.local', firstName: 'Halima', lastName: 'Yusuf', country: 'Nigeria', nationality: 'Nigerian', profession: professionForSeed('Principal'), city: 'Kaduna' },
];

async function resolveOrganisationIdOrThrow(email: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { organisation: true },
  });
  if (!user) {
    throw new Error(
      `No user found for ${email}. Create the organisation account first, then re-run this seed.`,
    );
  }
  if (user.userType !== UserType.ORGANISATION) {
    throw new Error(`User ${email} is not an ORGANISATION account (type=${user.userType}).`);
  }
  if (!user.organisation) {
    throw new Error(`User ${email} has no organisation profile row.`);
  }
  return user.organisation.id;
}

async function ensureProfessional(row: (typeof SEED_PROFESSIONALS)[0]): Promise<void> {
  const hashed = await bcrypt.hash(PROF_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: row.email },
    update: {
      status: UserStatus.ACTIVE,
      emailVerified: true,
      firstLogin: false,
    },
    create: {
      email: row.email,
      password: hashed,
      firstName: row.firstName,
      lastName: row.lastName,
      status: UserStatus.ACTIVE,
      userType: UserType.PROFESSIONAL,
      emailVerified: true,
      firstLogin: false,
    },
  });

  const professional = await prisma.professional.upsert({
    where: { userId: user.id },
    update: {
      profession: row.profession,
      country: row.country,
      nationality: row.nationality,
      identityStatus: VerificationStatus.verified,
      setupCompleted: true,
      profileCompleteness: 85,
    },
    create: {
      userId: user.id,
      profession: row.profession,
      country: row.country,
      nationality: row.nationality,
      identityStatus: VerificationStatus.verified,
      setupCompleted: true,
      profileCompleteness: 85,
    },
  });

  const wx = await prisma.workExperience.findFirst({
    where: { professionalId: professional.id },
    orderBy: { createdAt: 'desc' },
  });
  const wxPayload = {
    organisationName: 'Seeded Employer Ltd',
    industry: 'Technology',
    location: { city: row.city, country: row.country },
    role: row.profession,
    employmentType: EmploymentType.full_time,
    workMode: WorkMode.global_remote,
    startDate: '2019-01-01',
    endDate: null,
    currentlyWorking: true,
    jobDescription: 'Seeded role for scout list testing.',
    responsibilities: ['Delivery', 'Collaboration'],
    achievements: ['Shipped milestones'],
    verificationStatus: VerificationStatus.verified,
  };
  if (wx) {
    await prisma.workExperience.update({
      where: { id: wx.id },
      data: wxPayload,
    });
  } else {
    await prisma.workExperience.create({
      data: {
        professionalId: professional.id,
        ...wxPayload,
      },
    });
  }
}

function printScoutLocalStorageSnippet(organisationId: string, peopleFound: number) {
  const criteria = {
    jobTitle: SCOUT_JOB_TITLE,
    searchType: 'fuzzy' as const,
    location: 'Global',
    domicile: '',
    workMode: 'global_remote',
    employmentType: '',
    currency: 'EUR',
    salaryMin: '2000',
    salaryMax: '30000',
    salaryPeriod: 'annually' as const,
    benefits: [] as string[],
    description: '',
  };

  const entry = {
    id: SCOUT_LIST_ID,
    name: SCOUT_JOB_TITLE || 'Scout list',
    createdAt: Date.now(),
    peopleFound,
    criteria,
  };

  const payload = JSON.stringify([entry]);

  console.log('\n--- Scout list (localStorage) ---');
  console.log(`Log in as ${TARGET_ORG_EMAIL}, then run in the browser console:\n`);
  console.log(
    `localStorage.setItem('taldium_org_scout_lists:${organisationId}', ${JSON.stringify(payload)});`,
  );
  console.log('\nThen open:');
  console.log(
    `  /organization/professionals?tab=scouted&scout=${encodeURIComponent(SCOUT_LIST_ID)}`,
  );
  console.log(
    `\nScout criteria: fuzzy "${SCOUT_JOB_TITLE}" + Global + global_remote + EUR 2k–30k (matches all ${peopleFound} seeded roles). Reload after setItem.\n`,
  );
}

async function main() {
  console.log('🌱 Scout dev seed (10 professionals + scout list snippet)...');
  const organisationId = await resolveOrganisationIdOrThrow(TARGET_ORG_EMAIL);
  console.log(`   Target organisation: ${TARGET_ORG_EMAIL}`);
  console.log(`   organisationId: ${organisationId}`);

  for (const row of SEED_PROFESSIONALS) {
    await ensureProfessional(row);
  }

  console.log(`✅ Upserted ${SEED_PROFESSIONALS.length} professionals (password for each: ${PROF_PASSWORD}).`);
  console.log('   `profession` column and latest work-experience role are aligned.');
  printScoutLocalStorageSnippet(organisationId, SEED_PROFESSIONALS.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
