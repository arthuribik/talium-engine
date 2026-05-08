export type AdminPermissionCatalogItem = { key: string; label: string };

export type AdminPermissionCatalogSection = {
  id: string;
  title: string;
  icon: 'target' | 'circle' | 'diamond' | 'arrows' | 'half';
  items: AdminPermissionCatalogItem[];
};

export const ADMIN_PLATFORM_PERMISSION_CATALOG: AdminPermissionCatalogSection[] = [
  {
    id: 'professionals',
    title: 'PROFESSIONALS',
    icon: 'target',
    items: [
      { key: 'professionals.view', label: 'View Professionals' },
      { key: 'professionals.edit_profiles', label: 'Edit Profiles' },
      { key: 'professionals.suspend_accounts', label: 'Suspend Accounts' },
      { key: 'professionals.invite', label: 'Invite Professionals' },
    ],
  },
  {
    id: 'organisations',
    title: 'ORGANISATIONS',
    icon: 'circle',
    items: [
      { key: 'organisations.view', label: 'View Organisations' },
      { key: 'organisations.edit', label: 'Edit Organisations' },
      { key: 'organisations.suspend_orgs', label: 'Suspend Orgs' },
      { key: 'organisations.run_kyb', label: 'Run KYB' },
    ],
  },
  {
    id: 'verification',
    title: 'VERIFICATION',
    icon: 'diamond',
    items: [
      { key: 'verification.view_requests', label: 'View Requests' },
      { key: 'verification.approve_reject', label: 'Approve / Reject' },
      { key: 'verification.configure_engine', label: 'Configure Engine' },
      { key: 'verification.export_reports', label: 'Export Reports' },
    ],
  },
  {
    id: 'finance',
    title: 'FINANCE & BILLING',
    icon: 'arrows',
    items: [
      { key: 'finance.view_transactions', label: 'View Transactions' },
      { key: 'finance.manage_plans', label: 'Manage Plans' },
      { key: 'finance.export_financials', label: 'Export Financials' },
      { key: 'finance.issue_refunds', label: 'Issue Refunds' },
    ],
  },
  {
    id: 'team',
    title: 'TEAM & SETTINGS',
    icon: 'half',
    items: [
      { key: 'team.invite_members', label: 'Invite Team Members' },
      { key: 'team.manage_roles', label: 'Manage Roles' },
      { key: 'team.activity_logs', label: 'View Activity Logs' },
      { key: 'team.platform_settings', label: 'Platform Settings' },
    ],
  },
  {
    id: 'jobs',
    title: 'JOBS',
    icon: 'circle',
    items: [
      { key: 'jobs.view', label: 'View Jobs' },
      { key: 'jobs.manage', label: 'Manage Jobs' },
    ],
  },
  {
    id: 'communications',
    title: 'COMMUNICATIONS',
    icon: 'circle',
    items: [{ key: 'communications.create', label: 'Create Communications' }],
  },
];

const LABEL_MAP: Record<string, string> = Object.fromEntries(
  ADMIN_PLATFORM_PERMISSION_CATALOG.flatMap((s) =>
    s.items.map((i) => [i.key, i.label]),
  ),
);

const PERM_SET = new Set(
  ADMIN_PLATFORM_PERMISSION_CATALOG.flatMap((s) => s.items.map((i) => i.key)),
);

export const ALL_ADMIN_PLATFORM_PERMISSION_KEYS: string[] = [...PERM_SET];

export function isValidAdminPlatformPermissionList(keys: string[]): boolean {
  return (
    Array.isArray(keys) &&
    keys.length > 0 &&
    keys.every((k) => PERM_SET.has(k))
  );
}

export function formatAdminPlatformPermissionKey(key: string): string {
  return LABEL_MAP[key] ?? key;
}

/** Preset permission keys for built-in admin team roles (Role Management → Edit). */
export const BUILTIN_ADMIN_TEAM_ROLE_PERMISSION_PRESETS: Record<
  string,
  readonly string[]
> = {
  super_admin: [...ALL_ADMIN_PLATFORM_PERMISSION_KEYS],
  admin: [
    'professionals.view',
    'organisations.view',
    'verification.view_requests',
    'verification.approve_reject',
    'jobs.view',
    'jobs.manage',
    'finance.view_transactions',
  ],
  support: [
    'professionals.view',
    'organisations.view',
    'communications.create',
    'jobs.view',
  ],
  auditor: [
    'finance.view_transactions',
    'finance.manage_plans',
    'finance.export_financials',
  ],
  verifier: [
    'verification.view_requests',
    'verification.approve_reject',
    'professionals.view',
  ],
};
