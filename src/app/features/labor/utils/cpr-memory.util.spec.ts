import { buildApprovedCprMemoryRecord } from './cpr-memory.util';
import { normalizePersonName } from './cpr-form.util';

describe('cpr-memory.util', () => {
  it('builds stable memory ids from normalized names', () => {
    const record = buildApprovedCprMemoryRecord({
      timelogEmployee: 'Kyle Patterson',
      adpEmployee: 'Patterson, James K',
      displayName: 'Kyle Patterson',
      occupation: 'Journeyman Carpenter',
    });

    expect(record.timelogNorm).toBe('kyle patterson');
    expect(record.adpNorm).toBe('james k patterson');
    expect(record.display).toBe('Kyle Patterson');
    expect(record.approveCount).toBe(1);
    expect(record.source).toBe('approved review');
  });

  it('increments approve count from existing memory', () => {
    const existing = buildApprovedCprMemoryRecord({
      timelogEmployee: 'Max Albright',
      adpEmployee: 'Albright, Maxy',
      occupation: 'Summer Intern',
    });

    const next = buildApprovedCprMemoryRecord({
      timelogEmployee: 'Max Albright',
      adpEmployee: 'Albright, Maxy',
      occupation: 'Summer Intern',
      existing: { ...existing, approveCount: 2 },
    });

    expect(next.approveCount).toBe(3);
    expect(normalizePersonName(next.adpEmployee!)).toBe('maxy albright');
  });
});
