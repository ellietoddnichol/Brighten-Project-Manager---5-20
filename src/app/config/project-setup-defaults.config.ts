/** App-wide project setup rules — single source for Settings → Project Setup Defaults. */
export const PROJECT_SETUP_DEFAULTS = {
  pmRequired: false,
  startDateRequired: false,
  targetEndRequired: false,
  wageOrderBlocksSetup: false,
  prevailingWageImpliesCpr: true,
  nonPwWageOrderRequired: false,
  budgetRequiredForSetup: false,
  qboSyncBlocksSetup: false,
  billingRequiredBeforeStart: false,
  foremanDefaults: [
    { match: 'Lakeview Village', foreman: 'Kyle', note: 'Also applies to LVV job names' },
    { match: 'CWA Specialties', foreman: 'AJ', note: 'CWA Specialties, INC.' },
    { match: 'LightEdge / J204', foreman: 'Dustin', note: 'LightEdge Data Center (J204)' },
  ],
} as const;

export const SETUP_REQUIRED_FIELDS = [
  'Job number',
  'Project name',
  'Customer / GC',
  'Address (or multiple locations)',
  'County',
  'Project profile',
  'Foreman (when known or defaulted)',
  'Contract amount or Pending',
  'Prevailing wage Y/N',
  'CPR required (auto from PW)',
  'Drive folder link',
  'Billing status (Not started is valid)',
] as const;

export const SETUP_NON_BLOCKERS = [
  'PM',
  'Start date (derived from activity)',
  'Target end date',
  'Wage order number',
  'Budget workbook',
  'Pay app / SOV (until billing starts)',
  'QBO sync',
  'AR status (until billed)',
] as const;
