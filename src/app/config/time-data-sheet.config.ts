/** Master Time Data Search — read-only source for employees, job hours, and time entries. */
export const TIME_DATA_SHEET = {
  spreadsheetId: '1QFP2XtvQhfm07ObOm8WE0O-7jJFRD3taKvbSP614o38',
  url: 'https://docs.google.com/spreadsheets/d/1QFP2XtvQhfm07ObOm8WE0O-7jJFRD3taKvbSP614o38/edit',
  /** Tab from the shared link (#gid=1598156584) */
  primaryGid: 1598156584,
  sheets: {
    allTime: 'ALL_TIME',
    jobHours: 'JOB_HOURS',
    allEmployees: 'ALL_EMPLOYEES',
  },
  /** Auto-sync only imports detail rows on/after this date to keep sync fast. Update each year. */
  autoSyncDetailFromDate: '2026-04-01',
  syncIntervalMs: 5 * 60 * 1000,
} as const;
