import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Subcontractor, SubcontractorDocument } from '../models/subcontractor.types';
import { DataService } from './data.service';
import {
  computeMasterSubcontractorStatus,
  countActiveProjectsForSub,
  deriveMasterInsuranceStatus,
  deriveMasterW9Status,
} from '../utils/subcontractor-compliance.compute';

@Injectable({ providedIn: 'root' })
export class SubcontractorService {
  private data = inject(DataService);

  snapshot(): Subcontractor[] {
    return this.data.subcontractorsSnapshot();
  }

  getById(id: string): Subcontractor | undefined {
    return this.snapshot().find(s => s.id === id);
  }

  async saveSubcontractor(draft: Partial<Subcontractor>, editingId?: string | null): Promise<Subcontractor> {
    const payload: Partial<Subcontractor> = {
      ...draft,
      w9Status: draft.w9Status ?? 'Missing',
      insuranceStatus: draft.insuranceStatus ?? 'Missing',
      status: draft.status ?? 'PendingSetup',
    };
    payload.status = computeMasterSubcontractorStatus(payload as Subcontractor);

    return editingId
      ? firstValueFrom(this.data.updateSubcontractor(editingId, payload))
      : firstValueFrom(this.data.createSubcontractor(payload));
  }

  async markApproved(sub: Subcontractor): Promise<Subcontractor> {
    return firstValueFrom(this.data.updateSubcontractor(sub.id, {
      status: computeMasterSubcontractorStatus({ ...sub, status: 'Approved' }),
    }));
  }

  async markInactive(sub: Subcontractor): Promise<Subcontractor> {
    return firstValueFrom(this.data.updateSubcontractor(sub.id, { status: 'Inactive' }));
  }

  async markDoNotUse(sub: Subcontractor): Promise<Subcontractor> {
    return firstValueFrom(this.data.updateSubcontractor(sub.id, { status: 'DoNotUse' }));
  }

  refreshDerivedStatus(subcontractorId: string): Subcontractor | undefined {
    const sub = this.getById(subcontractorId);
    if (!sub) return undefined;

    const docs = this.data.subcontractorDocumentsSnapshot().filter(d => d.subcontractorId === subcontractorId);
    const w9Status = deriveMasterW9Status(sub.w9Status, docs, subcontractorId);
    const insuranceStatus = deriveMasterInsuranceStatus(docs, subcontractorId, sub.coiExpirationDate);
    const coi = docs.find(d => d.documentType === 'CertificateOfInsurance' && d.expirationDate);

    const updated: Partial<Subcontractor> = {
      w9Status,
      insuranceStatus,
      coiExpirationDate: coi?.expirationDate ?? sub.coiExpirationDate,
      status: computeMasterSubcontractorStatus({
        ...sub,
        w9Status,
        insuranceStatus,
      }),
    };

    void firstValueFrom(this.data.updateSubcontractor(subcontractorId, updated));
    return { ...sub, ...updated };
  }

  activeProjectCount(subcontractorId: string): number {
    return countActiveProjectsForSub(subcontractorId, this.data.projectSubcontractorsSnapshot());
  }

  documentsForSub(subcontractorId: string): SubcontractorDocument[] {
    return this.data.subcontractorDocumentsSnapshot().filter(d => d.subcontractorId === subcontractorId);
  }
}
