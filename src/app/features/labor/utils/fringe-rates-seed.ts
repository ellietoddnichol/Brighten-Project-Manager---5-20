export interface FringeRateSeedRow {
  classification: string;
  skillLevel: string;
  percentOfJourneyman: number;
  wage: number;
  healthWelfare: number;
  pension: number;
  apprenticeTraining: number;
  iaf: number;
  citf: number;
  annuity: number;
  totalEmployer: number;
  dues: number;
  marketRecovery: number;
  vacationDeduction: number;
  totalPayrollDeduction: number;
  totalPackage: number;
  estampBenefit: number;
  effectiveFrom: string;
  effectiveThrough: string;
  sourceVersion: string;
}

export const KC1_COMMERCIAL_FRINGE_RATES_2026_2027: FringeRateSeedRow[] = [
  { classification: 'Journeyman Carpenter', skillLevel: 'Jrny', percentOfJourneyman: 1.00, wage: 46.83, healthWelfare: 11.25, pension: 9.50, apprenticeTraining: 0.75, iaf: 0.26, citf: 0.15, annuity: 2.30, totalEmployer: 24.21, dues: 1.87, marketRecovery: 0.20, vacationDeduction: 1.00, totalPayrollDeduction: 3.07, totalPackage: 71.04, estampBenefit: 27.28, effectiveFrom: '2026-05-01', effectiveThrough: '2027-04-30', sourceVersion: 'KC1-COMMERCIAL-2026-2027-OFFICIAL-v1' },
  { classification: 'Apprentice – 90%', skillLevel: '8th', percentOfJourneyman: 0.90, wage: 42.15, healthWelfare: 10.13, pension: 8.55, apprenticeTraining: 0.75, iaf: 0.26, citf: 0.15, annuity: 2.07, totalEmployer: 21.91, dues: 1.69, marketRecovery: 0.20, vacationDeduction: 1.00, totalPayrollDeduction: 2.89, totalPackage: 64.06, estampBenefit: 24.80, effectiveFrom: '2026-05-01', effectiveThrough: '2027-04-30', sourceVersion: 'KC1-COMMERCIAL-2026-2027-OFFICIAL-v1' },
  { classification: 'Apprentice – 85%', skillLevel: '7th', percentOfJourneyman: 0.85, wage: 39.81, healthWelfare: 9.56, pension: 8.08, apprenticeTraining: 0.75, iaf: 0.26, citf: 0.15, annuity: 1.96, totalEmployer: 20.76, dues: 1.59, marketRecovery: 0.20, vacationDeduction: 1.00, totalPayrollDeduction: 2.79, totalPackage: 60.57, estampBenefit: 23.55, effectiveFrom: '2026-05-01', effectiveThrough: '2027-04-30', sourceVersion: 'KC1-COMMERCIAL-2026-2027-OFFICIAL-v1' },
  { classification: 'Apprentice – 80%', skillLevel: '6th', percentOfJourneyman: 0.80, wage: 37.46, healthWelfare: 9.00, pension: 7.60, apprenticeTraining: 0.75, iaf: 0.26, citf: 0.15, annuity: 1.84, totalEmployer: 19.60, dues: 1.50, marketRecovery: 0.20, vacationDeduction: 1.00, totalPayrollDeduction: 2.70, totalPackage: 57.06, estampBenefit: 22.30, effectiveFrom: '2026-05-01', effectiveThrough: '2027-04-30', sourceVersion: 'KC1-COMMERCIAL-2026-2027-OFFICIAL-v1' },
  { classification: 'Apprentice – 75%', skillLevel: '5th', percentOfJourneyman: 0.75, wage: 35.12, healthWelfare: 8.44, pension: 7.13, apprenticeTraining: 0.75, iaf: 0.26, citf: 0.15, annuity: 1.73, totalEmployer: 18.46, dues: 1.40, marketRecovery: 0.20, vacationDeduction: 1.00, totalPayrollDeduction: 2.60, totalPackage: 53.58, estampBenefit: 21.06, effectiveFrom: '2026-05-01', effectiveThrough: '2027-04-30', sourceVersion: 'KC1-COMMERCIAL-2026-2027-OFFICIAL-v1' },
  { classification: 'Apprentice – 65%', skillLevel: '4th', percentOfJourneyman: 0.65, wage: 30.44, healthWelfare: 7.31, pension: 6.18, apprenticeTraining: 0.75, iaf: 0.26, citf: 0.15, annuity: 1.50, totalEmployer: 16.15, dues: 1.22, marketRecovery: 0.00, vacationDeduction: 0.00, totalPayrollDeduction: 1.22, totalPackage: 46.59, estampBenefit: 17.37, effectiveFrom: '2026-05-01', effectiveThrough: '2027-04-30', sourceVersion: 'KC1-COMMERCIAL-2026-2027-OFFICIAL-v1' },
  { classification: 'Apprentice – 60%', skillLevel: '3rd', percentOfJourneyman: 0.60, wage: 28.10, healthWelfare: 6.75, pension: 5.70, apprenticeTraining: 0.75, iaf: 0.26, citf: 0.15, annuity: 1.38, totalEmployer: 14.99, dues: 1.12, marketRecovery: 0.00, vacationDeduction: 0.00, totalPayrollDeduction: 1.12, totalPackage: 43.09, estampBenefit: 16.11, effectiveFrom: '2026-05-01', effectiveThrough: '2027-04-30', sourceVersion: 'KC1-COMMERCIAL-2026-2027-OFFICIAL-v1' },
  { classification: 'Apprentice – 55%', skillLevel: '2nd', percentOfJourneyman: 0.55, wage: 25.76, healthWelfare: 6.19, pension: 5.23, apprenticeTraining: 0.75, iaf: 0.26, citf: 0.15, annuity: 1.27, totalEmployer: 13.85, dues: 1.03, marketRecovery: 0.00, vacationDeduction: 0.00, totalPayrollDeduction: 1.03, totalPackage: 39.61, estampBenefit: 14.88, effectiveFrom: '2026-05-01', effectiveThrough: '2027-04-30', sourceVersion: 'KC1-COMMERCIAL-2026-2027-OFFICIAL-v1' },
  { classification: 'Apprentice – 50%', skillLevel: '1st', percentOfJourneyman: 0.50, wage: 23.42, healthWelfare: 5.63, pension: 4.75, apprenticeTraining: 0.75, iaf: 0.26, citf: 0.15, annuity: 1.15, totalEmployer: 12.69, dues: 0.94, marketRecovery: 0.00, vacationDeduction: 0.00, totalPayrollDeduction: 0.94, totalPackage: 36.11, estampBenefit: 13.63, effectiveFrom: '2026-05-01', effectiveThrough: '2027-04-30', sourceVersion: 'KC1-COMMERCIAL-2026-2027-OFFICIAL-v1' },
];

export const CARPENTER_CLASSIFICATIONS = new Set([
  'Journeyman Carpenter',
  'Apprentice – 90%', 'Apprentice – 85%', 'Apprentice – 80%', 'Apprentice – 75%',
  'Apprentice – 65%', 'Apprentice – 60%', 'Apprentice – 55%', 'Apprentice – 50%',
]);

export function isCarpenterClassification(classification: string): boolean {
  return CARPENTER_CLASSIFICATIONS.has(classification);
}

/** Match labor classification labels to official KC1 fringe rows. */
export function fringeRateForClassification(classification: string): FringeRateSeedRow | undefined {
  const direct = KC1_COMMERCIAL_FRINGE_RATES_2026_2027.find(r => r.classification === classification);
  if (direct) return direct;

  const lower = classification.trim().toLowerCase();
  if (/journeyman|carpenter/.test(lower) && !/apprentice/.test(lower)) {
    return KC1_COMMERCIAL_FRINGE_RATES_2026_2027.find(r => r.classification === 'Journeyman Carpenter');
  }
  const apprenticeMatch = lower.match(/apprentice.*?(\d{2,3})%?/);
  if (apprenticeMatch) {
    const pct = apprenticeMatch[1];
    return KC1_COMMERCIAL_FRINGE_RATES_2026_2027.find(r => r.classification.includes(`${pct}%`));
  }
  return undefined;
}
