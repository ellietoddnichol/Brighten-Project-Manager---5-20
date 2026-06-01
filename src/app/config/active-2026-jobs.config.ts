/** Active 2026 Job Control List — default scope for Projects and Active WIP. */

export const BRIGHTEN_PROFIT_TARGET = 0.2;
export const BRIGHTEN_COST_BUDGET_RATIO = 1 - BRIGHTEN_PROFIT_TARGET;

export type JobBudgetType =
  | 'FullConstruction'
  | 'SmallInstall'
  | 'TmDemoRepair'
  | 'SpecialtySubHeavy';

export interface Active2026JobMeta {
  jobNumber: string;
  project: string;
  focus: string;
  budgetType: JobBudgetType;
}

/** Percentages of the 80% cost budget (not contract value). */
export const BUDGET_CATEGORY_SPLITS: Record<
  JobBudgetType,
  { labor: number; subs: number; materials: number; equipmentOther: number }
> = {
  FullConstruction: { labor: 0.25, subs: 0.40, materials: 0.25, equipmentOther: 0.10 },
  SmallInstall: { labor: 0.35, subs: 0.05, materials: 0.55, equipmentOther: 0.05 },
  TmDemoRepair: { labor: 0.55, subs: 0.15, materials: 0.10, equipmentOther: 0.20 },
  SpecialtySubHeavy: { labor: 0.25, subs: 0.50, materials: 0.20, equipmentOther: 0.05 },
};

export const ACTIVE_2026_JOBS: Active2026JobMeta[] = [
  { jobNumber: '158', project: 'Blue Valley CTE 2026', focus: 'Contract, budget, labor, CPR if required, billing, WIP', budgetType: 'FullConstruction' },
  { jobNumber: '186', project: 'LVV 3 & 5', focus: 'Heavy subs, labor budget, actual cost, WIP, foreman bonus', budgetType: 'FullConstruction' },
  { jobNumber: '189', project: 'Topeka VAMC - Anesthesia Unit', focus: 'Contract, CPR/prevailing wage check, billing, WIP', budgetType: 'FullConstruction' },
  { jobNumber: '193', project: 'Pulse Design 9th Floor', focus: 'Budget, subs, actual cost, billing closeout', budgetType: 'FullConstruction' },
  { jobNumber: '197', project: 'Administrative Hallway Reno', focus: 'T&M/small job tracking, labor, billing', budgetType: 'TmDemoRepair' },
  { jobNumber: '204', project: 'LightEdge Data Center', focus: 'Full WIP, budget, subs, pay apps, long-term forecast', budgetType: 'FullConstruction' },
  { jobNumber: '206', project: 'LVV Heritage - 211A, 311A & 317A', focus: 'Subs, budget, WIP, billing, lien waivers', budgetType: 'FullConstruction' },
  { jobNumber: '208', project: 'Park Hill 2026', focus: 'Precon/upcoming WIP, contract, budget, CPR check', budgetType: 'FullConstruction' },
  { jobNumber: '209', project: 'Capital Electric Fab Shop', focus: 'Contract, budget estimate, billing, actual cost', budgetType: 'FullConstruction' },
  { jobNumber: '210', project: 'Benedictine Library Toilet Partitions', focus: 'Small install, material/labor split, billing', budgetType: 'SmallInstall' },
  { jobNumber: '212', project: 'LPS Lewis & Clark Restroom Reno', focus: 'Full job controls, submittals, subs, budget, billing', budgetType: 'FullConstruction' },
  { jobNumber: '215', project: '2306 Visitor Center', focus: 'Contract, budget estimate, billing, documents', budgetType: 'FullConstruction' },
  { jobNumber: '216', project: 'Unilever Phase II Demo', focus: 'Labor-heavy/demo tracking, budget, safety/docs', budgetType: 'TmDemoRepair' },
  { jobNumber: '217', project: 'Catalent Summer 2026 Shutdown', focus: 'Schedule-critical, labor, subs, billing', budgetType: 'FullConstruction' },
  { jobNumber: '218', project: 'Dole Grand Jury Room - Water Damage', focus: 'T&M/repair tracking, billing, photos/docs', budgetType: 'TmDemoRepair' },
  { jobNumber: '219', project: 'T&M Partitions @ Fox Ridge', focus: 'T&M billing, labor/material actuals, margin', budgetType: 'TmDemoRepair' },
  { jobNumber: '220', project: 'KC VA Medical Center', focus: 'CPR/prevailing wage check, compliance, billing', budgetType: 'FullConstruction' },
  { jobNumber: '221', project: 'Whitaker USMS Vault Door', focus: 'Specialty install, submittals, material, billing', budgetType: 'FullConstruction' },
  { jobNumber: '222', project: 'ISD Fairmount 26', focus: 'Full project, budget, labor, CPR check, billing', budgetType: 'FullConstruction' },
  { jobNumber: '223', project: 'Kearney Deferred Maint', focus: 'Budget estimate, billing, actual cost', budgetType: 'FullConstruction' },
  { jobNumber: '224', project: 'KUMC Research', focus: 'Contract, budget, compliance, WIP', budgetType: 'FullConstruction' },
  { jobNumber: '225', project: 'LV VA Bldg-89', focus: 'CPR/prevailing wage check, WIP, billing', budgetType: 'FullConstruction' },
  { jobNumber: '226', project: 'Stowers Grad Classroom Ceilings', focus: 'Subs/material/labor, submittals, billing', budgetType: 'SpecialtySubHeavy' },
  { jobNumber: '227', project: 'Dole Misc Painting 4th & 6th', focus: 'Small/T&M job, labor/sub cost, billing', budgetType: 'TmDemoRepair' },
  { jobNumber: '228', project: 'Third Space Yoga Studio', focus: 'Full private project controls, VE, contract, billing, WIP', budgetType: 'FullConstruction' },
];

export const ACTIVE_2026_JOB_NUMBERS = new Set(ACTIVE_2026_JOBS.map(j => j.jobNumber));

export function normalizeJobNumber(jobNumber?: string): string {
  const raw = (jobNumber ?? '').trim();
  if (!raw) return '';
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? String(n) : raw;
}

export function isActive2026ControlJob(jobNumber?: string): boolean {
  return ACTIVE_2026_JOB_NUMBERS.has(normalizeJobNumber(jobNumber));
}

export function active2026JobMeta(jobNumber?: string): Active2026JobMeta | undefined {
  return ACTIVE_2026_JOBS.find(j => j.jobNumber === normalizeJobNumber(jobNumber));
}

export function jobBudgetTypeFor(jobNumber?: string, billingType?: string): JobBudgetType {
  const meta = active2026JobMeta(jobNumber);
  if (meta) return meta.budgetType;
  const bt = (billingType ?? '').toLowerCase();
  if (bt.includes('t&m') || bt.includes('time')) return 'TmDemoRepair';
  return 'FullConstruction';
}
