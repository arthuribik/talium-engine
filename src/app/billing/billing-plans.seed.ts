import { PrismaClient, BillingEntityType } from '@prisma/client';

type SeedPlan = {
  planSlug: string;
  entityType: BillingEntityType;
  name: string;
  description: string;
  priceMonthlyUsd: number;
  priceAnnualUsd: number | null;
  priceMonthlyNgn: number | null;
  priceAnnualNgn: number | null;
  displayOrder: number;
  features: string[];
};

const ORG_PLANS: SeedPlan[] = [
  {
    planSlug: 'starter',
    entityType: BillingEntityType.organisation,
    name: 'Starter Plan',
    description: 'Default plan, no payment, no commitment',
    priceMonthlyUsd: 0,
    priceAnnualUsd: 0,
    priceMonthlyNgn: 0,
    priceAnnualNgn: 0,
    displayOrder: 0,
    features: [
      'Basic job posting',
      'Standard support',
      'Basic analytics',
      'Up to 5 active job postings',
    ],
  },
  {
    planSlug: 'standard',
    entityType: BillingEntityType.organisation,
    name: 'Standard Plan',
    description: 'Extra value and optimized recruitment experience',
    priceMonthlyUsd: 99,
    priceAnnualUsd: 950,
    priceMonthlyNgn: 153450,
    priceAnnualNgn: 1472500,
    displayOrder: 1,
    features: [
      'Unlimited job postings',
      'Advanced analytics',
      'Priority support',
      'Custom branding',
      'Candidate filtering',
      'Application management',
    ],
  },
  {
    planSlug: 'recruiter',
    entityType: BillingEntityType.organisation,
    name: 'Recruiter Plan',
    description:
      'Full suite recruitment, onboarding and offboarding package',
    priceMonthlyUsd: 299,
    priceAnnualUsd: 2870,
    priceMonthlyNgn: 35000,
    priceAnnualNgn: 336000,
    displayOrder: 2,
    features: [
      'Everything in Standard',
      'Recruitment suite',
      'Onboarding tools',
      'Offboarding management',
      'Team collaboration',
      'Advanced reporting',
      'Dedicated support',
    ],
  },
  {
    planSlug: 'enterprise',
    entityType: BillingEntityType.organisation,
    name: 'Enterprise Plan',
    description: 'Suitable for large organisations',
    priceMonthlyUsd: 999,
    priceAnnualUsd: 9590,
    priceMonthlyNgn: 1548450,
    priceAnnualNgn: 14864500,
    displayOrder: 3,
    features: [
      'Everything in Recruiter',
      'Custom integrations',
      'Dedicated account manager',
      'SLA guarantee',
      'On-premise option',
      'White-label solution',
      'API access',
      'Custom workflows',
    ],
  },
];

const PRO_PLANS: SeedPlan[] = [
  {
    planSlug: 'express',
    entityType: BillingEntityType.professional,
    name: 'Taldium Express',
    description: 'Default access plan for all entities',
    priceMonthlyUsd: 0,
    priceAnnualUsd: 0,
    priceMonthlyNgn: 0,
    priceAnnualNgn: 0,
    displayOrder: 0,
    features: [
      'Basic profile access',
      'Standard verification',
      'Basic job applications',
      'Profile visibility',
    ],
  },
  {
    planSlug: 'bloom',
    entityType: BillingEntityType.professional,
    name: 'Taldium Bloom',
    description: 'Enhanced features for professionals',
    priceMonthlyUsd: 79,
    priceAnnualUsd: 758,
    priceMonthlyNgn: 122450,
    priceAnnualNgn: 1174900,
    displayOrder: 1,
    features: [
      'Everything in Express',
      'Priority job applications',
      'Advanced profile features',
      'Enhanced visibility',
      'Priority support',
      'Analytics dashboard',
    ],
  },
  {
    planSlug: 'prime',
    entityType: BillingEntityType.professional,
    name: 'Taldium Prime',
    description: 'Premium features and priority support',
    priceMonthlyUsd: 149,
    priceAnnualUsd: 1430,
    priceMonthlyNgn: 230950,
    priceAnnualNgn: 2216500,
    displayOrder: 2,
    features: [
      'Everything in Bloom',
      'Premium profile features',
      'Direct recruiter access',
      'Advanced analytics',
      'Dedicated support',
      'Early access to features',
      'Custom profile branding',
    ],
  },
];

export async function ensureDefaultBillingPlans(prisma: PrismaClient): Promise<void> {
  const all = [...ORG_PLANS, ...PRO_PLANS];
  for (const p of all) {
    await prisma.billingSubscriptionPlan.upsert({
      where: {
        entityType_planSlug: {
          entityType: p.entityType,
          planSlug: p.planSlug,
        },
      },
      create: {
        planSlug: p.planSlug,
        entityType: p.entityType,
        name: p.name,
        description: p.description,
        priceMonthlyUsd: p.priceMonthlyUsd,
        priceAnnualUsd: p.priceAnnualUsd,
        priceMonthlyNgn: p.priceMonthlyNgn,
        priceAnnualNgn: p.priceAnnualNgn,
        displayOrder: p.displayOrder,
        features: p.features,
        isActive: true,
      },
      update: {},
    });
  }
}
