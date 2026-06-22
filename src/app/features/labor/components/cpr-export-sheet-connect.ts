import { Component, ChangeDetectionStrategy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { CERTIFIED_PAYROLL_SHEET } from '@app/config/certified-payroll-sheet.config';
import { CertifiedPayrollService } from '@features/labor/services/certified-payroll.service';

@Component({
  selector: 'app-cpr-export-sheet-connect',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  template: `
    @if (!cpr.exportConfigured()) {
      <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 space-y-3">
        <p>
          <strong>Optional:</strong> connect a Google Sheet to append draft rows to tab
          <code class="font-mono text-xs bg-amber-100 px-1 rounded">{{ exportTab }}</code>.
          You can still <strong>Print Form</strong> (WH-347) without this.
        </p>
        <div class="flex flex-col sm:flex-row gap-2">
          <input type="text" [(ngModel)]="sheetIdDraft" name="cprExportSheetId"
                 placeholder="Google Sheet ID from the sheet URL"
                 class="flex-1 px-3 py-2 bg-white rounded-lg border border-amber-200 text-sm font-mono" />
          <button type="button" (click)="save()"
                  class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold shrink-0">
            Save sheet
          </button>
        </div>
        <p class="text-xs text-amber-800/90">
          Add a tab named <strong>{{ exportTab }}</strong> in that spreadsheet.
          Use the ID from
          <span class="font-mono">docs.google.com/spreadsheets/d/<em>SHEET_ID</em>/edit</span>.
        </p>
        @if (savedMessage()) {
          <p class="text-xs text-emerald-800">{{ savedMessage() }}</p>
        }
      </div>
    } @else {
      <div class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex flex-wrap items-center justify-between gap-2">
        <span>Export sheet connected · rows append to <strong>{{ exportTab }}</strong></span>
        <a [href]="sheetUrl()" target="_blank" rel="noopener"
           class="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:underline">
          Open sheet <mat-icon class="!text-[14px]">open_in_new</mat-icon>
        </a>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CprExportSheetConnectComponent {
  readonly cpr = inject(CertifiedPayrollService);
  readonly exportTab = CERTIFIED_PAYROLL_SHEET.exportTab;

  sheetIdDraft = this.cpr.getSheetId();
  savedMessage = signal<string | null>(null);

  sheetUrl = computed(() => {
    const id = this.cpr.getSheetId().trim();
    return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : '';
  });

  save(): void {
    this.cpr.configureSheetId(this.sheetIdDraft.trim());
    this.savedMessage.set(this.cpr.exportConfigured()
      ? 'Sheet saved. Use Export on a ready week to append draft rows.'
      : 'Enter a valid Google Sheet ID.');
  }
}
