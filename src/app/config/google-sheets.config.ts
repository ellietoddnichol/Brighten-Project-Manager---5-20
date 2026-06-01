import { environment } from './environment';

export const GOOGLE_SHEETS_CONFIG = {
  get projectWorkbookId(): string {
    return environment.projectWorkbookId;
  },

  /** Tab ranges for the project management workbook (read-only). */
  ranges: {
    projects: 'Projects!A:Z',
    breakdown: 'Project Breakdown!A:Z',
    changes: 'Change Log!A:Z',
    invoices: `'Invoices / Pay Apps'!A:Z`,
    proposals: 'Proposals!A:Z',
    monthlyBilling: 'Monthly Billing!A:Z',
  },

  tabKeys: ['projects', 'breakdown', 'changes', 'invoices', 'proposals', 'monthlyBilling'] as const,

  syncIntervalMs: 5 * 60 * 1000,

  workbookUrl(workbookId: string): string {
    return `https://docs.google.com/spreadsheets/d/${workbookId}/edit`;
  },
};

export type WorkbookTabKey = (typeof GOOGLE_SHEETS_CONFIG.tabKeys)[number];
