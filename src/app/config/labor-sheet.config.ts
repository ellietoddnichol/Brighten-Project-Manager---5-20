import { TIME_DATA_SHEET } from './time-data-sheet.config';

/** Labor / Timekeeper read-only sheet configuration. */
export const LABOR_SHEET = {
  spreadsheetId: TIME_DATA_SHEET.spreadsheetId,
  url: TIME_DATA_SHEET.url,
  /** Tab name fallbacks tried in order. */
  tabs: {
    timekeeper: ['ALL_TIME', 'Timekeeper', 'Time Keeper'],
    employeeSummary: ['Employee Summary', 'ALL_EMPLOYEES', 'Employees'],
    classificationRates: ['Classification', 'Classifications', 'Rates'],
    fringeRates: ['Fringe', 'Fringe Rates'],
  },
  /** Only import approved rows from timekeeper. */
  approvedStatusValues: ['approved'],
  defaultUnionArea: 'Commercial Area 1',
  defaultClassification: 'Journeyman',
  /** Classifications / statuses that are not union — no union wage card or fringe. */
  nonUnionClassifications: [
    'Admin',
    'Administrator',
    'Office',
    'Management',
    'Manager',
    'Salary',
    'Non-Union',
    'Executive',
  ] as const,
  syncIntervalMs: 5 * 60 * 1000,
  cacheKey: 'brighten.laborModuleCache',
} as const;
