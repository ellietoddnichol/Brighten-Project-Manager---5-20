import { Project, ChangeOrder, Billing, ProjectFile, RequiredDocument, ProjectIssue, ProjectTask } from '../models/types';

export interface ProjectFinancialSummary {
  originalContract: number;
  approvedCOs: number;
  revisedContract: number;
  billedToDate: number;
  leftToBill: number;
  estimatedCost: number;
  actualCost: number;
  costToComplete: number;
  projectedFinalCost: number;
  leftInBudget: number;
  projectedProfit: number;
  projectedMargin: number;
  percentComplete: number;
  earnedRevenue: number;
  overUnderBilling: number;
}

export interface ProjectException {
  id: string;
  projectId: string;
  title: string;
  description: string;
  type: string;
  severity: 'warning' | 'error';
  projectName?: string;
}

export function calculateRevisedContract(originalContract: number, approvedCOs: ChangeOrder[]): number {
  const approved = approvedCOs.filter(co => co.status === 'Approved').reduce((acc, co) => acc + (co.approvedAmount || 0), 0);
  return (originalContract || 0) + approved;
}

export function calculateLeftToBill(revisedContract: number, billedToDate: number): number {
  return (revisedContract || 0) - (billedToDate || 0);
}

export function calculateProjectedFinalCost(actualCost: number, costToComplete: number): number {
  return (actualCost || 0) + (costToComplete || 0);
}

export function calculateProjectedProfit(revisedContract: number, projectedFinalCost: number): number {
  return (revisedContract || 0) - (projectedFinalCost || 0);
}

export function calculateProjectedMargin(projectedProfit: number, revisedContract: number): number {
  if (!revisedContract) return 0;
  return (projectedProfit / revisedContract) * 100;
}

export function calculatePercentComplete(actualCost: number, estimatedCost: number): number {
  if (!estimatedCost) return 0;
  return Math.min(((actualCost || 0) / estimatedCost) * 100, 100);
}

export function calculateEarnedRevenue(percentComplete: number, revisedContract: number): number {
  return (percentComplete / 100) * (revisedContract || 0);
}

export function calculateOverUnderBilling(billedToDate: number, earnedRevenue: number): number {
  return (billedToDate || 0) - (earnedRevenue || 0);
}

export function getProjectFinancialSummary(project: Project | null, changeOrders: ChangeOrder[], billings: Billing[]): ProjectFinancialSummary {
  const originalContract = project?.originalContractAmount || 0;
  const approvedCOsTotal = changeOrders.filter(co => co.status === 'Approved').reduce((acc, co) => acc + (co.approvedAmount || 0), 0);
  const revisedContract = originalContract + approvedCOsTotal;
  
  const billedToDate = billings.filter(b => b.status === 'Approved' || b.status === 'Paid' || b.status === 'Past Due').reduce((acc, b) => acc + (b.totalBilledToDate || 0), 0); 
  const totalBilled = project?.billedToDate || billedToDate;

  const leftToBill = revisedContract - totalBilled;
  
  const estimatedCost = (project?.estLaborCost || 0) + (project?.estMaterialCost || 0) + (project?.estSubCost || 0) + (project?.estEquipmentCost || 0) + (project?.estOtherCost || 0);
  const actualCost = project?.actualCostToDate || 0;
  
  const costToComplete = Math.max(0, estimatedCost - actualCost);
  
  const projectedFinalCost = actualCost + costToComplete;
  const leftInBudget = estimatedCost - actualCost;
  
  const projectedProfit = revisedContract - projectedFinalCost;
  const projectedMargin = revisedContract ? (projectedProfit / revisedContract) * 100 : 0;
  
  const percentComplete = estimatedCost ? (actualCost / estimatedCost) * 100 : 0;
  const earnedRevenue = (percentComplete / 100) * revisedContract;
  const overUnderBilling = totalBilled - earnedRevenue;
  
  return {
    originalContract,
    approvedCOs: approvedCOsTotal,
    revisedContract,
    billedToDate: totalBilled,
    leftToBill,
    estimatedCost,
    actualCost,
    costToComplete,
    projectedFinalCost,
    leftInBudget,
    projectedProfit,
    projectedMargin,
    percentComplete,
    earnedRevenue,
    overUnderBilling
  };
}

export function getProjectExceptions(
  project: Project, 
  summary: ProjectFinancialSummary, 
  changeOrders: ChangeOrder[], 
  billings: Billing[],
  files: ProjectFile[] = [],
  reqDocs: RequiredDocument[] = [],
  issues: ProjectIssue[] = [],
  tasks: ProjectTask[] = []
): ProjectException[] {
  const exceptions: ProjectException[] = [];
  
  if (summary.leftInBudget < 0) {
    exceptions.push({
      id: `budget-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'Project Over Budget',
      description: `Left in budget is negative: $${summary.leftInBudget.toFixed(2)}`,
      type: 'Budget',
      severity: 'error'
    });
  }
  
  if (summary.projectedMargin < 10 && summary.revisedContract > 0) { 
    exceptions.push({
      id: `margin-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'Low Projected Margin',
      description: `Projected margin is below target: ${summary.projectedMargin.toFixed(1)}%`,
      type: 'Budget',
      severity: 'warning'
    });
  }
  
  const submittedCOs = changeOrders.filter(co => co.status === 'Submitted');
  if (submittedCOs.length > 0) {
    exceptions.push({
      id: `co-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'Unapproved Change Orders',
      description: `${submittedCOs.length} change order(s) submitted but not approved.`,
      type: 'CO',
      severity: 'warning'
    });
  }
  
  const pastDueBillings = billings.filter(b => b.status === 'Past Due');
  if (pastDueBillings.length > 0) {
    exceptions.push({
      id: `billing-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'Past Due Billing',
      description: `${pastDueBillings.length} invoice(s) are past due.`,
      type: 'Billing',
      severity: 'error'
    });
  }
  
  if (summary.leftToBill > 0 && (project.status === 'Closeout' || project.status === 'Closed')) {
    exceptions.push({
      id: `leftbill-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'Left to Bill on Closed Project',
      description: `Project is ${project.status} but still has $${summary.leftToBill.toFixed(2)} left to bill.`,
      type: 'Billing',
      severity: 'error'
    });
  }
  
  if (!project.driveFolderId && !project.driveFolderUrl) {
    exceptions.push({
      id: `drive-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'Missing Drive Folder',
      description: `No Google Drive folder linked.`,
      type: 'Setup',
      severity: 'warning'
    });
  }

  if (!project.googleSheetId && !project.googleSheetUrl) {
    exceptions.push({
      id: `sheet-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'Missing Budget Sheet',
      description: `No Google Sheet linked for budget.`,
      type: 'Setup',
      severity: 'warning'
    });
  }
  
  // Phase 3 Documents & Issues Exceptions
  const missingReqDocs = reqDocs.filter(r => r.status === 'Needed' || r.status === 'Requested');
  if (missingReqDocs.length > 0) {
    exceptions.push({
      id: `miss-doc-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'Missing Required Documents',
      description: `${missingReqDocs.length} required document(s) are missing.`,
      type: 'Document',
      severity: 'warning'
    });
  }

  const expiredDocs = reqDocs.filter(r => {
    if (r.status === 'Expired') return true;
    if (r.expirationDate && new Date(r.expirationDate) < new Date()) return true;
    return false;
  });
  if (expiredDocs.length > 0) {
    exceptions.push({
      id: `exp-doc-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'Expired Documents',
      description: `${expiredDocs.length} document(s) have expired.`,
      type: 'Document',
      severity: 'error'
    });
  }

  const activeIssues = issues.filter(i => (i.status === 'Open' || i.status === 'Waiting') && (i.priority === 'High' || i.priority === 'Critical'));
  if (activeIssues.length > 0) {
    exceptions.push({
      id: `high-issue-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'High Priority Issues',
      description: `${activeIssues.length} open high/critical issues require attention.`,
      type: 'Issue',
      severity: 'error'
    });
  }

  const overdueTasks = tasks.filter(t => t.status !== 'Complete' && t.status !== 'Canceled' && t.dueDate && new Date(t.dueDate) < new Date());
  if (overdueTasks.length > 0) {
    exceptions.push({
      id: `due-task-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'Overdue Tasks',
      description: `${overdueTasks.length} task(s) are overdue.`,
      type: 'Task',
      severity: 'warning'
    });
  }

  return exceptions;
}
