import { Injectable, inject } from '@angular/core';
import {
  CertifiedPayrollEntry,
  CertifiedPayrollWeek,
  CprWeekReviewRow,
} from '@app/models/certified-payroll.types';
import { CertifiedPayrollDataService } from '@features/labor/services/certified-payroll-data.service';
import { buildApprovedCprMemoryRecord, cprMemoryId } from '@features/labor/utils/cpr-memory.util';
import {
  CPR_FUZZY_CONFIDENCE,
  CPR_READY_CONFIDENCE,
  resolveAdpPayrollDetail,
} from '@features/labor/utils/cpr-name-match.util';
import {
  getEmployeeCprOverride,
  normalizeOccupationLabel,
  normalizePersonName,
} from '@features/labor/utils/cpr-form.util';

export interface ApproveWeekResult {
  weekId: string;
  memorySaved: number;
  status: CertifiedPayrollWeek['status'];
}

@Injectable({ providedIn: 'root' })
export class CertifiedPayrollReviewService {
  private cprData = inject(CertifiedPayrollDataService);

  buildWeekReview(weekId: string): CprWeekReviewRow[] {
    const week = this.cprData.getWeeksSnapshot().find(w => w.id === weekId);
    if (!week) return [];

    const entries = this.cprData.getEntriesSnapshot().filter(e => e.weekId === weekId);
    const adpDetails = this.cprData.getAdpPayrollDetailsSnapshot();
    const employeeInfo = this.cprData.getEmployeePayrollInfoSnapshot();
    const memory = this.cprData.getCprMemorySnapshot();

    return entries.map(entry => this.buildReviewRow(entry, week, adpDetails, employeeInfo, memory));
  }

  async approveWeek(weekId: string): Promise<ApproveWeekResult> {
    const week = this.cprData.getWeeksSnapshot().find(w => w.id === weekId);
    if (!week) throw new Error('Certified payroll week not found.');

    const rows = this.buildWeekReview(weekId);
    const blockers = rows.filter(r => !r.canApprove);
    if (blockers.length) {
      const sample = blockers[0];
      throw new Error(
        blockers.length === 1
          ? `Cannot approve: ${sample.reviewNotes[0] || 'review row blocked'}`
          : `Cannot approve ${blockers.length} employee row(s). Fix ADP matches and occupations first.`,
      );
    }

    const existingMemory = this.cprData.getCprMemorySnapshot();
    let memorySaved = 0;

    for (const row of rows) {
      if (!row.adpEmployee) continue;
      const existing = existingMemory.find(m =>
        m.id === cprMemoryId(normalizePersonName(row.adpEmployee), normalizePersonName(row.timelogEmployee)),
      );

      const record = buildApprovedCprMemoryRecord({
        timelogEmployee: row.timelogEmployee,
        adpEmployee: row.adpEmployee,
        displayName: row.displayName,
        occupation: row.occupation,
        address: row.address,
        notes: row.reviewNotes.join('; ') || undefined,
        existing,
      });

      await this.cprData.upsertCprMemory(record);
      memorySaved += 1;
    }

    const approvedAt = new Date().toISOString();
    await this.cprData.upsertWeek({
      ...week,
      status: 'approved',
      approvedAt,
      readyAt: week.readyAt ?? approvedAt,
    });

    return { weekId, memorySaved, status: 'approved' };
  }

  private buildReviewRow(
    entry: CertifiedPayrollEntry,
    week: CertifiedPayrollWeek,
    adpDetails: ReturnType<CertifiedPayrollDataService['getAdpPayrollDetailsSnapshot']>,
    employeeInfo: ReturnType<CertifiedPayrollDataService['getEmployeePayrollInfoSnapshot']>,
    memory: ReturnType<CertifiedPayrollDataService['getCprMemorySnapshot']>,
  ): CprWeekReviewRow {
    const override = getEmployeeCprOverride(entry.employeeName);
    const occupation = normalizeOccupationLabel(override?.occupation ?? entry.classification);
    const match = resolveAdpPayrollDetail({
      timelogEmployee: entry.employeeName,
      weekEnding: week.weekEnding,
      adpDetails,
      memory,
      employeeInfo,
    });

    const empInfo = employeeInfo.find(e =>
      normalizePersonName(e.employeeName) === normalizePersonName(entry.employeeName)
      || normalizePersonName(e.legalName) === normalizePersonName(entry.employeeName),
    );
    const address = [empInfo?.address, empInfo?.city, empInfo?.state, empInfo?.zip].filter(Boolean).join(' ') || undefined;
    const displayName = override?.displayName || empInfo?.legalName || entry.employeeName;
    const adpEmployee = match.detail?.employeeName;
    const grossPay = match.detail?.grossPay;

    const reviewNotes: string[] = [];
    if (!match.detail) reviewNotes.push('Pick/enter ADP employee before approving.');
    if (match.confidence > 0 && match.confidence < CPR_READY_CONFIDENCE) {
      reviewNotes.push('Low confidence match; review before approving.');
    }
    if (match.confidence > 0 && match.confidence < CPR_FUZZY_CONFIDENCE) {
      reviewNotes.push('Very low confidence match.');
    }
    if (!occupation) reviewNotes.push('Missing occupation/classification.');
    if (match.detail && !grossPay) reviewNotes.push('ADP gross not found or zero.');

    const canApprove = !!match.detail && !!occupation && (grossPay ?? 0) > 0;

    return {
      entryId: entry.id,
      timelogEmployee: entry.employeeName,
      adpEmployee,
      displayName,
      matchSource: match.source,
      confidence: match.confidence,
      occupation,
      address,
      regularHours: entry.regularHours,
      overtimeHours: entry.overtimeHours,
      grossPay,
      reviewNotes,
      canApprove,
    };
  }
}
