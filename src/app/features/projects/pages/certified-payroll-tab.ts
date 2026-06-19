import { Component, ChangeDetectionStrategy, Input, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { Project } from '@app/models/types';
import { CertifiedPayrollService } from '@features/labor/services/certified-payroll.service';
import { CertifiedPayrollDataService } from '@features/labor/services/certified-payroll-data.service';
import { WorkflowDocumentsSectionComponent } from '@app/components/workflow-documents-section';
import { DataService } from '@core/services/data.service';
import { StatusChipComponent, StatusTone } from '@app/components/ui/status-chip';
import { EmptyStateComponent } from '@app/components/ui/empty-state';
import { CprFormPrintComponent } from '@features/labor/components/cpr-form-print';
import { computeJobPayrollNumber } from '@features/labor/utils/cpr-form.util';
import { PayrollComplianceType } from '@app/models/certified-payroll.types';
import { isCertifiedPayrollProject } from '@features/labor/utils/certified-payroll-week';

@Component({
  selector: 'app-certified-payroll-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, StatusChipComponent, EmptyStateComponent, WorkflowDocumentsSectionComponent, CprFormPrintComponent],
  template: `
    @if (!isCprProject()) {
      <app-empty-state icon="lock" title="Certified Payroll not enabled"
                       message="Enable Prevailing Wage or Certified Payroll Required on this project to activate compliance tracking." />
    } @else {
      <div class="space-y-4">
        @if (cpr.exportBanner()) {
          <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{{ cpr.exportBanner() }}</div>
        }

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white rounded-xl border border-slate-200 p-5">
            <h3 class="text-sm font-bold text-slate-900 mb-4">Compliance Setup</h3>
            <dl class="grid grid-cols-1 gap-3 text-sm">
              <div><dt class="text-slate-500">Compliance Type</dt><dd class="font-semibold">{{ project.payrollComplianceType || 'Not set' }}</dd></div>
              <div><dt class="text-slate-500">Wage Order #</dt><dd class="font-semibold">{{ project.wageOrderNumber || '—' }}</dd></div>
              <div><dt class="text-slate-500">County</dt><dd class="font-semibold">{{ project.county || '—' }}</dd></div>
              <div><dt class="text-slate-500">Contract / Project No.</dt><dd class="font-semibold">{{ project.contractNumber || '—' }}</dd></div>
              <div><dt class="text-slate-500">Public Body</dt><dd class="font-semibold">{{ project.publicBody || '—' }}</dd></div>
              <div><dt class="text-slate-500">Public Body Address</dt><dd class="font-semibold">{{ publicBodyAddressLine() }}</dd></div>
              <div><dt class="text-slate-500">Contracting Agency</dt><dd class="font-semibold">{{ project.contractingAgency || '—' }}</dd></div>
              <div><dt class="text-slate-500">Prime Contractor</dt><dd class="font-semibold">{{ project.primeContractor || '—' }}</dd></div>
              <div><dt class="text-slate-500">CPR Status</dt><dd class="font-semibold">{{ project.certifiedPayrollStatus || 'Not Started' }}</dd></div>
            <button type="button" (click)="showEdit.set(!showEdit())" class="mt-4 text-sm font-semibold text-blue-600 hover:text-blue-800">
              {{ showEdit() ? 'Hide quick edit' : 'Quick edit compliance fields' }}
            </button>
            @if (showEdit()) {
              <form class="mt-4 space-y-3" (ngSubmit)="saveCompliance()">
                <label class="block text-xs font-bold uppercase text-slate-500">Compliance Type</label>
                <select [(ngModel)]="draft.payrollComplianceType" name="payrollComplianceType" class="w-full border border-slate-300 rounded px-3 py-2 text-sm">
                  @for (type of complianceTypes; track type) {
                    <option [ngValue]="type">{{ type }}</option>
                  }
                </select>
                <input [(ngModel)]="draft.wageOrderNumber" name="wageOrderNumber" placeholder="Wage order / AWO #" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                <input [(ngModel)]="draft.contractNumber" name="contractNumber" placeholder="Contract / project no." class="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                <input [(ngModel)]="draft.publicBody" name="publicBody" placeholder="Public body" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                <input [(ngModel)]="draft.publicBodyAddress" name="publicBodyAddress" placeholder="Public body address" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                <div class="grid grid-cols-3 gap-2">
                  <input [(ngModel)]="draft.publicBodyCity" name="publicBodyCity" placeholder="City" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                  <input [(ngModel)]="draft.publicBodyState" name="publicBodyState" placeholder="State" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                  <input [(ngModel)]="draft.publicBodyZip" name="publicBodyZip" placeholder="ZIP" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                </div>
                <input [(ngModel)]="draft.publicBodyPhone" name="publicBodyPhone" placeholder="Public body phone" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                <input [(ngModel)]="draft.county" name="county" placeholder="County" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                <input [(ngModel)]="draft.contractingAgency" name="contractingAgency" placeholder="Contracting agency" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                <input [(ngModel)]="draft.primeContractor" name="primeContractor" placeholder="Prime contractor" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                <label class="flex items-center gap-2 text-sm"><input type="checkbox" [(ngModel)]="draft.certifiedPayrollRequired" name="cprRequired"> Certified payroll required</label>
                <button type="submit" [disabled]="saving()" class="bg-slate-900 text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50">Save</button>
              </form>
            }
          </div>

          <div class="bg-white rounded-xl border border-slate-200 p-5">
            <div class="flex justify-between items-center mb-4">
              <h3 class="text-sm font-bold text-slate-900">Compliance Tasks</h3>
              <button type="button" (click)="generate()" [disabled]="cpr.loading()" class="text-xs font-semibold text-blue-600">Generate drafts</button>
            </div>
            <div class="space-y-2 max-h-80 overflow-y-auto">
              @for (task of tasks(); track task.id) {
                <div class="flex items-start justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
                  <div>
                    <div class="text-sm font-medium text-slate-900">{{ task.title }}</div>
                    <div class="text-xs text-slate-500">{{ task.description }}</div>
                  </div>
                  <app-status-chip [tone]="taskTone(task.status)">{{ task.status }}</app-status-chip>
                </div>
              } @empty {
                <div class="text-sm text-slate-400 italic">Tasks will appear when compliance is enabled.</div>
              }
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap justify-between items-center gap-2">
            <div>
              <h3 class="text-sm font-bold text-slate-900">Weekly Certified Payroll Drafts</h3>
              <span class="text-xs text-slate-500">{{ openExceptions().length }} open exceptions</span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              @if (selectedWeekIds().size) {
                <button type="button" (click)="markSelectedSubmitted()" [disabled]="cpr.loading()"
                        class="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors disabled:opacity-50">
                  Mark Selected as Submitted
                </button>
              }
              <button type="button" (click)="newCpr()" [disabled]="cpr.loading()"
                      class="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors disabled:opacity-50">
                New CPR
              </button>
            </div>
          </div>
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-100">
                <th class="px-3 py-2 w-10">
                  <input type="checkbox" [checked]="allWeeksSelected()" (change)="toggleSelectAll($event)" class="rounded border-slate-300" />
                </th>
                <th class="px-3 py-2 text-left">Week Ending</th>
                <th class="px-3 py-2 text-right">Hours</th>
                <th class="px-3 py-2 text-left">Entries</th>
                <th class="px-3 py-2 text-left">Exceptions</th>
                <th class="px-3 py-2 text-left">Status</th>
                <th class="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (week of weeks(); track week.id) {
                <tr class="hover:bg-slate-50 transition-colors text-xs text-slate-700">
                  <td class="px-3 py-2.5">
                    <input type="checkbox" [checked]="selectedWeekIds().has(week.id)" (change)="toggleWeek(week.id, $event)" class="rounded border-slate-300" />
                  </td>
                  <td class="px-3 py-2.5 font-medium">{{ week.weekEnding }}</td>
                  <td class="px-3 py-2.5 text-right text-xs font-mono text-slate-700">{{ week.totalHours | number:'1.1-1' }}</td>
                  <td class="px-3 py-2.5">{{ week.entryCount }}</td>
                  <td class="px-3 py-2.5">{{ week.exceptionCount }}</td>
                  <td class="px-3 py-2.5"><app-status-chip [tone]="weekTone(week.status)" [label]="week.status" /></td>
                  <td class="px-3 py-2.5 text-right space-x-2">
                    <button type="button" (click)="printWeek(week.id)" [disabled]="week.status === 'blocked'"
                            class="text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg text-xs font-semibold hover:bg-emerald-100 transition-colors disabled:opacity-40">Print Form</button>
                    <button type="button" (click)="exportWeek(week.id)" [disabled]="week.status === 'blocked'"
                            class="text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition-colors disabled:opacity-40">Export</button>
                    <button type="button" (click)="toggleDocs(week.id)"
                            class="text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors">Docs</button>
                  </td>
                </tr>
                @if (expandedWeekId() === week.id) {
                  <tr><td colspan="7" class="px-5 py-4 bg-slate-50">
                    <app-workflow-documents-section
                      [project]="project"
                      workflowType="certified_payroll"
                      [sourceRecordId]="week.id"
                      [signedUpload]="true" />
                  </td></tr>
                }
              } @empty {
                <tr><td colspan="7" class="p-0">
                  <app-empty-state icon="assignment" title="No weekly CPR drafts"
                                   message="Generate drafts from approved time logs using New CPR." />
                </td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }

    @if (printWeekId()) {
      <div class="fixed inset-0 z-50 bg-white overflow-auto">
        <div class="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
          <h2 class="text-sm font-bold text-slate-900">Certified Payroll Form Preview</h2>
          <div class="flex items-center gap-2">
            <button type="button" (click)="triggerPrint()"
                    class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">Print</button>
            <button type="button" (click)="closePrint()"
                    class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold">Close</button>
          </div>
        </div>
        <div class="p-6 max-w-[1400px] mx-auto">
          @if (printContext(); as ctx) {
            <app-cpr-form-print
              [project]="ctx.project"
              [week]="ctx.week"
              [entries]="ctx.entries"
              [payrollNumber]="ctx.payrollNumber" />
          }
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CertifiedPayrollTabComponent implements OnInit {
  @Input({ required: true }) project!: Project;

  cpr = inject(CertifiedPayrollService);
  private cprData = inject(CertifiedPayrollDataService);
  private dataService = inject(DataService);

  showEdit = signal(false);
  expandedWeekId = signal<string | null>(null);
  selectedWeekIds = signal<Set<string>>(new Set());
  printWeekId = signal<string | null>(null);
  saving = signal(false);
  draft: Partial<Project> = {};

  entries = toSignal(this.cprData.getEntries(), { initialValue: [] });

  readonly complianceTypes: PayrollComplianceType[] = ['NONE', 'FEDERAL_DAVIS_BACON', 'MISSOURI_LS57', 'BOTH', 'OTHER'];

  isCprProject = computed(() => isCertifiedPayrollProject(this.project));

  tasks = computed(() => this.cpr.tasksForProject(this.project.id));
  weeks = computed(() => this.cpr.weeksForProject(this.project.id));
  openExceptions = computed(() => this.cpr.exceptionsForProject(this.project.id));

  printContext = computed(() => {
    const weekId = this.printWeekId();
    if (!weekId) return null;
    const week = this.weeks().find(w => w.id === weekId);
    if (!week) return null;
    const weekEntries = this.entries().filter(e => e.weekId === weekId);
    const endings = this.weeks().map(w => w.weekEnding).sort();
    return {
      project: this.project,
      week,
      entries: weekEntries,
      payrollNumber: computeJobPayrollNumber(endings, week.weekEnding, endings[0]),
    };
  });

  ngOnInit(): void {
    this.draft = {
      payrollComplianceType: this.project.payrollComplianceType ?? 'NONE',
      wageOrderNumber: this.project.wageOrderNumber,
      contractNumber: this.project.contractNumber,
      county: this.project.county,
      publicBody: this.project.publicBody,
      publicBodyAddress: this.project.publicBodyAddress,
      publicBodyCity: this.project.publicBodyCity,
      publicBodyState: this.project.publicBodyState,
      publicBodyZip: this.project.publicBodyZip,
      publicBodyPhone: this.project.publicBodyPhone,
      contractingAgency: this.project.contractingAgency,
      primeContractor: this.project.primeContractor,
      certifiedPayrollRequired: this.project.certifiedPayrollRequired ?? this.project.prevailingWage,
    };
    void this.cpr.ensureComplianceForProject(this.project);
  }

  generate(): void {
    void this.cpr.generateDrafts(this.project.id);
  }

  newCpr(): void {
    void this.cpr.generateDrafts(this.project.id);
  }

  toggleWeek(weekId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedWeekIds.update(set => {
      const next = new Set(set);
      if (checked) next.add(weekId);
      else next.delete(weekId);
      return next;
    });
  }

  allWeeksSelected(): boolean {
    const ids = this.weeks().map(w => w.id);
    return ids.length > 0 && ids.every(id => this.selectedWeekIds().has(id));
  }

  toggleSelectAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedWeekIds.set(checked ? new Set(this.weeks().map(w => w.id)) : new Set());
  }

  markSelectedSubmitted(): void {
    const ids = [...this.selectedWeekIds()];
    if (!ids.length) return;
    void this.cpr.markWeeksSubmitted(ids).then(() => this.selectedWeekIds.set(new Set()));
  }

  exportWeek(weekId: string): void {
    void this.cpr.exportWeek(weekId);
  }

  printWeek(weekId: string): void {
    this.printWeekId.set(weekId);
  }

  closePrint(): void {
    this.printWeekId.set(null);
  }

  triggerPrint(): void {
    window.print();
  }

  saveCompliance(): void {
    this.saving.set(true);
    this.dataService.updateProject(this.project.id, {
      ...this.draft,
      certifiedPayrollStatus: this.draft.wageOrderNumber ? 'Setup' : this.project.certifiedPayrollStatus,
    }).subscribe({
      next: async (updated) => {
        this.project = { ...this.project, ...updated };
        await this.cpr.ensureComplianceForProject(this.project);
        this.saving.set(false);
      },
      error: () => this.saving.set(false),
    });
  }

  weekTone(status: string): StatusTone {
    if (status === 'ready' || status === 'exported') return 'green';
    if (status === 'blocked') return 'red';
    return 'amber';
  }

  taskTone(status: string): StatusTone {
    if (status === 'Complete') return 'green';
    if (status === 'In Progress') return 'blue';
    return 'slate';
  }

  toggleDocs(weekId: string): void {
    this.expandedWeekId.set(this.expandedWeekId() === weekId ? null : weekId);
  }

  publicBodyAddressLine(): string {
    const parts = [
      this.project.publicBodyAddress,
      [this.project.publicBodyCity, this.project.publicBodyState, this.project.publicBodyZip].filter(Boolean).join(' '),
    ].filter(Boolean);
    return parts.join(', ') || '—';
  }
}
