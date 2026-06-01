export type LaborActualSource = 'TimeLog' | 'Manual' | 'Imported';
export type LaborActualApprovalStatus = 'Approved' | 'Pending' | 'Rejected';

export interface ProjectLaborActual {
  id: string;
  projectId: string;
  jobNumber?: string;
  projectName?: string;
  employeeId?: string;
  employeeName?: string;
  workDate: string;
  weekStart: string;
  weekEnd: string;
  classification?: string;
  laborCode?: string;
  costCode?: string;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  totalHours: number;
  baseRate?: number;
  fringeRate?: number;
  burdenRate?: number;
  totalLaborCost: number;
  sourceTimeLogIds?: string[];
  approvalStatus: LaborActualApprovalStatus;
  source: LaborActualSource;
  createdAt?: unknown;
  updatedAt?: unknown;
  ownerId?: string;
}
