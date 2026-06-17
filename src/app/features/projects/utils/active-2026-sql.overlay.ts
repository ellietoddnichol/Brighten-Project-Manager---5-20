import { Project } from '@app/models/types';
import { Active2026ControlRow } from '@app/models/active-2026-control.types';
import { HomePriorityItem } from '@shared/utils/home-hub.compute';
import { mapDashboardRowToProject } from '@core/services/api/project-api.mapper';
import { ProjectDashboardApiRow } from '@core/services/api/project-api.types';

function normalizeJob(job: string | undefined): string {
  return (job ?? '').replace(/^J/i, '').trim();
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Prefer SQL dashboard shell fields; keep Firestore-computed financials when SQL lacks them. */
export function mergeSqlProjectsForControl(
  firestoreProjects: Project[],
  dashboardRows: ProjectDashboardApiRow[],
): Project[] {
  if (!dashboardRows.length) return firestoreProjects;

  const byId = new Map(dashboardRows.map(row => [row.id, mapDashboardRowToProject(row)]));
  const byJob = new Map(
    dashboardRows.map(row => [normalizeJob(row.job_number), mapDashboardRowToProject(row)]),
  );

  const merged = firestoreProjects.map(project => {
    const sql =
      byId.get(project.id)
      ?? byJob.get(normalizeJob(project.projectNumber));
    if (!sql) return project;
    return {
      ...project,
      projectName: sql.projectName || project.projectName,
      customer: sql.customer || project.customer,
      status: sql.status || project.status,
      originalContractAmount: sql.originalContractAmount ?? project.originalContractAmount,
      billedToDate: sql.billedToDate ?? project.billedToDate,
      driveFolderId: sql.driveFolderId ?? project.driveFolderId,
      driveFolderUrl: sql.driveFolderUrl ?? project.driveFolderUrl,
      superintendent: sql.superintendent ?? project.superintendent,
    };
  });

  for (const row of dashboardRows) {
    const job = normalizeJob(row.job_number);
    const exists = merged.some(
      p => p.id === row.id || normalizeJob(p.projectNumber) === job,
    );
    if (!exists) {
      merged.push(mapDashboardRowToProject(row));
    }
  }

  return merged;
}

/** Overlay SQL billing/AR fields and action-center next actions onto control rows. */
export function overlaySqlOnControlRows(
  rows: Active2026ControlRow[],
  dashboardRows: ProjectDashboardApiRow[],
  priorities: HomePriorityItem[],
): Active2026ControlRow[] {
  if (!dashboardRows.length && !priorities.length) return rows;

  const dashByProject = new Map(dashboardRows.map(r => [r.id, r]));
  const dashByJob = new Map(dashboardRows.map(r => [normalizeJob(r.job_number), r]));
  const actionByProject = new Map(
    priorities.filter(p => p.projectId).map(p => [p.projectId!, p]),
  );
  const actionByJob = new Map(
    priorities.filter(p => p.jobNumber).map(p => [normalizeJob(p.jobNumber), p]),
  );

  return rows.map(row => {
    const dash =
      dashByProject.get(row.projectId)
      ?? dashByJob.get(normalizeJob(row.jobNumber));
    const action =
      actionByProject.get(row.projectId)
      ?? actionByJob.get(normalizeJob(row.jobNumber));

    let next = row.nextAction;
    if (action?.nextActionLabel && action.route) {
      next = {
        label: action.nextActionLabel,
        route: action.route,
        fragment: action.fragment,
      };
    }

    if (!dash) {
      return action ? { ...row, nextAction: next } : row;
    }

    const ar = num(dash.latest_ar_total);
    const billed = num(dash.billed_to_date);
    const left = num(dash.balance_to_bill);
    const contract = num(dash.revised_contract_amount) ?? num(dash.original_contract_amount);

    return {
      ...row,
      projectName: dash.project_name || row.projectName,
      customer: dash.customer ?? row.customer,
      arBalance: ar ?? row.arBalance,
      billedToDate: billed ?? row.billedToDate,
      leftToBill: left ?? row.leftToBill,
      currentContract: contract ?? row.currentContract,
      billingStatus: dash.billing_status
        ? String(dash.billing_status)
        : row.billingStatus,
      nextAction: next,
    };
  });
}
