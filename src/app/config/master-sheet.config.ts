/** Brighten Master Data Sheet — read-only source of truth (never written from the app). */
export const MASTER_SHEET = {
  spreadsheetId: '1kL_umv21uYPQfYabCOIH9U5HVjHtu5jkd-kPOSmeNIA',
  url: 'https://docs.google.com/spreadsheets/d/1kL_umv21uYPQfYabCOIH9U5HVjHtu5jkd-kPOSmeNIA/edit',
  timelogsUrl: 'https://docs.google.com/spreadsheets/d/1kL_umv21uYPQfYabCOIH9U5HVjHtu5jkd-kPOSmeNIA/edit#gid=0',
  sheets: {
    masterJobList: 'Master Job List',
    timelogs: 'Timelogs',
  },
  /** Auto-refresh interval while signed in */
  syncIntervalMs: 5 * 60 * 1000,
} as const;
