/** Stable provider keys stored in `organisation_integrations.provider`. */
export const INTEGRATION_PROVIDER_SLUGS = [
  'google_calendar',
  'calendly',
  'microsoft_teams',
  'zoom',
  'slack',
  'sap_successfactors',
  'workday',
] as const;

export type IntegrationProviderSlug =
  (typeof INTEGRATION_PROVIDER_SLUGS)[number];

export function isIntegrationProvider(
  s: string,
): s is IntegrationProviderSlug {
  return (INTEGRATION_PROVIDER_SLUGS as readonly string[]).includes(s);
}

export type IntegrationIconHint =
  | 'calendar'
  | 'video'
  | 'link'
  | 'cog';

export const INTEGRATION_CATALOG: Array<{
  id: string;
  title: string;
  subtitle: string;
  sectionIcon: 'calendar' | 'video' | 'puzzle';
  items: Array<{
    provider: IntegrationProviderSlug;
    title: string;
    description: string;
    icon: IntegrationIconHint;
  }>;
}> = [
  {
    id: 'calendar',
    title: 'Calendar',
    subtitle: 'Sync your recruitment schedule with calendar tools',
    sectionIcon: 'calendar',
    items: [
      {
        provider: 'google_calendar',
        title: 'Google Calendar',
        description:
          'Sync interviews and meetings with Google Calendar',
        icon: 'calendar',
      },
      {
        provider: 'calendly',
        title: 'Calendly',
        description:
          'Allow candidates to self-schedule interviews via Calendly',
        icon: 'calendar',
      },
    ],
  },
  {
    id: 'video_conferencing',
    title: 'Video Conferencing',
    subtitle: 'Integrate video tools for remote interviews',
    sectionIcon: 'video',
    items: [
      {
        provider: 'microsoft_teams',
        title: 'Microsoft Teams',
        description:
          'Conduct video interviews through Microsoft Teams',
        icon: 'video',
      },
      {
        provider: 'zoom',
        title: 'Zoom',
        description: 'Host video interviews and meetings via Zoom',
        icon: 'video',
      },
    ],
  },
  {
    id: 'enterprise',
    title: 'Enterprise Tools',
    subtitle:
      'Connect enterprise HR and communication platforms',
    sectionIcon: 'puzzle',
    items: [
      {
        provider: 'slack',
        title: 'Slack',
        description:
          'Receive real-time notifications and updates in Slack',
        icon: 'link',
      },
      {
        provider: 'sap_successfactors',
        title: 'SAP SuccessFactors',
        description:
          'Sync recruitment data with SAP HR systems',
        icon: 'cog',
      },
      {
        provider: 'workday',
        title: 'Workday',
        description:
          'Integrate with Workday for HR and recruitment workflows',
        icon: 'cog',
      },
    ],
  },
];
