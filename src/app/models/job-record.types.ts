import { FirestoreAuditFields } from './firestore-lifecycle.types';

/** Directory company / customer record — created when a job customer is entered. */
export interface Company extends FirestoreAuditFields {
  id: string;
  name: string;
  type?: 'Customer' | 'Vendor' | 'Subcontractor' | 'Other';
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  ownerId?: string;
}

/** Manual labor entry on a job (Firestore `project-labor-entries`). */
export interface ProjectLaborEntry extends FirestoreAuditFields {
  id: string;
  projectId: string;
  workDate: string;
  employeeName?: string;
  classification?: string;
  laborCode?: string;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  totalHours: number;
  costRate?: number;
  laborCost?: number;
  notes?: string;
  ownerId?: string;
}

/** Manual material entry on a job (Firestore `project-materials`). */
export interface ProjectMaterial extends FirestoreAuditFields {
  id: string;
  projectId: string;
  entryDate: string;
  vendor?: string;
  description: string;
  category?: string;
  quantity?: number;
  unitCost?: number;
  totalCost: number;
  invoiceLink?: string;
  notes?: string;
  ownerId?: string;
}
