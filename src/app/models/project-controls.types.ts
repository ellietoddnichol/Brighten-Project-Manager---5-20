/** Construction project controls — change requests, RFIs, submittals, daily logs. */

export type ChangeRequestStatus =
  | 'Draft'
  | 'Submitted'
  | 'Pricing'
  | 'Needs Backup'
  | 'Converted'
  | 'Void'
  /** @deprecated legacy — mapped to Pricing/Sent in UI */
  | 'Sent to GC/Owner'
  | 'Approved'
  | 'Rejected'
  | 'Billed';

export type ChangeRequestSource =
  | 'Owner'
  | 'GC'
  | 'Architect'
  | 'Field'
  | 'Subcontractor'
  | 'Internal'
  | 'Unknown';

export type ChangeRequestType =
  | 'Scope Add'
  | 'Scope Delete'
  | 'Field Condition'
  | 'Design Change'
  | 'T&M'
  | 'Allowance'
  | 'Schedule Impact'
  | 'Other';

export type ChangeRequestUrgency = 'Normal' | 'High' | 'Critical';

export type ChangeOrderStatus =
  | 'Draft'
  | 'Pricing'
  | 'Needs Backup'
  | 'Sent'
  | 'Approved'
  | 'Rejected'
  | 'Void'
  | 'Billed'
  /** @deprecated legacy values — normalized in change-management utils */
  | 'Submitted'
  | 'Sent to GC/Owner'
  | 'Internal Review'
  | 'Need Pricing';

export type RfiStatus = 'Draft' | 'Submitted' | 'Answered' | 'Closed' | 'Void';

export type RfiPriority = 'Normal' | 'High' | 'Critical';

export type SubmittalStatus =
  | 'Needed'
  | 'Draft'
  | 'Submitted'
  | 'Approved'
  | 'Approved as Noted'
  | 'Revise and Resubmit'
  | 'Rejected'
  | 'Closed'
  | 'Void';

export type DailyLogStatus = 'Draft' | 'Submitted' | 'Approved' | 'Void';

export type FieldIssueType =
  | 'Quality'
  | 'Safety'
  | 'Field Condition'
  | 'Coordination'
  | 'Delay'
  | 'Damage'
  | 'Other';

export type FieldIssueStatus = 'Open' | 'In Review' | 'Converted' | 'Closed' | 'Void';

export type FieldIssuePriority = 'Low' | 'Normal' | 'High' | 'Critical';

export type ProjectTaskGroup =
  | 'Setup'
  | 'Contract / Compliance'
  | 'Field Operations'
  | 'Changes'
  | 'RFIs'
  | 'Submittals'
  | 'Budget / POs'
  | 'Billing / Pay Apps'
  | 'Certified Payroll'
  | 'Subcontractors'
  | 'Closeout';

export type ProjectTaskSource = 'manual' | 'system';

export interface ChangeRequest {
  id: string;
  projectId: string;
  projectNumber?: string;
  projectName?: string;
  /** @deprecated use changeRequestNumber */
  crNumber?: string;
  changeRequestNumber?: string;
  title?: string;
  description?: string;
  /** @deprecated use requestedDate */
  requestDate?: string;
  requestedDate?: string;
  requestedBy?: string;
  source?: ChangeRequestSource;
  changeType?: ChangeRequestType;
  reason?: string;
  /** @deprecated use location */
  locationArea?: string;
  location?: string;
  /** @deprecated split refs */
  drawingSpecReference?: string;
  drawingReference?: string;
  specReference?: string;
  laborNeeded?: string;
  materialNeeded?: string;
  subcontractorNeeded?: string;
  scheduleImpact?: string;
  costImpactKnown?: boolean;
  scheduleImpactKnown?: boolean;
  daysAdded?: number;
  /** @deprecated use urgency */
  urgent?: boolean;
  urgency?: ChangeRequestUrgency;
  status: ChangeRequestStatus;
  linkedChangeOrderId?: string;
  linkedRfiId?: string;
  linkedDailyLogId?: string;
  linkedSubmittalId?: string;
  linkedFieldIssueId?: string;
  /** @deprecated URL list — prefer attachmentIds */
  attachmentUrls?: string[];
  attachmentIds?: string[];
  /** @deprecated use internalNotes */
  notes?: string;
  internalNotes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  ownerId?: string;
}

export interface Rfi {
  id: string;
  projectId: string;
  projectNumber?: string;
  projectName?: string;
  rfiNumber?: string;
  title?: string;
  question?: string;
  reason?: string;
  location?: string;
  /** @deprecated */
  locationDrawingReference?: string;
  drawingReference?: string;
  specReference?: string;
  submittedBy?: string;
  assignedTo?: string;
  /** @deprecated */
  dateSubmitted?: string;
  submittedDate?: string;
  /** @deprecated */
  neededByDate?: string;
  dueDate?: string;
  answeredDate?: string;
  answer?: string;
  status: RfiStatus;
  priority?: RfiPriority;
  costImpact?: boolean;
  scheduleImpact?: boolean;
  daysAdded?: number;
  linkedChangeRequestId?: string;
  linkedChangeOrderId?: string;
  /** @deprecated */
  attachmentUrls?: string[];
  attachmentIds?: string[];
  responseDocumentIds?: string[];
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  ownerId?: string;
}

export interface Submittal {
  id: string;
  projectId: string;
  projectNumber?: string;
  projectName?: string;
  submittalNumber?: string;
  specSection?: string;
  title?: string;
  description?: string;
  /** @deprecated */
  vendorSubcontractor?: string;
  vendor?: string;
  subcontractor?: string;
  linkedPoId?: string;
  linkedPOId?: string;
  packageName?: string;
  requiredDate?: string;
  dueDate?: string;
  /** @deprecated */
  dateSubmitted?: string;
  submittedDate?: string;
  returnedDate?: string;
  status: SubmittalStatus;
  ballInCourt?: string;
  leadTimeDays?: number;
  materialReleaseRequired?: boolean;
  materialReleasedDate?: string;
  costImpact?: boolean;
  scheduleImpact?: boolean;
  linkedChangeRequestId?: string;
  linkedMaterialItem?: string;
  /** @deprecated */
  attachmentUrls?: string[];
  attachmentIds?: string[];
  returnedDocumentIds?: string[];
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  ownerId?: string;
}

export interface DailyLog {
  id: string;
  projectId: string;
  projectNumber?: string;
  projectName?: string;
  logDate: string;
  submittedBy?: string;
  foreman?: string;
  weather?: string;
  temperature?: string;
  crewCount?: number;
  /** @deprecated */
  crewOnSite?: string;
  employeesOnSite?: string;
  subcontractorsOnSite?: string;
  visitors?: string;
  workPerformed?: string;
  areasWorked?: string;
  materialsDelivered?: string;
  equipmentUsed?: string;
  delays?: string;
  safetyIssues?: string;
  inspections?: string;
  notes?: string;
  /** @deprecated */
  photoUrls?: string[];
  photos?: string[];
  photoIds?: string[];
  potentialChange?: boolean;
  costImpact?: boolean;
  scheduleImpact?: boolean;
  linkedChangeRequestId?: string;
  linkedRfiId?: string;
  linkedFieldIssueId?: string;
  status?: DailyLogStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
  ownerId?: string;
}

export interface FieldIssue {
  id: string;
  projectId: string;
  projectNumber?: string;
  projectName?: string;
  title: string;
  description?: string;
  location?: string;
  reportedBy?: string;
  reportedDate?: string;
  issueType?: FieldIssueType;
  priority?: FieldIssuePriority;
  status: FieldIssueStatus;
  costImpact?: boolean;
  scheduleImpact?: boolean;
  photoIds?: string[];
  linkedDailyLogId?: string;
  linkedRfiId?: string;
  linkedChangeRequestId?: string;
  assignedTo?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  ownerId?: string;
}

export const CHANGE_REQUEST_STATUSES: ChangeRequestStatus[] = [
  'Draft', 'Submitted', 'Pricing', 'Needs Backup', 'Converted', 'Void',
];

export const CHANGE_ORDER_STATUSES: ChangeOrderStatus[] = [
  'Draft', 'Pricing', 'Needs Backup', 'Sent', 'Approved', 'Rejected', 'Void', 'Billed',
];

export const PROJECT_TASK_GROUPS: ProjectTaskGroup[] = [
  'Setup', 'Contract / Compliance', 'Field Operations', 'Changes', 'RFIs',
  'Submittals', 'Budget / POs', 'Billing / Pay Apps', 'Certified Payroll', 'Subcontractors', 'Closeout',
];

/** @deprecated Use DRIVE_FOLDER_MAPPING_RULES from drive-folder-mapping.types */
export { PROJECT_FOLDER_KEYS } from './drive-folder-mapping.types';
