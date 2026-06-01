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
