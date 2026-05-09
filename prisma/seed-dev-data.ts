/**
 * Dev-only seed: professionals + a persisted **OrganisationTalentScout** (matches in DB).
 *
 * Use this to exercise:
 * - **Scouted list** tab: `GET /v1/organisation/professionals/scouts`
 * - **Request** view for one scout: `GET /v1/organisation/professionals/scouts/:id` (matched professionals)
 * - **Response** tab: still empty in the UI until a hire/message “response” API exists; this seed focuses on list + matches.
 *
 * Usage: `cd api-engine && pnpm run db:seed:dev`
 *
 * Env:
 *   SEED_TARGET_ORG_EMAIL — organisation login email (default: salam.hill@business.com)
 *   SEED_ORG_PASSWORD — password when the seed **creates** that org user (default: SeedOrg@123)
 *   SEED_PROF_PASSWORD — password for seeded professional users (default: SeedProf@123)
 *   SEED_SCOUT_JOB_TITLE — fuzzy job title to match seeded roles (default: Hala madrid)
 *   SEED_DEV_SCOUT_NAME — display name for the replacable dev scout row (default below)
 *
 * If no user exists for `SEED_TARGET_ORG_EMAIL`, the seed creates an ORGANISATION user + organisation row
 * so `pnpm db:seed:dev` works on an empty database.
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
const ORG_PASSWORD = process.env.SEED_ORG_PASSWORD || 'SeedOrg@123';
const PROF_PASSWORD = process.env.SEED_PROF_PASSWORD || 'SeedProf@123';
const SCOUT_JOB_TITLE = (process.env.SEED_SCOUT_JOB_TITLE || 'Hala madrid').trim();
const DEV_SCOUT_LIST_NAME =
  process.env.SEED_DEV_SCOUT_NAME || '[dev-seed] Direct scout — multihit';

/** Fuzzy scout title splits on words; every word must appear in role (see organisation scout-search). */
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

/** Criteria JSON shape aligned with `POST /v1/organisation/professionals/scout-search` body (numbers for salary). */
function buildScoutCriteriaPayload() {
  return {
    jobTitle: SCOUT_JOB_TITLE,
    searchType: 'fuzzy',
    location: 'Global',
    domicile: '',
    workMode: 'global_remote',
    employmentType: '',
    currency: 'EUR',
    salaryMin: 2000,
    salaryMax: 30000,
    benefits: [] as string[],
    description: '',
    salaryPeriod: 'annually',
    name: DEV_SCOUT_LIST_NAME,
    __seedSource: 'prisma/seed-dev-data.ts',
  };
}

/**
 * Ensures an organisation owner exists for scout seeding: creates user + organisation if missing,
 * or attaches an organisation row if the user exists but has none.
 */
async function ensureOrganisationForSeed(email: string): Promise<{ organisationId: string; createdUser: boolean }> {
  const hashed = await bcrypt.hash(ORG_PASSWORD, 10);
  let user = await prisma.user.findUnique({
    where: { email },
    include: { organisation: true },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        firstName: 'Seed',
        lastName: 'Organisation',
        status: UserStatus.ACTIVE,
        userType: UserType.ORGANISATION,
        emailVerified: true,
        firstLogin: false,
        organisation: {
          create: {
            companyName: 'Seeded Organisation (dev)',
            country: 'Nigeria',
            setupCompleted: true,
          },
        },
      },
      include: { organisation: true },
    });
    if (!user.organisation) {
      throw new Error('Failed to create organisation for new seed user.');
    }
    return { organisationId: user.organisation.id, createdUser: true };
  }

  if (user.userType !== UserType.ORGANISATION) {
    throw new Error(
      `User ${email} exists but is not ORGANISATION (type=${user.userType}). Use a different SEED_TARGET_ORG_EMAIL or change user type.`,
    );
  }

  if (!user.organisation) {
    const org = await prisma.organisation.create({
      data: {
        userId: user.id,
        companyName: 'Seeded Organisation (dev)',
        country: 'Nigeria',
        setupCompleted: true,
      },
    });
    console.log(`   Created missing organisation row for existing user ${email}.`);
    return { organisationId: org.id, createdUser: false };
  }

  return { organisationId: user.organisation.id, createdUser: false };
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

async function collectProfessionalIdsInSeedOrder(): Promise<string[]> {
  const ids: string[] = [];
  for (const row of SEED_PROFESSIONALS) {
    const u = await prisma.user.findUnique({
      where: { email: row.email },
      include: { professional: { select: { id: true } } },
    });
    if (u?.professional?.id) ids.push(u.professional.id);
  }
  return ids;
}

/**
 * Replace the dev scout row for this org: one `OrganisationTalentScout` + `OrganisationTalentScoutMatch` per professional.
 * Re-running the seed is idempotent for this list name.
 */
async function upsertDevTalentScout(organisationId: string, professionalIds: string[]) {
  await prisma.organisationTalentScout.deleteMany({
    where: {
      organisationId,
      name: DEV_SCOUT_LIST_NAME,
    },
  });

  const criteria = buildScoutCriteriaPayload();

  return prisma.$transaction(async (tx) => {
    const scout = await tx.organisationTalentScout.create({
      data: {
        organisationId,
        name: DEV_SCOUT_LIST_NAME,
        criteria,
        matchCount: professionalIds.length,
      },
    });
    if (professionalIds.length > 0) {
      await tx.organisationTalentScoutMatch.createMany({
        data: professionalIds.map((professionalId, sortOrder) => ({
          scoutId: scout.id,
          professionalId,
          sortOrder,
        })),
      });
    }
    return scout;
  });
}

function printNextSteps(scoutId: string, matchCount: number, orgWasJustCreated: boolean) {
  console.log('\n--- Persisted talent scout (DB) ---');
  console.log(`Scout id: ${scoutId}`);
  console.log(`Matches: ${matchCount} professionals (see OrganisationTalentScoutMatch).`);
  console.log('\n1. Log in as the organisation user:');
  console.log(`   ${TARGET_ORG_EMAIL}`);
  if (orgWasJustCreated) {
    console.log(`   Password (new account): ${ORG_PASSWORD}`);
  }
  console.log('\n2. Open the Scouted list + Request view (API-backed, no localStorage):');
  console.log(
    `   /organization/professionals?tab=scouted&scout=${encodeURIComponent(scoutId)}&view=request`,
  );
  console.log('\n3. Optional API checks:');
  console.log(`   GET  /v1/organisation/professionals/scouts`);
  console.log(`   GET  /v1/organisation/professionals/scouts/${scoutId}`);
  console.log('\n4. Response tab:');
  console.log(
    '   Still driven by client state until a responses endpoint exists; use Request to verify matched professionals.\n',
  );
}

async function main() {
  console.log('🌱 Scout dev seed (10 professionals + OrganisationTalentScout + matches)...');
  const { organisationId, createdUser } = await ensureOrganisationForSeed(TARGET_ORG_EMAIL);
  console.log(`   Target organisation: ${TARGET_ORG_EMAIL}`);
  console.log(`   organisationId: ${organisationId}`);

  for (const row of SEED_PROFESSIONALS) {
    await ensureProfessional(row);
  }

  const professionalIds = await collectProfessionalIdsInSeedOrder();
  if (professionalIds.length !== SEED_PROFESSIONALS.length) {
    console.warn(
      `⚠️ Expected ${SEED_PROFESSIONALS.length} professional ids, got ${professionalIds.length}. Scout matches may be incomplete.`,
    );
  }

  const scout = await upsertDevTalentScout(organisationId, professionalIds);

  console.log(`✅ Upserted ${SEED_PROFESSIONALS.length} professionals (password for each: ${PROF_PASSWORD}).`);
  console.log('   `profession` column and latest work-experience role are aligned with fuzzy title tokens.');
  printNextSteps(scout.id, professionalIds.length, createdUser);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
