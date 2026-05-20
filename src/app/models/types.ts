export type ProjectStatus = 'Lead / Precon' | 'Awarded' | 'Setup Needed' | 'Active' | 'Closeout' | 'Closed';
export type BillingType = 'Lump Sum' | 'T&M' | 'Progress Billing';

export interface Project {
  // Project Setup
  id: string;
  projectNumber: string;
  projectName: string;
  customer: string;
  owner?: string;
  architect?: string;
  projectManager?: string;
  superintendent?: string;
  contractType?: string;
  originalContractAmount?: number;
  retainagePercent?: number;
  taxable?: boolean;
  billingTerms?: string;
  startDate?: string;
  targetCompletionDate?: string;
  address?: string;
  scopeSummary?: string;
  requiredDocuments?: string[];
  driveFolderId?: string;
  driveFolderUrl?: string;
  googleSheetId?: string;
  googleSheetUrl?: string;
  status: ProjectStatus;

  // Budget / WIP
  estLaborCost?: number;
  estMaterialCost?: number;
  estSubCost?: number;
  estEquipmentCost?: number;
  estOtherCost?: number;
  actualCostToDate?: number;
  billedToDate?: number;

  createdAt?: any;
  updatedAt?: any;
  ownerId?: string;
}

export interface ProjectBudgetLine {
  id: string;
  projectId: string;
  costCode?: string;
  category: 'Labor' | 'Materials' | 'Subcontractors' | 'Equipment' | 'Other';
  originalBudget: number;
  approvedCOBudget: number;
  revisedBudget: number;
  actualCost: number;
  costToComplete: number;
  projectedFinalCost: number;
  variance: number;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
  ownerId?: string;
}

export interface PO {
  id: string;
  projectId: string;
  poNumber: string;
  vendor: string;
  originalAmount: number;
  status: string;
  itemsPurchased?: string;
  paymentMethod?: string;
  date?: string;
  missingPo?: boolean;
  invoiceExceedsPo?: boolean;
  createdAt?: any;
  updatedAt?: any;
  ownerId?: string;
}

export interface ChangeOrder {
  id: string;
  projectId: string;
  coNumber: string;
  title: string;
  type?: string;
  description?: string;
  reason?: string;
  requestedBy?: string;
  dateIdentified?: string;
  dateSubmitted?: string;
  dateApproved?: string;
  status: 'Draft' | 'Internal Review' | 'Submitted' | 'Approved' | 'Rejected' | 'Need Pricing' | 'Void';
  laborCost?: number;
  materialCost?: number;
  subCost?: number;
  equipmentCost?: number;
  otherCost?: number;
  costImpact?: number;
  markupPercent?: number;
  markup?: number;
  sellPrice?: number;
  approvedAmount?: number;
  billingStatus?: string;
  linkedFile?: string;
  notes?: string;
  linkedPoId?: string;
  linkedInvoiceId?: string;
  scheduleImpactDays?: number;
  createdAt?: any;
  updatedAt?: any;
  ownerId?: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  responsiblePerson?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Critical';
  dueDate?: string;
  status: 'Open' | 'Waiting' | 'Resolved' | 'Closed';
  relatedItem?: string;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
  ownerId?: string;
}

export interface DailyLog {
  id: string;
  projectId: string;
  logDate: string;
  foreman?: string;
  crewCount?: number;
  workersOnsite?: number;
  totalLaborHours?: number;
  workPerformed?: string;
  areasWorked?: string;
  materialsDelivered?: string;
  equipmentUsed?: string;
  inspections?: string;
  visitors?: string;
  delays?: boolean;
  delayReason?: string;
  safetyIssues?: boolean;
  weatherSummary?: string;
  temperature?: string;
  photos?: string[];
  relatedFileIds?: string[];
  relatedIssueIds?: string[];
  relatedTaskIds?: string[];
  potentialChangeOrder?: boolean;
  createdBy?: string;
  createdAt?: any;
  updatedAt?: any;
  notes?: string;
  ownerId?: string;
  status?: 'Draft' | 'Submitted' | 'Reviewed' | 'Archived';
  category?: string;
}

export interface Billing {
  id: string;
  projectId: string;
  payAppNumber: string;
  billingPeriod: string;
  workCompletedThisPeriod?: number;
  storedMaterials?: number;
  retainageAmount?: number;
  totalBilledToDate?: number;
  amountPaid?: number;
  paymentDate?: string;
  arStatus?: string;
  status: 'Draft' | 'Submitted' | 'Approved' | 'Paid' | 'Past Due';
  invoiceLink?: string;
  payAppLink?: string;
  createdAt?: any;
  updatedAt?: any;
  ownerId?: string;
}

export interface ScheduleMilestone {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  milestoneType: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  status: 'Not Started' | 'Upcoming' | 'In Progress' | 'Complete' | 'Delayed' | 'Canceled';
  responsiblePerson?: string;
  relatedTaskIds?: string[];
  relatedIssueIds?: string[];
  relatedFileIds?: string[];
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
  ownerId?: string;
}

export interface Document {
  id: string;
  projectId: string;
  type: string;
  status: 'Not Required' | 'Needed' | 'Requested' | 'Received' | 'Submitted' | 'Approved' | 'Expired';
  ownerId?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface ProjectFolder {
  id: string;
  projectId: string;
  folderKey: string;
  folderName: string;
  folderId?: string;
  folderUrl?: string;
  parentFolderId?: string;
  sortOrder: number;
  isRequired: boolean;
  createdAt?: any;
  updatedAt?: any;
  ownerId?: string;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  folderKey?: string;
  fileName: string;
  fileId?: string;
  fileUrl?: string;
  mimeType?: string;
  documentType: string;
  documentStatus: string;
  relatedRecordType?: string;
  relatedRecordId?: string;
  uploadedBy?: string;
  uploadedAt?: any;
  lastModifiedAt?: any;
  notes?: string;
  ownerId?: string;
  photoCategory?: string;
  takenDate?: string;
  description?: string;
  locationOrArea?: string;
  dailyLogId?: string;
  issueId?: string;
  changeOrderId?: string;
}

export interface RequiredDocument {
  id: string;
  projectId: string;
  documentType: string;
  required: boolean;
  status: string;
  dueDate?: string;
  receivedDate?: string;
  submittedDate?: string;
  approvedDate?: string;
  expirationDate?: string;
  relatedFileId?: string;
  responsiblePerson?: string;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
  ownerId?: string;
}

export interface ProjectIssue {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  category: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  status: 'Open' | 'Waiting' | 'Resolved' | 'Closed';
  responsiblePerson?: string;
  dueDate?: string;
  relatedRecordType?: string;
  relatedRecordId?: string;
  createdAt?: any;
  resolvedAt?: any;
  notes?: string;
  ownerId?: string;
}

export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  assignedTo?: string;
  dueDate?: string;
  status: 'Not Started' | 'In Progress' | 'Waiting' | 'Complete' | 'Canceled';
  priority?: 'Low' | 'Medium' | 'High' | 'Critical';
  relatedRecordType?: string;
  relatedRecordId?: string;
  createdAt?: any;
  completedAt?: any;
  notes?: string;
  ownerId?: string;
}

export interface ActivityFeedItem {
  id: string;
  projectId: string;
  activityType: 'Daily Log' | 'File Added' | 'Issue Created' | 'Task Completed' | 'Change Order Updated' | 'Billing Updated' | 'Milestone Updated' | 'Document Status Updated';
  title: string;
  description?: string;
  relatedRecordType?: string;
  relatedRecordId?: string;
  createdBy?: string;
  createdAt?: any;
}

