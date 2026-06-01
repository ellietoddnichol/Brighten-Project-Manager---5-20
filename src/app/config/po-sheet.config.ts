/** Brighten Purchase Order sheet — read-only source of truth (never written from the app). */
export const PO_SHEET = {
  spreadsheetId: '1Quu_ZNb2Oxg-ks5WyGSZBlnYZ4L4oiBeJDYK2L_T4V8',
  url: 'https://docs.google.com/spreadsheets/d/1Quu_ZNb2Oxg-ks5WyGSZBlnYZ4L4oiBeJDYK2L_T4V8/edit',
  /** Tab from the shared link (#gid=909735572) */
  primaryGid: 909735572,
  /** Used if metadata lookup fails */
  fallbackSheetNames: ['PO_Log', 'Purchase Orders 2025'] as const,
  syncIntervalMs: 5 * 60 * 1000,
} as const;
