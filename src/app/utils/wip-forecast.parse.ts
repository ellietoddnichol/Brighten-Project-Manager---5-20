import { Project } from '../models/types';
import { WipForecastArRow, WipForecastProjectRow } from '../models/wip-forecast.types';

export function normalizeWipForecastCustomer(name?: string): string | undefined {
  if (!name?.trim()) return undefined;
  return name.trim().replace(/Contruction/i, 'Construction');
}

export function isWaitingOnArStatus(status?: string): boolean {
  return status?.trim().toLowerCase() === 'waiting on a/r';
}

export function isPreConStatus(status?: string): boolean {
  const s = status?.trim().toLowerCase();
  return s === 'precon' || s === 'pre con';
}

export function wipForecastImportKey(jobNumber: string): string {
  return `wip-forecast-${jobNumber}`;
}

export function arForecastImportKey(jobNumber: string): string {
  return `wip-forecast-ar-${jobNumber}`;
}

export function projectPatchFromWipForecastRow(row: WipForecastProjectRow): Partial<Project> {
  const contract = row.contractBudget;
  const billed = row.cumulativeBilledEarned;
  const patch: Partial<Project> = {
    customer: normalizeWipForecastCustomer(row.customer),
    originalContractAmount: contract,
    fullContractReference: contract,
    billedToDate: billed,
    currentAR: row.openAr,
    wipLeftToBill: row.remainingBacklog,
    actualCostToDate: row.cogs2026Ytd,
    forecastGP: row.grossProfit2026,
    forecastMargin: row.gpMargin2026,
    selfPerformedAmount: row.selfLabor,
    subcontractorAmount: row.subcontractors,
    estMaterialCost: row.materials,
    estEquipmentCost: row.equipmentOther,
    startDate: row.startDate,
    targetCompletionDate: row.endDate,
    billings2026Ytd: row.billings2026Ytd,
    contractSource: row.contractSource,
    forecastTreatment: row.forecastTreatment,
    forecastLowPct: row.forecastLowPct,
    forecastBasePct: row.forecastBasePct,
    forecastHighPct: row.forecastHighPct,
    projected2026Low: row.projected2026Low,
    projected2026Base: row.projected2026Base,
    projected2026High: row.projected2026High,
    openApIdentified: row.openApIdentified,
    wipForecastNotes: row.notes,
    wipForecastImportedAt: new Date().toISOString(),
  };

  if (contract && contract > 0 && billed != null) {
    patch.wipPercentComplete = Math.min(Math.max(billed / contract, 0), 1);
    patch.earnedRevenue = billed;
  }

  if (isWaitingOnArStatus(row.status)) {
    patch.wipGroupOverride = 'CloseoutAR';
  } else if (isPreConStatus(row.status)) {
    patch.wipGroupOverride = 'UpcomingWIP';
  }

  return patch;
}

export function derivePrimaryAgingBucket(row: WipForecastArRow): 'Current' | '1-30' | '31-60' | '61-90' | '90+' {
  const buckets: Array<{ key: keyof WipForecastArRow; label: 'Current' | '1-30' | '31-60' | '61-90' | '90+' }> = [
    { key: 'days90Plus', label: '90+' },
    { key: 'days61To90', label: '61-90' },
    { key: 'days31To60', label: '31-60' },
    { key: 'days1To30', label: '1-30' },
    { key: 'currentAmount', label: 'Current' },
  ];
  for (const b of buckets) {
    const v = row[b.key];
    if (typeof v === 'number' && v > 0) return b.label;
  }
  return 'Current';
}

export function projectNameFromForecastRow(row: WipForecastProjectRow): string {
  if (row.projectName?.trim()) return row.projectName.trim();
  const label = row.projectLabel ?? '';
  const dash = label.indexOf(' - ');
  return dash >= 0 ? label.slice(dash + 3).trim() : label.trim();
}
