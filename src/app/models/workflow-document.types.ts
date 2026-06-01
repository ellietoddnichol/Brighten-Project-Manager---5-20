/** Workflow document routing and save types. */

export type WorkflowType =
  | 'change_request'
  | 'change_order'
  | 'rfi'
  | 'submittal'
  | 'billing'
  | 'purchase_order'
  | 'certified_payroll'
  | 'subcontractor_compliance'
  | 'subcontractor_invoice'
  | 'daily_log'
  | 'closeout';

export type WorkflowFolderConfig = {
  primary: string;
  fallbacks?: string[];
  /** For daily log photo uploads. */
  photoKey?: string;
};

export const WORKFLOW_FOLDER_CONFIG: Record<WorkflowType, WorkflowFolderConfig> = {
  change_request: { primary: 'CHANGE_REQUESTS' },
  change_order: { primary: 'CHANGE_ORDERS' },
  rfi: { primary: 'RFIS', fallbacks: ['CORRESPONDENCE'] },
  submittal: { primary: 'SUBMITTALS' },
  billing: { primary: 'BILLING' },
  purchase_order: { primary: 'PURCHASE_ORDERS', fallbacks: ['BILLING'] },
  certified_payroll: { primary: 'CERTIFIED_PAYROLL' },
  subcontractor_compliance: { primary: 'SUBS', fallbacks: ['BILLING', 'CLOSEOUT'] },
  subcontractor_invoice: { primary: 'BILLING', fallbacks: ['SUBS'] },
  daily_log: { primary: 'DAILY_LOGS', fallbacks: ['CORRESPONDENCE'], photoKey: 'PHOTOS' },
  closeout: { primary: 'CLOSEOUT' },
};

export type SaveWorkflowFileInput = {
  projectId: string;
  workflowType: WorkflowType;
  folderKey?: string;
  fallbackFolderKeys?: string[];
  fileName: string;
  content: string | Blob;
  mimeType?: string;
  documentType: string;
  documentStatus?: string;
  sourceRecordId?: string;
  notes?: string;
  /** When true and no cached token, attempt interactive re-auth (user-initiated upload). */
  requestAuthIfNeeded?: boolean;
  /** Skip Drive upload — metadata only (e.g. photos kept on record until export). */
  driveUpload?: boolean;
};

export type SaveWorkflowFileResult = {
  projectFileId: string;
  fileName: string;
  fileUrl: string;
  driveFileId?: string;
  driveFolderId?: string;
  drivePath?: string;
  folderKey: string;
  savedToLabel: string;
  usedFallback: boolean;
  warning?: string;
  driveUploaded: boolean;
};
