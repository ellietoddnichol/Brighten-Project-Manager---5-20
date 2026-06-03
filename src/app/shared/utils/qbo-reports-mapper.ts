import { Project } from '@app/models/types';
import { QboReportRecord } from '@app/data/qbo-reports.types';

function marginToPercent(value: number | null | undefined): number | undefined {
  if (value == null || Number.isNaN(value)) return undefined;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

/** Map merged QBO Projects + WIP report rows onto app project fields. */
export function qboRecordToProjectUpdate(
  record: QboReportRecord,
  syncedAt: string,
): Partial<Project> {
  const wip = record.wipReport;
  const projects = record.projectsReport;

  const billedToDate = wip?.totalActIncome ?? projects?.income ?? undefined;
  const actualCostToDate = wip?.totalActCosts ?? projects?.cost ?? undefined;
  const forecastGP = wip?.profit ?? undefined;
  const forecastMargin = marginToPercent(wip?.profitMargin ?? projects?.profitMargin);
  const overUnderBilled = wip?.difference ?? undefined;
  const earnedRevenue = billedToDate;

  const update: Partial<Project> = {
    qboSyncedAt: syncedAt,
    qboProjectLabel: record.qboLabel,
  };

  if (billedToDate != null) update.billedToDate = billedToDate;
  if (actualCostToDate != null) update.actualCostToDate = actualCostToDate;
  if (forecastGP != null) update.forecastGP = forecastGP;
  if (forecastMargin != null) update.forecastMargin = forecastMargin;
  if (overUnderBilled != null) update.overUnderBilled = overUnderBilled;
  if (earnedRevenue != null) update.earnedRevenue = earnedRevenue;
  if (record.customer) update.customer = record.customer;
  if (projects?.startDate) update.startDate = projects.startDate;
  if (projects?.endDate) update.targetCompletionDate = projects.endDate;

  if (projects?.income != null) update.qboProjectsIncome = projects.income;
  if (projects?.cost != null) update.qboProjectsCost = projects.cost;
  if (wip?.totalActIncome != null) update.qboWipActIncome = wip.totalActIncome;
  if (wip?.totalActCosts != null) update.qboWipActCosts = wip.totalActCosts;
  if (wip?.profit != null) update.qboWipProfit = wip.profit;
  if (wip?.difference != null) update.qboWipDifference = wip.difference;

  return update;
}
