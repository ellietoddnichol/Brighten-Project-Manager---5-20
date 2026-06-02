import { SeedCompletenessGap } from '../models/project-lifecycle.types';
import { DocumentFileCategory } from '../models/project-documents.types';
import { Project } from '../models/types';
import { ActionItem } from './action-items';

export interface SetupMissingItem {
  id: string;
  label: string;
  fileCategory: DocumentFileCategory;
  actionLabel: string;
}

function setupGapActionLabel(gap: SeedCompletenessGap): string {
  switch (gap.field) {
    case 'driveFolderId':
      return 'Link Drive folder';
    case 'projectProfile':
    case 'address':
    case 'foreman':
    case 'wageOrderNumber':
    case 'customer':
      return 'Open Job Record';
    case 'originalContractAmount':
    case 'totalBudget':
    case 'estLaborCost':
    case 'estSubCost':
      return 'Add contract & budget';
    case 'billingHistory':
      return 'Open billing';
    case 'arStatus':
      return 'Open AR';
    case 'actualCostSummary':
      return 'Review costs';
    default:
      return 'Complete setup';
  }
}

function setupGapDescription(gap: SeedCompletenessGap): string {
  if (gap.blocksWorkflow) {
    return `${gap.label} is required before this job can run cleanly in Active 2026.`;
  }
  return `${gap.label} is missing from the job record.`;
}

export function setupGapActionItems(project: Project, gaps: SeedCompletenessGap[]): ActionItem[] {
  return gaps.map(gap => ({
    id: `setup-gap-${project.id}-${gap.field}`,
    projectId: project.id,
    projectName: project.projectName,
    title: gap.label,
    description: setupGapDescription(gap),
    type: 'Setup',
    severity: gap.blocksWorkflow ? 'error' : 'warning',
  }));
}

export function setupGapsToMissingRequired(gaps: SeedCompletenessGap[]): SetupMissingItem[] {
  return gaps.map(gap => ({
    id: `setup-${gap.field}`,
    label: gap.label,
    fileCategory: 'Other',
    actionLabel: setupGapActionLabel(gap),
  }));
}
