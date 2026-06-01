import {
  aggregateLaborCodeDiscoveryStats,
  collectLaborCodeDiscoveryStats,
  expandLaborCodeSegments,
  inferDiscoveredMappingDefaults,
} from './labor-code-discovery.compute';

describe('labor-code-discovery.compute', () => {
  it('expands labor code 1/2/3 with paired hours', () => {
    const segments = expandLaborCodeSegments({
      laborCode1: '510',
      laborCode2: '998',
      hours1: 8,
      hours2: 2,
      jobNumber: '206',
      employeeName: 'Alex',
      workDate: '2026-03-01',
      approvalStatus: 'Approved',
    });
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual(expect.objectContaining({ laborCode: '510', hours: 8 }));
    expect(segments[1]).toEqual(expect.objectContaining({ laborCode: '998', hours: 2 }));
  });

  it('aggregates stats by labor code', () => {
    const stats = collectLaborCodeDiscoveryStats([
      {
        laborCode: '510',
        totalHours: 8,
        jobNumber: '206',
        employeeName: 'Alex',
        workDate: '2026-03-01',
        approvalStatus: 'Approved',
      },
      {
        laborCode: '510',
        totalHours: 4,
        jobNumber: '208',
        employeeName: 'Blake',
        workDate: '2026-03-05',
        approvalStatus: 'Approved',
      },
    ]);
    expect(stats).toHaveLength(1);
    expect(stats[0].totalHours).toBe(12);
    expect(stats[0].jobCount).toBe(2);
    expect(stats[0].employeeCount).toBe(2);
    expect(stats[0].lastUsedDate).toBe('2026-03-05');
  });

  it('defaults office/admin and PTO classifications', () => {
    const admin = inferDiscoveredMappingDefaults('PM');
    expect(admin.category).toBe('Admin');
    expect(admin.excludeFromForemanBonus).toBe(true);

    const pto = inferDiscoveredMappingDefaults('Vacation');
    expect(pto.category).toBe('PTO');
    expect(pto.wipEligible).toBe(false);
  });

  it('marks blank codes as needs review', () => {
    const blank = inferDiscoveredMappingDefaults('');
    expect(blank.notes).toContain('NeedsReview');
  });

  it('marks unknown numeric codes as needs mapping', () => {
    const unknown = inferDiscoveredMappingDefaults('777');
    expect(unknown.notes).toContain('NeedsMapping');
  });

  it('skips non-approved rows', () => {
    const segments = expandLaborCodeSegments({
      laborCode: '510',
      totalHours: 8,
      approvalStatus: 'Pending',
    });
    expect(segments).toHaveLength(0);
  });

  it('aggregates blank unassigned segments', () => {
    const stats = aggregateLaborCodeDiscoveryStats([
      { laborCode: '', hours: 3, jobNumber: '206' },
      { laborCode: '', hours: 5, jobNumber: '208' },
    ]);
    expect(stats[0].totalHours).toBe(8);
    expect(stats[0].jobCount).toBe(2);
  });
});
