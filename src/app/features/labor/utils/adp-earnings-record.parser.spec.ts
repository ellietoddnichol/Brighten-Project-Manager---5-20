import { parseAdpEarningsRecordCsv, parseAdpEarningsRecordMatrix } from './adp-earnings-record.parser';

const SAMPLE_CSV = `
ADP EarningsRecord
Pay Date: 06/13/2026

Employee Name,SSN,Department,Gross Earning,Fed FIT,Fed SocSec,Fed MedCare,KS SIT,MO SIT,Union Dues,Vacation,Net Pay,Check Date,Earning,Rate,Hours,Amount,Earning,Rate,Hours,Amount
"Smith, John A",***-**-1234,Carpentry,1200.00,150.00,74.40,17.40,45.00,0.00,25.00,10.00,878.20,06/13/2026,Regular,30.00,32.00,960.00,Overtime,45.00,8.00,360.00
"Jones, Mary",***-**-5678,Carpentry,800.00,90.00,49.60,11.60,30.00,0.00,0.00,0.00,618.80,06/13/2026,Regular,25.00,32.00,800.00,,,,
Employee Totals,,,,,,,,,,,,,,,,,,,
`;

describe('adp-earnings-record.parser', () => {
  it('parses ADP EarningsRecord CSV and aggregates employees', () => {
    const parsed = parseAdpEarningsRecordCsv(SAMPLE_CSV, 'EarningsRecord.csv');

    expect(parsed.payDate).toBe('2026-06-13');
    expect(parsed.weekEnding).toBe('2026-06-06');
    expect(parsed.weekStart).toBe('2026-05-31');
    expect(parsed.employees).toHaveLength(2);

    const smith = parsed.employees.find(e => e.rawName.includes('Smith'));
    expect(smith?.grossPay).toBe(1200);
    expect(smith?.socialSecurity).toBeCloseTo(74.4);
    expect(smith?.medicare).toBeCloseTo(17.4);
    expect(smith?.federalIncomeTax).toBe(150);
    expect(smith?.stateTaxKs).toBe(45);
    expect(smith?.unionDues).toBe(25);
    expect(smith?.vacationDeduction).toBe(10);
    expect(smith?.netPay).toBeCloseTo(878.2);
    expect(smith?.regularRate).toBe(30);
    expect(smith?.overtimeRate).toBe(45);
    expect(smith?.regularHours).toBe(32);
    expect(smith?.overtimeHours).toBe(8);
    expect(smith?.ssnLast4).toBe('1234');
  });

  it('throws when header row is missing', () => {
    expect(() => parseAdpEarningsRecordCsv('foo,bar\n1,2', 'bad.csv')).toThrow(/header row/i);
  });

  it('parses ADP EarningsRecord matrix rows from Excel export', () => {
    const rows = [
      ['Report: Earnings Record'],
      ['Check Dates From: 6/22/2026'],
      ['Employee Name', 'SSN', 'Check Date', 'Department', 'Earning 1', 'Rate', 'Hours', 'Amount', 'Gross Earning', 'FED FIT', 'FED SOCSEC', 'FED MEDCARE', 'KS SIT', 'MO SIT', 'Union Dues', 'Vacation', 'Net Pay'],
      ['Albright, Max', 'xxx-xx-3380', '6/22/2026', 'Department: 007', 'Regular', 23.42, 8, 187.36, 936.8, 50, 58.08, 13.58, 20, 0, 10, 5, 780.14],
    ];
    const parsed = parseAdpEarningsRecordMatrix(rows, 'EarningsRecord.xlsx');
    expect(parsed.payDate).toBe('2026-06-22');
    expect(parsed.employees).toHaveLength(1);
    expect(parsed.employees[0]?.rawName).toContain('Albright');
    expect(parsed.employees[0]?.grossPay).toBeCloseTo(936.8);
  });
});
