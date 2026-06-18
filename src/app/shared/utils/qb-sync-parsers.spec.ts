import { describe, expect, it } from 'vitest';
import {
  parseJobFromLabel,
  parseArAgingRows,
  parseArAgingSummaryReportRows,
  parseIncomeByCustomerRows,
  parseInvoiceDetailRows,
  parseCustomersRows,
  parseVendorBalanceRows,
  parseBillPaymentRows,
  parseQuickBooksProjectCostDetailRows,
  classifyQbCostCategory,
} from '@shared/utils/qb-sync-parsers';

/** Fixture rows copied from Quickbooks Project Mgmt Sync workbook export. */
const QB_EXPORT = {
  arAgingSummary: [
    ['Brighten Builders LLC', '', '', '', '', '', ''],
    ['A/R Aging Summary', '', '', '', '', '', ''],
    ['Period: Today June 18 - June 18, 2026; Accounting Method: Report_Date', '', '', '', '', '', ''],
    [' ', 'Current', '1 - 30', '31 - 60', '61 - 90', '91 And Over', 'Total'],
    ['BKM Contruction LLC', '', '', '', '', '', 0],
    ['215 - 2306 Visitor Center', 12720, '', '', '', '', 12720],
    ['221 - Whitaker USMS Vault Door', 600, '', '', '', '', 600],
    ['Total BKM Contruction LLC', 13320, 0, 0, 0, 0, 13320],
  ],
  incomeByCustomer: [
    ['Brighten Builders LLC', '', '', ''],
    ['Income by Customer Summary', '', '', ''],
    ['Period: This Fiscal Year-to-date January 1 - May 28, 2026; Accounting Method: Accrual', '', '', ''],
    [' ', 'Income', 'Expenses', 'Net Income'],
    ['BKM Contruction LLC', '', '', 0],
    ['200 - WY Dotte Shelter 16', '', -1596.43, -1596.43],
    ['215 - 2306 Visitor Center', 12720, -6688.07, 6031.93],
    ['Total BKM Contruction LLC', 13320, -8435.74, 4884.26],
  ],
  invoiceDetails: [
    ['Brighten Builders LLC', '', '', '', '', '', '', '', '', '', '', ''],
    ['Invoice Details', '', '', '', '', '', '', '', '', '', '', ''],
    ['All dates; : 2026-05-01 - 2026-05-31', '', '', '', '', '', '', '', '', '', '', ''],
    ['Line order', 'Service date', 'Memo/Description', 'Item net amount', 'Rate', 'Item amount line', 'Item ledger amount', 'Account line', 'Split account', 'Quantity', 'Product/Service', 'Class'],
    ['0', '', '', '', '', '4000', '4000', 'Accounts Receivable (A/R)', 'Services', '', '', ''],
    ['1', '', 'PA001 - May - J223', '', 4000, '4000', '-4000', 'Services', 'Accounts Receivable (A/R)', 1, 'Services', ''],
  ],
  vendorBalance: [
    ['Brighten Builders LLC', ''],
    ['Vendor Balance Summary', ''],
    ['Period: This Fiscal Year-to-date January 1 - June 18, 2026; Accounting Method: Accrual', ''],
    [' ', 'Total'],
    ['ABC Supply', 3686.77],
    ['CWA Specialties', 46295],
  ],
  billPayments: [
    ['Brighten Builders LLC', '', '', '', '', '', '', ''],
    ['Bill Payments', '', '', '', '', '', '', ''],
    ['All dates', '', '', '', '', '', '', ''],
    ['Id', 'Date', 'Currency Ref.Value', 'Currency Ref.Name', 'Private Note', 'Line.Amount', 'Line.Linked Txn.Txn Id', 'Line.Linked Txn.Txn Type'],
    ['7037', 46153, 'USD', 'United States Dollar', '', 33436.88, '6947', 'Bill'],
  ],
  customers: [
    ['Brighten Builders LLC', 'Vazquez Commercial Contracting, LLC:129 - JOCO Toilet Partions', '', '', '', '', '', ''],
    ['Customers', 'BKM Contruction LLC:225 - LV VA Bldg-89', '', '', '', '', '', ''],
    ['All dates', 'CWA Specialties, INC.:174 - Bank of Labor HQ', '', '', '', '', '', ''],
    ['158 - Blue Valley CTE 2026', 'McCown Gordon:158 - Blue Valley CTE 2026', '', '', '', '', '', ''],
    ['172 - LV USD - Warren', 'BKM Contruction LLC:172 - LV USD - Warren', '', '', '', '', '', ''],
  ],
} as const;

describe('parseJobFromLabel', () => {
  it('parses standard job prefix', () => {
    expect(parseJobFromLabel('216 - Unilever Phase II Demo')).toEqual({
      jobNumber: '216',
      projectName: 'Unilever Phase II Demo',
    });
  });

  it('parses Purdum-prefixed customer names', () => {
    expect(parseJobFromLabel('Purdum:216 - Unilever Phase II Demo')).toEqual({
      jobNumber: '216',
      projectName: 'Unilever Phase II Demo',
    });
  });

  it('parses job number from invoice memo', () => {
    expect(parseJobFromLabel('PA001 - May - J223')).toEqual({ jobNumber: '223' });
  });
});

describe('parseIncomeByCustomerRows', () => {
  it('reads header-based income rows', () => {
    const rows = [
      ['Customer', 'Income', 'Expenses', 'Net Income'],
      ['223 - Fairmount 26', '100000', '80000', '20000'],
      ['Total', '100000', '80000', '20000'],
    ];
    const parsed = parseIncomeByCustomerRows(rows);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].jobNumber).toBe('223');
    expect(parsed[0].income).toBe(100000);
    expect(parsed[0].expenses).toBe(80000);
  });

  it('reads QuickBooks multi-row Income by Customer export', () => {
    const parsed = parseIncomeByCustomerRows([...QB_EXPORT.incomeByCustomer]);
    expect(parsed.length).toBeGreaterThanOrEqual(2);
    expect(parsed.find(r => r.jobNumber === '215')?.income).toBe(12720);
    expect(parsed.find(r => r.jobNumber === '200')?.expenses).toBe(-1596.43);
  });
});

describe('parseInvoiceDetailRows', () => {
  it('reads QuickBooks multi-row Invoice Details export', () => {
    const parsed = parseInvoiceDetailRows([...QB_EXPORT.invoiceDetails]);
    expect(parsed.length).toBeGreaterThanOrEqual(1);
    expect(parsed[0].jobNumber).toBe('223');
    expect(parsed[0].amount).toBe(4000);
  });
});

describe('parseVendorBalanceRows', () => {
  it('reads QuickBooks Vendor Balance Summary export', () => {
    const parsed = parseVendorBalanceRows([...QB_EXPORT.vendorBalance]);
    expect(parsed.length).toBeGreaterThanOrEqual(2);
    expect(parsed.find(v => v.vendorName === 'ABC Supply')?.totalOpenBalance).toBe(3686.77);
  });
});

describe('parseBillPaymentRows', () => {
  it('reads QuickBooks Bill Payments export', () => {
    const parsed = parseBillPaymentRows([...QB_EXPORT.billPayments]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].amount).toBe(33436.88);
    expect(parsed[0].linkedTxnId).toBe('6947');
  });
});

describe('parseCustomersRows', () => {
  it('reads QuickBooks Customers export without a header row', () => {
    const parsed = parseCustomersRows([...QB_EXPORT.customers]);
    expect(parsed.length).toBeGreaterThanOrEqual(4);
    expect(parsed.find(c => c.jobNumber === '158')).toBeTruthy();
    expect(parsed.find(c => c.jobNumber === '225')).toBeTruthy();
  });
});

describe('parseQuickBooksProjectCostDetailRows', () => {
  it('imports and classifies cost detail rows', () => {
    const rows = [
      ['Date', 'Vendor', 'Customer', 'Account', 'Amount', 'Memo'],
      ['2026-01-15', 'CKF Electric', '204 - Lightedge', 'Sub Contract Labor', '5000', 'Invoice 101'],
      ['2026-01-20', 'Brighten', '206 - LVV Heritage', 'Wages', '1200', 'Payroll'],
    ];
    const parsed = parseQuickBooksProjectCostDetailRows(rows, 'Project Cost Detail');
    expect(parsed).toHaveLength(2);
    expect(parsed[0].jobNumber).toBe('204');
    expect(parsed[0].costCategory).toBe('Subcontractor');
    expect(parsed[0].includeInWipActuals).toBe(true);
    expect(parsed[1].costCategory).toBe('Labor');
    expect(parsed[1].includeInWipActuals).toBe(false);
  });
});

describe('classifyQbCostCategory', () => {
  it('maps accounts to categories', () => {
    expect(classifyQbCostCategory('Sub Contract Labor')).toBe('Subcontractor');
    expect(classifyQbCostCategory('Cost of Goods Sold Materials')).toBe('Material');
    expect(classifyQbCostCategory('Equipment Rental')).toBe('Equipment');
  });
});

describe('parseArAgingRows', () => {
  it('reads aging buckets from headers', () => {
    const rows = [
      ['Customer', 'Current', '1 - 30', '31 - 60', '61 - 90', '91 And Over', 'Total'],
      ['216 - Unilever Phase II Demo', '1000', '500', '0', '0', '0', '1500'],
    ];
    const parsed = parseArAgingRows(rows);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].jobNumber).toBe('216');
    expect(parsed[0].total).toBe(1500);
    expect(parsed[0].days1To30).toBe(500);
  });

  it('reads QuickBooks multi-row AR Aging Summary export', () => {
    const parsed = parseArAgingRows([...QB_EXPORT.arAgingSummary]);
    expect(parsed.length).toBeGreaterThanOrEqual(2);
    expect(parsed.find(r => r.jobNumber === '215')?.total).toBe(12720);
    expect(parsed.find(r => r.jobNumber === '221')?.total).toBe(600);
  });
});

describe('parseArAgingSummaryReportRows', () => {
  it('reads QuickBooks A/R Aging Summary Report layout', () => {
    const rows = [
      ['A/R Aging Summary Report', '', '', '', '', '', ''],
      ['As of Jun 2, 2026', '', '', '', '', '', ''],
      ['', 'CURRENT', '1 - 30', '31 - 60', '61 - 90', '91 AND OVER', 'Total'],
      ['BKM Contruction LLC', '', '', '', '', '', ''],
      ['215 - 2306 Visitor Center', '12720', '', '', '', '', '12720'],
      ['Total for BKM Contruction LLC', '12720', '0', '0', '0', '0', '12720'],
      ['TOTAL', '12720', '0', '0', '0', '0', '12720'],
    ];
    const parsed = parseArAgingSummaryReportRows(rows);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].jobNumber).toBe('215');
    expect(parsed[0].total).toBe(12720);
    expect(parsed[0].current).toBe(12720);
  });
});
