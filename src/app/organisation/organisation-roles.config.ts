import { OrgRole } from '@prisma/client';

export const ORG_PERMISSION_CATALOG = [
  'jobs',
  'applicants',
  'team',
  'billing',
  'settings',
  'profile',
  'communication',
  'scouting',
] as const;

export type OrgPermissionKey = (typeof ORG_PERMISSION_CATALOG)[number];

const LABEL: Record<OrgPermissionKey, string> = {
  jobs: 'Jobs',
  applicants: 'Applicants',
  team: 'Team',
  billing: 'Billing',
  settings: 'Settings',
  profile: 'Profile',
  communication: 'Communication',
  scouting: 'Scouting',
};

export function formatPermissionLabel(key: string): string {
  return LABEL[key as OrgPermissionKey] ?? key;
}

export const SETTINGS_ORG_ROLE_ORDER: OrgRole[] = [
  'org_owner',
  'org_admin',
  'org_recruiter',
];

type SystemRoleMeta = {
  name: string;
  description: string;
  isSystem: boolean;
  permissionKeys: readonly OrgPermissionKey[];
  permissionCount: number;
};

export const SYSTEM_ROLE_DEFINITIONS: Partial<
  Record<OrgRole, SystemRoleMeta>
> = {
  org_owner: {
    name: 'Owner',
    isSystem: true,
    description:
      'Full access to all resources and settings. Cannot be deleted.',
    permissionKeys: [...ORG_PERMISSION_CATALOG],
    permissionCount: 18,
  },
  org_admin: {
    name: 'Admin',
    isSystem: true,
    description:
      'Can manage most settings except billing and role management.',
    permissionKeys: [...ORG_PERMISSION_CATALOG],
    permissionCount: 16,
  },
  org_recruiter: {
    name: 'Recruiter',
    isSystem: false,
    description:
      'Can create jobs, manage applicants, and handle scouting.',
    permissionKeys: ['jobs', 'applicants', 'communication', 'scouting'],
    permissionCount: 9,
  },
};

export function isValidPermissionList(keys: string[]): keys is OrgPermissionKey[] {
  const set = new Set<string>(ORG_PERMISSION_CATALOG);
  return keys.every((k) => set.has(k));
}
