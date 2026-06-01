import { environment } from './environment';

/**
 * Optional live financial workbook (Pay App / WIP / billing tabs).
 * Not required — dashboard uses Firestore seed/import data by default.
 */
export const OPTIONAL_FINANCIAL_WORKBOOK = {
  get spreadsheetId(): string {
    return environment.optionalFinancialWorkbookId;
  },

  ranges: {
    dashboard: 'Dashboard!A:H',
    payAppUpdateList: `'Pay App Update List'!A:Q`,
    projectMonthGrid: `'Project Month Grid'!A:X`,
    projectMonthImport: `'Project-Month Import'!A:T`,
    invoiceDetail: `'Invoice Detail'!A:M`,
    salesLineDetail: `'Sales Line Detail'!A:L`,
    no2026Billing: `'No 2026 Billing'!A:I`,
  },

  tabKeys: [
    'projectMonthGrid',
    'invoiceDetail',
    'projectMonthImport',
    'payAppUpdateList',
    'no2026Billing',
  ] as const,

  syncIntervalMs: 5 * 60 * 1000,

  url(spreadsheetId: string): string {
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  },
};

export type OptionalFinancialTabKey = (typeof OPTIONAL_FINANCIAL_WORKBOOK.tabKeys)[number];

/** @deprecated Use OPTIONAL_FINANCIAL_WORKBOOK */
export const PAY_APP_BILLING_SHEET = OPTIONAL_FINANCIAL_WORKBOOK;
