import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { DataService } from '@core/services/data.service';
import { LaborCodeMappingService } from '@features/labor/services/labor-code-mapping.service';
import {
  LABOR_CODE_CATEGORY_LABELS,
  LaborCodeCategory,
  LaborCodeMapping,
} from '@app/models/labor-code-mapping.types';
import { defaultMappingDraft } from '@features/labor/utils/labor-code-mapping.compute';
import { LaborDataService } from '@features/labor/services/labor-data.service';

@Component({
  selector: 'app-settings-labor-codes',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  template: `
    <section id="labor-codes" class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mb-6">
      <div class="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h2 class="text-xl font-bold mb-2">Labor Code Discovery</h2>
          <p class="text-sm text-slate-500 font-medium">
            Discover labor codes from the Master Time Sheet, classify mappings, and control WIP/bonus/CPR rules.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" (click)="discoverFromSource()" [disabled]="mappingService.syncing()"
                  class="bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">
            {{ mappingService.syncing() ? 'Discovering…' : 'Discover from Master Time Sheet' }}
          </button>
          <button type="button" (click)="openCreate()"
                  class="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-md text-sm font-semibold hover:bg-slate-50">
            Add labor code
          </button>
          <button type="button" (click)="bulkClassify()" [disabled]="!unmappedCodes().length || saving()"
                  class="bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">
            Classify unmapped ({{ unmappedCodes().length }})
          </button>
          <button type="button" (click)="mappingService.exportMappingsCsv()"
                  class="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-md text-sm font-semibold hover:bg-slate-50">
            Export mapping
          </button>
        </div>
      </div>

      @if (mappingService.lastMessage()) {
        <p class="text-sm text-emerald-700 mb-4">{{ mappingService.lastMessage() }}</p>
      }
      @if (message()) {
        <p class="text-sm mb-4" [class.text-emerald-700]="success()" [class.text-rose-700]="!success()">{{ message() }}</p>
      }

      <div class="overflow-x-auto rounded-xl border border-slate-200">
        <table class="w-full text-sm min-w-[1200px]">
          <thead class="bg-slate-50 text-[10px] uppercase text-slate-500 tracking-widest font-bold">
            <tr>
              <th class="px-4 py-3 text-left">Labor Code</th>
              <th class="px-4 py-3 text-left">Display Name</th>
              <th class="px-4 py-3 text-left">Category</th>
              <th class="px-4 py-3 text-left">Work Comp</th>
              <th class="px-4 py-3 text-left">CPR Class</th>
              <th class="px-4 py-3 text-center">Bonus</th>
              <th class="px-4 py-3 text-center">CPR</th>
              <th class="px-4 py-3 text-center">WIP</th>
              <th class="px-4 py-3 text-center">Active</th>
              <th class="px-4 py-3 text-left">Notes</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (row of sortedMappings(); track row.id) {
              <tr class="hover:bg-slate-50" [class.bg-amber-50]="!row.active">
                <td class="px-4 py-3 font-mono font-semibold">{{ row.laborCode }}</td>
                <td class="px-4 py-3">{{ row.displayName || '—' }}</td>
                <td class="px-4 py-3">{{ categoryLabel(row.category) }}</td>
                <td class="px-4 py-3">{{ row.workCompCategory || '—' }}</td>
                <td class="px-4 py-3">{{ row.certifiedPayrollClassification || '—' }}</td>
                <td class="px-4 py-3 text-center">{{ row.bonusEligible ? 'Yes' : 'No' }}</td>
                <td class="px-4 py-3 text-center">{{ row.certifiedPayrollEligible ? 'Yes' : 'No' }}</td>
                <td class="px-4 py-3 text-center">{{ row.wipEligible ? 'Yes' : 'No' }}</td>
                <td class="px-4 py-3 text-center">
                  <span class="px-2 py-0.5 rounded-full text-xs font-semibold"
                        [class.bg-emerald-100]="row.active" [class.text-emerald-800]="row.active"
                        [class.bg-slate-200]="!row.active" [class.text-slate-600]="!row.active">
                    {{ row.active ? 'Active' : 'Inactive' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-slate-500 max-w-[180px] truncate">{{ row.notes || '—' }}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <button type="button" (click)="openEdit(row)" class="text-blue-600 font-semibold text-xs mr-3">Edit</button>
                  @if (row.active) {
                    <button type="button" (click)="deactivate(row)" class="text-slate-500 font-semibold text-xs">Mark inactive</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="11" class="px-4 py-10 text-center text-slate-400 italic">No labor code mappings yet.</td></tr>
            }
          </tbody>
        </table>
      </div>

      @if (editorOpen()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" (click)="closeEditor()">
          <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" (click)="$event.stopPropagation()">
            <h3 class="text-lg font-bold mb-4">{{ editingId() ? 'Edit Labor Code Mapping' : 'Add Labor Code Mapping' }}</h3>
            <div class="space-y-3">
              <div>
                <label class="block text-xs font-bold uppercase text-slate-500 mb-1">Labor Code</label>
                <input [(ngModel)]="draft.laborCode" [disabled]="!!editingId()"
                       class="w-full px-3 py-2 border rounded-lg text-sm font-mono" />
              </div>
              <div>
                <label class="block text-xs font-bold uppercase text-slate-500 mb-1">Display Name</label>
                <input [(ngModel)]="draft.displayName" class="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label class="block text-xs font-bold uppercase text-slate-500 mb-1">Category</label>
                <select [(ngModel)]="draft.category" class="w-full px-3 py-2 border rounded-lg text-sm">
                  @for (cat of categories; track cat) {
                    <option [value]="cat">{{ categoryLabel(cat) }}</option>
                  }
                </select>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold uppercase text-slate-500 mb-1">Work Comp Category</label>
                  <input [(ngModel)]="draft.workCompCategory" class="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label class="block text-xs font-bold uppercase text-slate-500 mb-1">Default Cost Code</label>
                  <input [(ngModel)]="draft.defaultCostCode" class="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label class="block text-xs font-bold uppercase text-slate-500 mb-1">Certified Payroll Classification</label>
                <input [(ngModel)]="draft.certifiedPayrollClassification" class="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div class="grid grid-cols-2 gap-2 text-sm">
                <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="draft.bonusEligible" /> Bonus eligible</label>
                <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="draft.certifiedPayrollEligible" /> CPR eligible</label>
                <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="draft.wipEligible" /> WIP eligible</label>
                <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="draft.excludeFromForemanBonus" /> Exclude from bonus</label>
                <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="draft.excludeFromAudit" /> Exclude from audit</label>
                <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="draft.active" /> Active</label>
              </div>
              <div>
                <label class="block text-xs font-bold uppercase text-slate-500 mb-1">Notes</label>
                <textarea [(ngModel)]="draft.notes" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
              </div>
            </div>
            <div class="flex justify-end gap-2 mt-6">
              <button type="button" (click)="closeEditor()" class="px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
              <button type="button" (click)="save()" [disabled]="saving() || !draft.laborCode?.trim()"
                      class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
                {{ saving() ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </div>
        </div>
      }

      @if (bulkOpen()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" (click)="bulkOpen.set(false)">
          <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" (click)="$event.stopPropagation()">
            <h3 class="text-lg font-bold mb-2">Bulk Classify Unmapped Codes</h3>
            <p class="text-sm text-slate-500 mb-4">{{ unmappedCodes().length }} code(s) found in approved time without a mapping.</p>
            <div class="max-h-40 overflow-y-auto border rounded-lg p-2 mb-4 text-sm font-mono">
              @for (code of unmappedCodes(); track code) {
                <div>{{ code }}</div>
              }
            </div>
            <div class="space-y-3">
              <div>
                <label class="block text-xs font-bold uppercase text-slate-500 mb-1">Category</label>
                <select [(ngModel)]="bulkDraft.category" class="w-full px-3 py-2 border rounded-lg text-sm">
                  @for (cat of categories; track cat) {
                    <option [value]="cat">{{ categoryLabel(cat) }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="block text-xs font-bold uppercase text-slate-500 mb-1">Work Comp Category</label>
                <input [(ngModel)]="bulkDraft.workCompCategory" class="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
            </div>
            <div class="flex justify-end gap-2 mt-6">
              <button type="button" (click)="bulkOpen.set(false)" class="px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
              <button type="button" (click)="confirmBulk()" [disabled]="saving()"
                      class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">
                Classify all
              </button>
            </div>
          </div>
        </div>
      }
    </section>
  `,
})
export class SettingsLaborCodes {
  mappingService = inject(LaborCodeMappingService);
  private data = inject(DataService);
  private laborData = inject(LaborDataService);

  private mappings = toSignal(this.data.getLaborCodeMappings(), { initialValue: [] as LaborCodeMapping[] });

  editorOpen = signal(false);
  bulkOpen = signal(false);
  editingId = signal<string | null>(null);
  saving = signal(false);
  message = signal<string | null>(null);
  success = signal(true);

  draft: Partial<LaborCodeMapping> = {};
  bulkDraft: Partial<LaborCodeMapping> = { category: 'SelfPerformedLabor', workCompCategory: 'General' };

  readonly categories = Object.keys(LABOR_CODE_CATEGORY_LABELS) as LaborCodeCategory[];

  sortedMappings = computed(() =>
    [...this.mappings()].sort((a, b) => a.laborCode.localeCompare(b.laborCode, undefined, { numeric: true })),
  );

  unmappedCodes = computed(() =>
    this.mappingService.discoverUnmappedCodes(
      this.laborData.normalizedEntries(),
      this.laborActuals(),
    ),
  );

  private laborActuals = toSignal(this.data.getProjectLaborActuals(), { initialValue: [] });

  categoryLabel(cat: LaborCodeCategory): string {
    return LABOR_CODE_CATEGORY_LABELS[cat];
  }

  openCreate(): void {
    this.editingId.set(null);
    this.draft = { ...defaultMappingDraft(''), laborCode: '' };
    this.editorOpen.set(true);
  }

  openEdit(row: LaborCodeMapping): void {
    this.editingId.set(row.id);
    this.draft = { ...row };
    this.editorOpen.set(true);
  }

  closeEditor(): void {
    this.editorOpen.set(false);
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      await this.mappingService.saveMapping(this.draft, this.editingId());
      this.message.set('Labor code mapping saved.');
      this.success.set(true);
      this.editorOpen.set(false);
    } catch {
      this.message.set('Failed to save mapping.');
      this.success.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  async deactivate(row: LaborCodeMapping): Promise<void> {
    await this.mappingService.markInactive(row.id);
    this.message.set(`${row.laborCode} marked inactive.`);
    this.success.set(true);
  }

  bulkClassify(): void {
    if (!this.unmappedCodes().length) return;
    this.bulkOpen.set(true);
  }

  async confirmBulk(): Promise<void> {
    this.saving.set(true);
    try {
      const count = await this.mappingService.bulkClassifyUnassigned(this.unmappedCodes(), this.bulkDraft);
      this.message.set(`Classified ${count} labor code(s).`);
      this.success.set(true);
      this.bulkOpen.set(false);
    } catch {
      this.message.set('Bulk classify failed.');
      this.success.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  async discoverFromSource(): Promise<void> {
    const rows = this.mappingService.discoveryRowsFromEntries(
      this.laborData.normalizedEntries(),
      this.laborActuals(),
    );
    await this.mappingService.discoverFromMasterTimeSheet(rows);
  }
}
