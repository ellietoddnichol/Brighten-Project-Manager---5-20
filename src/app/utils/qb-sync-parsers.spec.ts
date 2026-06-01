import { describe, expect, it } from 'vitest';
import { parseJobFromLabel, parseArAgingRows, parseIncomeByCustomerRows, parseQuickBooksProjectCostDetailRows, classifyQbCostCategory } from './qb-sync-parsers';

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
});
