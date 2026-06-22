import { CprMemoryRecord } from '@app/models/certified-payroll.types';
import { normalizePersonName } from '@features/labor/utils/cpr-form.util';
import { safeFirestoreId } from '@features/labor/utils/certified-payroll-week';

export function makeCprMemoryKey(adpNorm: string, timelogNorm: string): string {
  return `${adpNorm.trim()}::${timelogNorm.trim()}`;
}

export function cprMemoryId(adpNorm: string, timelogNorm: string): string {
  return safeFirestoreId(makeCprMemoryKey(adpNorm, timelogNorm));
}

export interface ApprovedCprMemoryInput {
  timelogEmployee: string;
  adpEmployee: string;
  displayName?: string;
  occupation?: string;
  address?: string;
  notes?: string;
  existing?: CprMemoryRecord;
}

/** Build a CPR Memory record from an approved review row (Apps Script saveMemoryFromApprovedRow_). */
export function buildApprovedCprMemoryRecord(input: ApprovedCprMemoryInput): CprMemoryRecord {
  const timelogNorm = normalizePersonName(input.timelogEmployee);
  const adpNorm = normalizePersonName(input.adpEmployee);
  const now = new Date().toISOString();
  const approveCount = (input.existing?.approveCount ?? 0) + 1;

  return {
    id: cprMemoryId(adpNorm, timelogNorm),
    timelogNorm,
    adpNorm,
    adpEmployee: input.adpEmployee,
    timelogEmployee: input.timelogEmployee,
    display: input.displayName || input.timelogEmployee || input.adpEmployee,
    occupation: input.occupation,
    address: input.address,
    approvedAt: now,
    lastApprovedAt: now,
    approveCount,
    source: 'approved review',
    notes: input.notes,
  };
}
