import { groupHoursByLaborCode } from './labor-hours-by-code.compute';

describe('labor-hours-by-code.compute', () => {
  it('groups hours by labor code with reg/ot/dt breakdown', () => {
    const rows = groupHoursByLaborCode([
      { laborCode: '510', regularHours: 8, overtimeHours: 2, doubleTimeHours: 0, totalHours: 10 },
      { laborCode: '510', regularHours: 4, overtimeHours: 0, doubleTimeHours: 0, totalHours: 4 },
      { laborCode: '520', regularHours: 6, overtimeHours: 0, doubleTimeHours: 1, totalHours: 7 },
      { laborCode: '', regularHours: 2, overtimeHours: 0, doubleTimeHours: 0, totalHours: 2 },
    ]);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      laborCode: '510',
      regularHours: 12,
      overtimeHours: 2,
      totalHours: 14,
      rowCount: 2,
    });
    expect(rows.find(r => r.laborCode === '— Unassigned')).toMatchObject({
      regularHours: 2,
      totalHours: 2,
      rowCount: 1,
    });
  });
});
