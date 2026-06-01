import { buildCombinedPayPeriodSummaryHtml } from './foreman-bonus-report';
import { dustinJob163 } from './foreman-bonus.fixtures';
import { summarizeForemanBonusRecords } from './foreman-bonus.compute';
import { ForemanBonusRecord } from '../models/foreman-bonus.types';

describe('foreman-bonus-report', () => {
  it('uses Brighten labels and billing-capped total bonus to date', () => {
    const records: ForemanBonusRecord[] = [
      {
        ...dustinJob163,
        id: '1',
        foremanName: 'Dustin Miller',
        bonusAvailableToReceive: 2920.92,
        foremanShareBonus: 5658.51,
        bonusNumber: 3,
      },
    ];
    const summary = summarizeForemanBonusRecords(records, 'Dustin Miller', '2025-11-30');
    const html = buildCombinedPayPeriodSummaryHtml(
      {
        companyName: 'Brighten Builders LLC',
        reportThrough: '2025-11-30',
        reportPeriodStart: '2025-11-01',
        reportPeriodEnd: '2025-11-30',
        reportLabel: 'Bonus Summary - Dec 2025',
      },
      [{ summary, records }],
    );

    expect(summary.totalBonusEarnedToDate).toBe(2920.92);
    expect(summary.potentialTotalBonus).toBe(5658.51);
    expect(html).toContain('Total Bonus to Date');
    expect(html).toContain('Potential Total Bonus');
    expect(html).toContain('Bonus Total of Received');
    expect(html).toContain('Brighten Builders LLC');
    expect(html).toContain('Bonus #: 3');
  });
});
