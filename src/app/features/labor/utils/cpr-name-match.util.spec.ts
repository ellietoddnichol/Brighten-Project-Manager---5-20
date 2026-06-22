import { AdpPayrollDetail, CprMemoryRecord } from '@app/models/certified-payroll.types';
import { resolveAdpPayrollDetail } from './cpr-name-match.util';

function adp(name: string, weekEnding = '2026-06-07'): AdpPayrollDetail {
  return {
    id: `adp-${name}`,
    employeeKey: name.toLowerCase(),
    employeeName: name,
    payPeriodEnding: weekEnding,
  };
}

describe('cpr-name-match.util', () => {
  const weekEnding = '2026-06-07';
  const details = [
    adp('Smith, John A'),
    adp('James K Patterson'),
    adp('Maxy Albright'),
  ];

  it('matches exact ADP name', () => {
    const result = resolveAdpPayrollDetail({
      timelogEmployee: 'John A Smith',
      weekEnding,
      adpDetails: details,
    });
    expect(result.detail?.employeeName).toContain('Smith');
    expect(result.source).toBe('exact name');
    expect(result.confidence).toBe(1);
  });

  it('matches seeded alias Kyle Patterson → James K Patterson', () => {
    const result = resolveAdpPayrollDetail({
      timelogEmployee: 'Kyle Patterson',
      weekEnding,
      adpDetails: details,
    });
    expect(result.detail?.employeeName).toContain('Patterson');
    expect(result.source).toBe('built-in alias');
  });

  it('matches CPR memory before fuzzy logic', () => {
    const memory: CprMemoryRecord[] = [{
      id: 'mem-1',
      timelogNorm: 'travis wiser',
      adpNorm: 'maxy albright',
    }];
    const result = resolveAdpPayrollDetail({
      timelogEmployee: 'Travis Wiser',
      weekEnding,
      adpDetails: details,
      memory,
    });
    expect(result.detail?.employeeName).toContain('Albright');
    expect(result.source).toBe('CPR Memory');
  });

  it('returns unmatched when no candidate exists', () => {
    const result = resolveAdpPayrollDetail({
      timelogEmployee: 'Nobody Here',
      weekEnding,
      adpDetails: details,
    });
    expect(result.detail).toBeUndefined();
    expect(result.source).toBe('unmatched');
    expect(result.confidence).toBe(0);
  });
});
