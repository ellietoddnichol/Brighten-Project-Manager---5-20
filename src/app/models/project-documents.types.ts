import { FileView } from '@app/components/project/project-detail.types';

export type DocumentFileCategory =
  | 'Contract'
  | 'ChangeOrder'
  | 'Billing'
  | 'CertifiedPayroll'
  | 'Subcontractor'
  | 'Insurance'
  | 'LienWaiver'
  | 'Submittal'
  | 'Closeout'
  | 'RFI'
  | 'DailyLog'
  | 'Photo'
  | 'Backup'
  | 'Generated'
  | 'Upload'
  | 'Other';

export type DocumentSourceType =
  | 'Generated'
  | 'Uploaded'
  | 'DriveLinked'
  | 'Imported'
  | 'System';

export interface DocumentListItem {
  id: string;
  kind: 'file' | 'missing';
  fileName: string;
  fileCategory: DocumentFileCategory;
  sourceType?: DocumentSourceType;
  locationLabel?: string;
  dateLabel?: string;
  linkedRecord?: string;
  fileUrl?: string;
  /** Original ProjectFile when kind === 'file' */
  file?: import('./types').ProjectFile;
  /** Prompt action for missing rows */
  actionLabel?: string;
  actionRoute?: string;
  actionQueryParams?: Record<string, string>;
}

export const FILE_VIEW_TO_CATEGORY: Partial<Record<FileView, DocumentFileCategory | DocumentFileCategory[]>> = {
  contracts: 'Contract',
  'change-orders': 'ChangeOrder',
  billing: 'Billing',
  cpr: 'CertifiedPayroll',
  subs: 'Subcontractor',
  insurance: 'Insurance',
  'lien-waivers': 'LienWaiver',
  submittals: 'Submittal',
  closeout: 'Closeout',
};

export const CATEGORY_LABELS: Record<DocumentFileCategory, string> = {
  Contract: 'Contract',
  ChangeOrder: 'Change Order',
  Billing: 'Billing',
  CertifiedPayroll: 'Certified Payroll',
  Subcontractor: 'Subcontractor',
  Insurance: 'Insurance',
  LienWaiver: 'Lien Waiver',
  Submittal: 'Submittal',
  Closeout: 'Closeout',
  RFI: 'RFI',
  DailyLog: 'Daily Log',
  Photo: 'Photo',
  Backup: 'Backup',
  Generated: 'Generated',
  Upload: 'Upload',
  Other: 'Other',
};

export const FOLDER_KEY_LABELS: Record<string, string> = {
  PROJECT_ADMIN: '00 Project Admin',
  CONTRACT: '01 Contract',
  PLANS_SPECS: '02 Plans & Specs',
  SUBMITTALS: '03 Submittals',
  RFIS: '04 RFIs',
  CHANGE_ORDERS: '05 Change Orders',
  BILLING: '07 Billing',
  PHOTOS: '08 Photos',
  PO_IMAGES: 'PO Images',
  SUBS: 'Subs',
  CERTIFIED_PAYROLL: 'Certified Payroll',
  LIEN_WAIVERS: 'Lien Waivers',
  CLOSEOUT: '13 Closeout',
  DAILY_LOGS: 'Daily Logs',
  SAFETY: '11 Safety',
  ARCHIVE: '99 Archive',
};
