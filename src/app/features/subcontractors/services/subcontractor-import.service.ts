import { Injectable, inject } from '@angular/core';
import { Subcontractor } from '@app/models/subcontractor.types';
import { findSubcontractorByName } from '@shared/utils/vendor-normalizers';
import { SubcontractorService } from '@features/subcontractors/services/subcontractor.service';
import {
  parseSubcontractorCsv,
  SubcontractorCsvRow,
} from '@features/subcontractors/utils/subcontractor-csv-import';

export interface SubcontractorImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; company?: string; message: string }[];
}

@Injectable({ providedIn: 'root' })
export class SubcontractorImportService {
  private subSvc = inject(SubcontractorService);

  async importFromCsvText(
    text: string,
    options?: { updateExisting?: boolean },
  ): Promise<SubcontractorImportResult> {
    const updateExisting = options?.updateExisting ?? false;
    const parsed = parseSubcontractorCsv(text);
    const result: SubcontractorImportResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: parsed.errors.map(e => ({ row: e.row, message: e.message })),
    };

    const existing = this.subSvc.snapshot();

    for (const row of parsed.rows) {
      try {
        const outcome = await this.upsertRow(row, existing, updateExisting);
        if (outcome === 'created') result.created++;
        else if (outcome === 'updated') result.updated++;
        else result.skipped++;
      } catch (err) {
        result.errors.push({
          row: row.rowNumber,
          company: row.companyName,
          message: err instanceof Error ? err.message : 'Import failed.',
        });
      }
    }

    return result;
  }

  private async upsertRow(
    row: SubcontractorCsvRow,
    existing: Subcontractor[],
    updateExisting: boolean,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const match = findSubcontractorByName(existing, row.companyName);
    const draft: Partial<Subcontractor> = {
      companyName: row.companyName,
      trade: row.trade,
      contactName: row.contactName,
      phone: row.phone,
      email: row.email,
      address: row.address,
      notes: row.notes,
      coiExpirationDate: row.coiExpirationDate,
      w9Status: row.w9Status,
      insuranceStatus: row.insuranceStatus,
      status: row.status,
      vendorClassification: row.vendorClassification ?? 'Subcontractor',
      source: 'Manual',
    };

    if (match) {
      if (!updateExisting) return 'skipped';
      await this.subSvc.saveSubcontractor(draft, match.id);
      return 'updated';
    }

    const created = await this.subSvc.saveSubcontractor(draft);
    existing.push(created);
    return 'created';
  }
}
