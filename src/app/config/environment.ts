import { CERTIFIED_PAYROLL_SHEET } from './certified-payroll-sheet.config';

/** Runtime config — optional certified payroll export sheet ID (Settings / localStorage). */
const STORAGE_KEY = 'brighten.certifiedPayrollSheetId';

export const environment = {
  get optionalFinancialWorkbookId(): string {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('brighten.optionalFinancialWorkbookId');
      if (stored?.trim()) return stored.trim();
      const legacy = localStorage.getItem('brighten.projectWorkbookId');
      if (legacy?.trim()) return legacy.trim();
    }
    return '';
  },

  setOptionalFinancialWorkbookId(id: string): void {
    if (typeof localStorage !== 'undefined') {
      const trimmed = id.trim();
      if (trimmed) {
        localStorage.setItem('brighten.optionalFinancialWorkbookId', trimmed);
      } else {
        localStorage.removeItem('brighten.optionalFinancialWorkbookId');
      }
      localStorage.removeItem('brighten.projectWorkbookId');
    }
  },

  get certifiedPayrollSheetId(): string {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored?.trim()) return stored.trim();
    }
    return CERTIFIED_PAYROLL_SHEET.defaultSpreadsheetId ?? '';
  },

  setCertifiedPayrollSheetId(id: string): void {
    if (typeof localStorage !== 'undefined') {
      const trimmed = id.trim();
      if (trimmed) {
        localStorage.setItem(STORAGE_KEY, trimmed);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  },

  /** @deprecated Use optionalFinancialWorkbookId */
  get projectWorkbookId(): string {
    return this.optionalFinancialWorkbookId;
  },

  /** @deprecated Use setOptionalFinancialWorkbookId */
  setProjectWorkbookId(id: string): void {
    this.setOptionalFinancialWorkbookId(id);
  },
};

export type FinancialDataSource = 'firestore' | 'workbook' | 'seed';
