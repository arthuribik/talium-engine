import {
  ORG_PERMISSION_CATALOG,
  formatPermissionLabel,
} from './organisation-roles.config';

export type PermissionCatalogItem = { key: string; label: string };

export type PermissionCatalogSection = {
  id: string;
  title: string;
  columns: 1 | 2;
  items: PermissionCatalogItem[];
};

/** Sections and items for Settings → Create Role (matches product UI). */
export const PERMISSION_CATALOG_SECTIONS: PermissionCatalogSection[] = [
  {
    id: 'jobs',
    title: 'JOBS',
    columns: 2,
    items: [
      { key: 'jobs.create', label: 'Create Jobs' },
      { key: 'jobs.edit', label: 'Edit Jobs' },
      { key: 'jobs.delete', label: 'Delete Jobs' },
      { key: 'jobs.view', label: 'View Jobs' },
    ],
  },
  {
    id: 'applicants',
    title: 'APPLICANTS',
    columns: 2,
    items: [
      { key: 'applicants.view', label: 'View Applicants' },
      { key: 'applicants.manage', label: 'Manage Applicants' },
      { key: 'applicants.hire', label: 'Hire Applicants' },
    ],
  },
  {
    id: 'team',
    title: 'TEAM',
    columns: 2,
    items: [
      { key: 'team.invite', label: 'Invite Members' },
      { key: 'team.remove', label: 'Remove Members' },
      { key: 'team.roles', label: 'Manage Roles' },
    ],
  },
  {
    id: 'billing',
    title: 'BILLING',
    columns: 2,
    items: [
      { key: 'billing.view', label: 'View Billing' },
      { key: 'billing.manage', label: 'Manage Billing' },
    ],
  },
  {
    id: 'settings',
    title: 'SETTINGS',
    columns: 1,
    items: [{ key: 'settings.manage', label: 'Manage Settings' }],
  },
  {
    id: 'profile',
    title: 'PROFILE',
    columns: 1,
    items: [{ key: 'profile.edit', label: 'Edit Profile' }],
  },
  {
    id: 'communication',
    title: 'COMMUNICATION',
    columns: 2,
    items: [
      { key: 'communication.posts', label: 'Create Posts' },
      { key: 'communication.manage', label: 'Manage Communication' },
    ],
  },
  {
    id: 'scouting',
    title: 'SCOUTING',
    columns: 2,
    items: [
      { key: 'scouting.workflows.create', label: 'Create Scout Workflows' },
      { key: 'scouting.workflows.manage', label: 'Manage Scout Workflows' },
    ],
  },
];

const GRANULAR_LABEL_MAP: Record<string, string> = Object.fromEntries(
  PERMISSION_CATALOG_SECTIONS.flatMap((s) =>
    s.items.map((i) => [i.key, i.label]),
  ),
);

export const ALL_GRANULAR_PERMISSION_KEYS: string[] =
  PERMISSION_CATALOG_SECTIONS.flatMap((s) => s.items.map((i) => i.key));

const GRANULAR_SET = new Set(ALL_GRANULAR_PERMISSION_KEYS);
const COARSE_SET = new Set<string>(ORG_PERMISSION_CATALOG);

export function isValidGranularPermissionList(keys: string[]): boolean {
  return (
    Array.isArray(keys) &&
    keys.length > 0 &&
    keys.every((k) => GRANULAR_SET.has(k))
  );
}

/** Legacy coarse keys or new granular keys (for PATCH updates). */
export function isValidCustomRolePermissionList(keys: string[]): boolean {
  return (
    Array.isArray(keys) &&
    keys.length > 0 &&
    keys.every((k) => GRANULAR_SET.has(k) || COARSE_SET.has(k))
  );
}

export function formatPermissionKeyForDisplay(key: string): string {
  if (GRANULAR_LABEL_MAP[key]) return GRANULAR_LABEL_MAP[key];
  return formatPermissionLabel(key);
}
