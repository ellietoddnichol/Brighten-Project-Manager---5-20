/** Certified payroll export destination — drafts append here; does not replace the external CPR system. */
export const CERTIFIED_PAYROLL_SHEET = {
  /** Override in Settings → localStorage `brighten.certifiedPayrollSheetId` */
  defaultSpreadsheetId: '',
  exportTab: 'CPR_Drafts',
  url: '',
  syncIntervalMs: 5 * 60 * 1000,
} as const;

export const CERTIFIED_PAYROLL_EXPORT_MESSAGE =
  'Certified payroll drafts are ready. Connect the certified payroll sheet/system to export.';

/** Matches Apps Script CPR_CONFIG.ADP_CSV_FOLDER_ID — EarningsRecord CSV/XLSX exports. */
export const CPR_ADP_EARNINGS_FOLDER_ID = '1UU2Ngl_qrlqjsDRf6lGJcvnciHRIkkMJ';

export const CPR_ADP_EARNINGS_FILE_NAME_CONTAINS = 'EarningsRecord';
