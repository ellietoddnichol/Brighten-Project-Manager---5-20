import { describe, expect, it } from 'vitest';
import {
  derivePrimaryAgingBucket,
  isWaitingOnArStatus,
  normalizeWipForecastCustomer,
  projectNameFromForecastRow,
  projectPatchFromWipForecastRow,
} from '@features/financials/utils/wip-forecast.parse';

describe('normalizeWipForecastCustomer', () => {
  it('fixes known customer typo', () => {
    expect(normalizeWipForecastCustomer('BKM Contruction LLC')).toBe('BKM Construction LLC');
  });
});

describe('projectPatchFromWipForecastRow', () => {
  it('maps forecast financials and closeout override', () => {
    const patch = projectPatchFromWipForecastRow({
      jobNumber: '197',
      projectLabel: '197 - Administrative Hallway Reno',
      customer: 'Lakeview Village',
      status: 'Waiting on A/R',
      contractBudget: 28485,
      cumulativeBilledEarned: 28485,
      openAr: 6000,
      remainingBacklog: 0,
      grossProfit2026: 11862.49,
      gpMargin2026: 41.64,
      selfLabor: 8955.42,
      subcontractors: 2241,
      materials: 5247.73,
      equipmentOther: 178.36,
      projected2026Base: 28485,
      forecastBasePct: 0,
    });
    expect(patch.wipGroupOverride).toBe('CloseoutAR');
    expect(patch.originalContractAmount).toBe(28485);
    expect(patch.currentAR).toBe(6000);
    expect(patch.forecastMargin).toBe(41.64);
    expect(patch.wipPercentComplete).toBe(1);
  });
});

describe('isWaitingOnArStatus', () => {
  it('detects waiting on AR', () => {
    expect(isWaitingOnArStatus('Waiting on A/R')).toBe(true);
    expect(isWaitingOnArStatus('In Progress')).toBe(false);
  });
});

describe('derivePrimaryAgingBucket', () => {
  it('picks the oldest non-zero bucket', () => {
    expect(derivePrimaryAgingBucket({
      currentAmount: 0,
      days1To30: 17350,
      totalOpen: 17350,
    })).toBe('1-30');
  });
});

describe('projectNameFromForecastRow', () => {
  it('strips job prefix from label', () => {
    expect(projectNameFromForecastRow({ projectLabel: '204 - LightEdge Data Center' }))
      .toBe('LightEdge Data Center');
  });
});
