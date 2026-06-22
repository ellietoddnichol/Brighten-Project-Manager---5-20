import { AdpPayrollDetail, CertifiedPayrollEntry } from '@app/models/certified-payroll.types';
import { fringeRateForClassification } from '@features/labor/utils/fringe-rates-seed';
import {
  normalizeWeekEndingToSaturday,
  parseCprLocalDate,
  startOfWeekSunday,
  workWeekDatesSunThroughSat as buildWorkWeekDates,
} from '@features/labor/utils/certified-payroll-week';

export interface CprEmployeeOverride {
  displayName?: string;
  occupation?: string;
  carpenterFringeApplies: boolean;
}

/** Matches Apps Script CPR_EMPLOYEE_OVERRIDES. */
export const CPR_EMPLOYEE_OVERRIDES: Record<string, CprEmployeeOverride> = {
  'max albright': { displayName: 'Maxy Albright', occupation: 'Summer Intern', carpenterFringeApplies: false },
  'maxy albright': { displayName: 'Maxy Albright', occupation: 'Summer Intern', carpenterFringeApplies: false },
  'travis wiser': { displayName: 'Travis Wiser', occupation: 'Laborer', carpenterFringeApplies: false },
};

export function getEmployeeCprOverride(...names: (string | undefined)[]): CprEmployeeOverride | undefined {
  for (const name of names) {
    const key = normalizePersonName(name);
    if (key && CPR_EMPLOYEE_OVERRIDES[key]) return CPR_EMPLOYEE_OVERRIDES[key];
  }
  return undefined;
}

export function normalizePersonName(name?: string): string {
  const raw = (name ?? '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes(',')) {
    const [last, ...rest] = raw.split(',');
    return `${rest.join(' ').trim()} ${last.trim()}`.replace(/\s+/g, ' ').trim();
  }
  return raw.replace(/\s+/g, ' ');
}

/** Aligns with Apps Script normalizeOccupationLabel_. */
export function normalizeOccupationLabel(value?: string): string {
  const x = String(value ?? '').trim();
  const low = x.toLowerCase();
  if (!x) return '';
  if (low.includes('summer intern') || low === 'intern' || low.includes(' intern')) return 'Summer Intern';
  if (low.includes('laborer') || low.includes('labourer')) return 'Laborer';
  if (low.includes('foreman')) return 'Journeyman Carpenter';
  if (low.includes('journey') || low.includes('jrny')) return 'Journeyman Carpenter';
  if (low.includes('apprentice') || low.includes('appr')) {
    const m = low.match(/(90|85|80|75|65|60|55|50)\s*%?/);
    return m ? `Apprentice – ${m[1]}%` : 'Apprentice – 50%';
  }
  if (low.includes('carpenter')) return 'Journeyman Carpenter';
  return x;
}

export function commercialCarpenterFringeApplies(occupation?: string): boolean {
  const key = normalizeOccupationLabel(occupation);
  return key === 'Journeyman Carpenter' || /^Apprentice – (90|85|80|75|65|60|55|50)%$/.test(key);
}

/** Sun–Sat column dates; header uses Saturday (last day) per Apps Script. */
export function workWeekDatesSunThroughSat(weekEnding: string): { dates: string[]; weekEndingLabel: string } {
  const weekEndingLabel = normalizeWeekEndingToSaturday(weekEnding);
  return { dates: buildWorkWeekDates(weekEnding), weekEndingLabel };
}

/** Apps Script computeJobPayrollNumber_: 01-based week index from first job time week. */
export function computeJobPayrollNumber(
  sortedWeekEndings: string[],
  targetWeekEnding: string,
  firstJobWeekEnding?: string,
): string {
  const target = startOfWeekSunday(parseCprLocalDate(normalizeWeekEndingToSaturday(targetWeekEnding)));
  let firstStart: Date | null = null;

  if (firstJobWeekEnding) {
    firstStart = startOfWeekSunday(parseCprLocalDate(normalizeWeekEndingToSaturday(firstJobWeekEnding)));
  } else if (sortedWeekEndings.length) {
    firstStart = startOfWeekSunday(parseCprLocalDate(normalizeWeekEndingToSaturday(sortedWeekEndings[0])));
  }

  if (!firstStart) return '01';

  const weeksFromStart = Math.round((target.getTime() - firstStart.getTime()) / (7 * 86400000));
  return String(Math.max(1, weeksFromStart + 1)).padStart(2, '0');
}

export function formatCprShortDate(iso: string): string {
  const d = parseCprLocalDate(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function calculateProjectGross(stHours: number, otHours: number, stRate: number, otRate: number): number {
  return round2((stHours || 0) * (stRate || 0) + (otHours || 0) * (otRate || 0));
}

export interface CprPage1Row {
  name: string;
  address: string;
  occupation: string;
  stHours: number[];
  otHours: number[];
  totalSt: number;
  totalOt: number;
  stRate: number;
  otRate: number;
  projectGross: number;
  weekGross: number;
  ficaMed: number;
  fedStateTax: number;
  unionDues: number;
  vacationDeduction: number;
  totalDeductions: number;
  netPay: number;
}

export function buildCprPage1Row(input: {
  entry: CertifiedPayrollEntry;
  weekDates: string[];
  adp?: AdpPayrollDetail;
  displayName?: string;
  address?: string;
  occupation?: string;
}): CprPage1Row {
  const override = getEmployeeCprOverride(input.entry.employeeName, input.displayName);
  const occupation = normalizeOccupationLabel(
    override?.occupation || input.occupation || input.entry.classification,
  );
  const dayMap = new Map(input.entry.dailyHours.map(d => [d.workDate.slice(0, 10), d]));

  const stHours = input.weekDates.map(date => dayMap.get(date)?.regularHours ?? 0);
  const otHours = input.weekDates.map(date => {
    const day = dayMap.get(date);
    return (day?.overtimeHours ?? 0) + (day?.doubleTimeHours ?? 0);
  });

  const totalSt = input.entry.regularHours;
  const totalOt = input.entry.overtimeHours + input.entry.doubleTimeHours;
  const stRate = input.adp?.regularRate ?? input.entry.baseRate ?? 0;
  const otRate = input.adp?.overtimeRate ?? (stRate ? stRate * 1.5 : 0);
  const projectGross = calculateProjectGross(totalSt, totalOt, stRate, otRate);
  const weekGross = input.adp?.grossPay ?? input.entry.grossPackage ?? projectGross;

  const unionDues = input.adp?.unionDues ?? 0;
  const vacationDeduction = input.adp?.vacationDeduction ?? 0;
  const hasAdpDeductions = !!(input.adp?.socialSecurity || input.adp?.medicare || input.adp?.federalIncomeTax
    || input.adp?.stateTaxKs || input.adp?.stateTaxMo || input.adp?.unionDues || input.adp?.vacationDeduction || input.adp?.netPay);
  const ficaMedFallback = weekGross > 0 ? round2(weekGross * 0.0765) : 0;
  const fedStateFallback = weekGross > 0 ? round2(Math.max(0, weekGross * 0.12)) : 0;
  const ficaMed = (input.adp?.socialSecurity ?? 0) + (input.adp?.medicare ?? 0) || (!hasAdpDeductions ? ficaMedFallback : 0);
  const fedStateTax = (input.adp?.federalIncomeTax ?? 0) + (input.adp?.stateTaxKs ?? 0) + (input.adp?.stateTaxMo ?? 0)
    || (!hasAdpDeductions ? fedStateFallback : 0);
  const totalDeductions = ficaMed + fedStateTax + unionDues + vacationDeduction;
  const netPay = input.adp?.netPay ?? Math.max(0, weekGross - totalDeductions);

  return {
    name: override?.displayName || input.displayName || input.entry.employeeName,
    address: input.address || '—',
    occupation,
    stHours,
    otHours,
    totalSt,
    totalOt,
    stRate,
    otRate,
    projectGross,
    weekGross,
    ficaMed,
    fedStateTax,
    unionDues,
    vacationDeduction,
    totalDeductions,
    netPay,
  };
}

export function buildCprPage2Row(entry: CertifiedPayrollEntry, displayName?: string) {
  const override = getEmployeeCprOverride(entry.employeeName, displayName);
  const occupation = normalizeOccupationLabel(override?.occupation || entry.classification);
  const name = override?.displayName || displayName || entry.employeeName;

  if (!commercialCarpenterFringeApplies(occupation)) {
    return {
      name,
      healthWelfare: 0,
      pension: 0,
      vacation: 0,
      holiday: 0,
      apprenticeTraining: 0,
      otherC: 0,
      otherD: 0,
      total: 0,
      explanation: `${occupation} — not covered by the KC1 Commercial Carpenter fringe table`,
      planName: '',
    };
  }

  const fringe = fringeRateForClassification(occupation);
  if (!fringe) {
    return {
      name,
      healthWelfare: 0,
      pension: 0,
      vacation: 0,
      holiday: 0,
      apprenticeTraining: 0,
      otherC: 0,
      otherD: 0,
      total: 0,
      explanation: occupation,
      planName: '—',
    };
  }

  return {
    name,
    healthWelfare: fringe.healthWelfare,
    pension: fringe.pension,
    vacation: 0,
    holiday: 0,
    apprenticeTraining: fringe.apprenticeTraining,
    otherC: fringe.iaf + fringe.citf + fringe.annuity,
    otherD: 0,
    total: fringe.totalEmployer,
    explanation: 'Other A: Union Dues, Other C: IAF / CITF / Annuity, Other B: Vacation',
    planName: 'Mid American Carpenters Union',
  };
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
