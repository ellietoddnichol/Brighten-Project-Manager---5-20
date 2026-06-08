import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  signal,
  inject,
  computed,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { Project, ChangeOrder, PROJECT_STATUSES } from '@app/models/types';
import { PROJECT_PROFILE_OPTIONS, PROJECT_PROFILE_LABELS, ProjectProfile } from '@app/models/project-requirements.types';
import { FinancialView, UtilityView } from './project-detail.types';
import { ProjectRecordService } from '@features/projects/services/project-record.service';
import { DataService } from '@core/services/data.service';
import { ProjectFinancialService } from '@features/projects/services/project-financial.service';
import { effectiveForeman, deriveCertifiedPayrollRequired } from '@features/projects/utils/project-setup.util';
import {
  isMasterSheetLinkedProject,
  isMasterSheetReadOnlyField,
  stripMasterSheetFieldsFromUserPatch,
} from '@shared/utils/master-sheet-fields';
import { CoTabComponent } from '@features/projects/pages/co-tab';
import { BudgetTabComponent } from '@features/projects/pages/budget-tab';
import { getProjectFinancialSummary } from '@shared/utils/financial';

type RecordTab = 'details' | 'financial' | 'change-orders' | 'budget-lines';

@Component({
  selector: 'app-project-record-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, CurrencyPipe, CoTabComponent, BudgetTabComponent],
  template: `
    <div class="space-y-4 max-w-6xl">
      <div class="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
        <strong>Job Record</strong> — update contract, budget, and setup here. Saves go to Firestore and are protected from import overwrites.
        @if (saveMessage()) {
          <span class="ml-2 font-semibold">{{ saveMessage() }}</span>
        }
      </div>

      <div class="flex gap-2 border-b border-slate-200 pb-1 overflow-x-auto whitespace-nowrap">
        @for (tab of tabs; track tab.id) {
          <button type="button" (click)="activeTab.set(tab.id)"
                  class="px-4 py-2 rounded-t-lg text-sm font-semibold border-b-2 transition-colors"
                  [class.border-slate-900]="activeTab() === tab.id"
                  [class.text-slate-900]="activeTab() === tab.id"
                  [class.border-transparent]="activeTab() !== tab.id"
                  [class.text-slate-500]="activeTab() !== tab.id">
            {{ tab.label }}
          </button>
        }
      </div>

      @if (activeTab() === 'details') {
        <form class="grid grid-cols-1 lg:grid-cols-2 gap-6" (submit)="saveDetails(); $event.preventDefault()">
          @if (masterSheetLinked()) {
            <p class="lg:col-span-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              Some identity fields sync from the Master Data Sheet and are read-only here.
            </p>
          }

          <section class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h3 class="text-xs font-bold uppercase tracking-widest text-slate-500">Identity</h3>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Job #</label>
                <input type="text" [(ngModel)]="draft.projectNumber" name="jobNum"
                       [disabled]="readOnly('projectNumber')"
                       class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm disabled:bg-slate-100">
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Status</label>
                <select [(ngModel)]="draft.status" name="status" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
                  @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
                </select>
              </div>
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Project name</label>
              <input type="text" [(ngModel)]="draft.projectName" name="name"
                     [disabled]="readOnly('projectName')"
                     class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm disabled:bg-slate-100">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Customer / GC</label>
              <input type="text" [(ngModel)]="draft.customer" name="cust"
                     [disabled]="readOnly('customer')"
                     class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm disabled:bg-slate-100">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Address</label>
              <input type="text" [(ngModel)]="draft.address" name="addr"
                     [disabled]="readOnly('address')"
                     class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm disabled:bg-slate-100">
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">County</label>
                <input type="text" [(ngModel)]="draft.county" name="county" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Profile</label>
                <select [(ngModel)]="draft.projectProfile" name="profile" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
                  <option [ngValue]="undefined">— Select —</option>
                  @for (p of profileOptions; track p) {
                    <option [ngValue]="p">{{ profileLabels[p] }}</option>
                  }
                </select>
              </div>
            </div>
          </section>

          <section class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h3 class="text-xs font-bold uppercase tracking-widest text-slate-500">Team &amp; compliance</h3>
            <div>
              <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Foreman / Superintendent</label>
              <input type="text" [(ngModel)]="draft.superintendent" name="foreman" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                     [placeholder]="defaultForeman() || 'Unassigned'">
              @if (defaultForeman() && !draft.superintendent) {
                <p class="text-[10px] text-slate-400 mt-1">Default for this customer: {{ defaultForeman() }}</p>
              }
            </div>
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" [(ngModel)]="draft.prevailingWage" name="pw" (ngModelChange)="onPrevailingWageChange($event)">
              Prevailing wage job
            </label>
            @if (draft.prevailingWage) {
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Wage order / AWO #</label>
                <input type="text" [(ngModel)]="draft.wageOrderNumber" name="wo" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Subcontractor budget ($)</label>
                <input type="number" [(ngModel)]="draft.estSubCost" name="estSub" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
              </div>
            }
          </section>

          <section class="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h3 class="text-xs font-bold uppercase tracking-widest text-slate-500">Integrations</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Google Drive folder ID</label>
                <div class="flex gap-2">
                  <input type="text" [(ngModel)]="driveId" name="drive" class="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm">
                  <button type="button" (click)="saveDrive.emit(driveId)" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors">Save</button>
                </div>
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Google Sheet ID</label>
                <div class="flex gap-2">
                  <input type="text" [(ngModel)]="sheetId" name="sheet" class="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm">
                  <button type="button" (click)="saveSheet.emit(sheetId)" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors">Save</button>
                </div>
              </div>
            </div>
            <button type="button" (click)="openUtility.emit('drive-mapping')" class="text-sm font-semibold text-indigo-700 hover:text-indigo-800 transition-colors hover:underline">
              Open Drive Mapping →
            </button>
          </section>

          <div class="lg:col-span-2 flex justify-end">
            <button type="submit" [disabled]="saving()" class="bg-slate-900 text-white px-6 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50">
              {{ saving() ? 'Saving…' : 'Save job details' }}
            </button>
          </div>
        </form>
      }

      @if (activeTab() === 'financial') {
        <form class="space-y-6" (submit)="saveFinancial(); $event.preventDefault()">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="bg-white p-4 rounded-xl border border-slate-200">
              <p class="text-[10px] font-bold text-slate-500 uppercase mb-1">Current contract</p>
              <p class="text-lg font-bold">{{ financialSummary().revisedContract | currency }}</p>
              <p class="text-[10px] text-slate-400">incl. approved COs</p>
            </div>
            <div class="bg-white p-4 rounded-xl border border-slate-200">
              <p class="text-[10px] font-bold text-slate-500 uppercase mb-1">Approved COs</p>
              <p class="text-lg font-bold text-emerald-700">{{ financialSummary().approvedCOs | currency }}</p>
            </div>
            <div class="bg-white p-4 rounded-xl border border-slate-200">
              <p class="text-[10px] font-bold text-slate-500 uppercase mb-1">Budget total</p>
              <p class="text-lg font-bold">{{ budgetTotal() | currency }}</p>
            </div>
            <div class="bg-white p-4 rounded-xl border border-slate-200">
              <p class="text-[10px] font-bold text-slate-500 uppercase mb-1">Billed to date</p>
              <p class="text-lg font-bold">{{ financialSummary().billedToDate | currency }}</p>
            </div>
          </div>

          <section class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h3 class="text-xs font-bold uppercase tracking-widest text-slate-500">Contract</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Original contract ($)</label>
                <input type="number" [(ngModel)]="draft.originalContractAmount" name="contract" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Retainage %</label>
                <input type="number" [(ngModel)]="draft.retainagePercent" name="ret" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Billing type</label>
                <select [(ngModel)]="draft.billingType" name="billingType" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
                  <option [ngValue]="undefined">—</option>
                  <option value="Lump Sum">Lump Sum</option>
                  <option value="T&M">T&amp;M</option>
                  <option value="Progress Billing">Progress Billing</option>
                </select>
              </div>
            </div>
          </section>

          <section class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h3 class="text-xs font-bold uppercase tracking-widest text-slate-500">Budget totals (job level)</h3>
            <p class="text-xs text-slate-500">Use these when you do not have line-level budget yet. For detailed SOV lines, use the Budget Lines tab.</p>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Labor budget</label>
                <input type="number" [(ngModel)]="draft.estLaborCost" name="labor" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Material budget</label>
                <input type="number" [(ngModel)]="draft.estMaterialCost" name="mat" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Subcontractor budget</label>
                <input type="number" [(ngModel)]="draft.estSubCost" name="sub" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Other / equipment rental</label>
                <input type="number" [(ngModel)]="otherEquipmentBudget" name="otherEquip" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Total cost budget</label>
                <input type="number" [(ngModel)]="draft.estCostBudget" name="totalBudget" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
              </div>
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">WIP budget override ($)</label>
              <input type="number" [(ngModel)]="draft.wipBudgetOverride" name="wipBudget" class="w-full max-w-xs px-3 py-2 rounded-lg border border-slate-300 text-sm">
            </div>
          </section>

          <div class="flex flex-wrap gap-3 justify-end">
            <button type="button" (click)="activeTab.set('change-orders')" class="text-sm font-semibold text-slate-600 underline">
              Edit change orders →
            </button>
            <button type="button" (click)="activeTab.set('budget-lines')" class="text-sm font-semibold text-slate-600 underline">
              Edit budget lines →
            </button>
            <button type="submit" [disabled]="saving()" class="bg-slate-900 text-white px-6 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50">
              {{ saving() ? 'Saving…' : 'Save contract &amp; budget' }}
            </button>
          </div>
        </form>
      }

      @if (activeTab() === 'change-orders') {
        <app-co-tab [project]="project" />
      }

      @if (activeTab() === 'budget-lines') {
        <app-budget-tab [project]="project" [summary]="financialSummary()" />
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectRecordPanelComponent implements OnChanges {
  @Input({ required: true }) project!: Project;
  @Output() saveDrive = new EventEmitter<string>();
  @Output() saveSheet = new EventEmitter<string>();
  @Output() openUtility = new EventEmitter<UtilityView>();
  @Output() navigateFinancial = new EventEmitter<FinancialView>();

  private record = inject(ProjectRecordService);
  private data = inject(DataService);
  private financialSvc = inject(ProjectFinancialService);

  activeTab = signal<RecordTab>('details');
  saving = signal(false);
  saveMessage = signal<string | null>(null);

  draft: Partial<Project> = {};
  driveId = '';
  sheetId = '';
  otherEquipmentBudget = 0;

  statuses = PROJECT_STATUSES;
  profileOptions = PROJECT_PROFILE_OPTIONS;
  profileLabels = PROJECT_PROFILE_LABELS;

  readonly tabs: { id: RecordTab; label: string }[] = [
    { id: 'details', label: 'Job Details' },
    { id: 'financial', label: 'Contract & Budget' },
    { id: 'change-orders', label: 'Change Orders' },
    { id: 'budget-lines', label: 'Budget Lines' },
  ];

  changeOrders = toSignal(this.data.getChangeOrders(), { initialValue: [] as ChangeOrder[] });
  billings = toSignal(this.data.getBillings(), { initialValue: [] });

  financialSummary = computed(() =>
    getProjectFinancialSummary(
      this.project,
      (this.changeOrders() ?? []).filter(co => co.projectId === this.project.id),
      (this.billings() ?? []).filter(b => b.projectId === this.project.id),
    ),
  );

  budgetTotal = computed(() => {
    const p = this.project;
    if (p.estCostBudget) return p.estCostBudget;
    const sum = (p.estLaborCost ?? 0) + (p.estMaterialCost ?? 0) + (p.estSubCost ?? 0)
      + (p.estEquipmentCost ?? 0) + (p.estOtherCost ?? 0);
    if (sum > 0) return sum;
    return this.financialSvc.computeForProject(p).budgetAmount;
  });

  masterSheetLinked = computed(() => isMasterSheetLinkedProject(this.project));

  defaultForeman = computed(() => effectiveForeman(this.project));

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['project']) {
      this.resetDraft();
    }
  }

  readOnly(field: keyof Project): boolean {
    return isMasterSheetReadOnlyField(field, this.project);
  }

  onPrevailingWageChange(checked: boolean): void {
    this.draft.prevailingWage = checked;
    this.draft.certifiedPayrollRequired = deriveCertifiedPayrollRequired(checked);
    if (!checked) {
      this.draft.wageOrderNumber = '';
    }
  }

  async saveDetails(): Promise<void> {
    await this.persist(this.detailsPatch());
  }

  async saveFinancial(): Promise<void> {
    await this.persist(this.financialPatch());
  }

  private detailsPatch(): Partial<Project> {
    return stripMasterSheetFieldsFromUserPatch(this.project, {
      projectNumber: this.draft.projectNumber,
      projectName: this.draft.projectName,
      customer: this.draft.customer,
      status: this.draft.status,
      address: this.draft.address,
      county: this.draft.county,
      projectProfile: this.draft.projectProfile as ProjectProfile | undefined,
      superintendent: this.draft.superintendent,
      prevailingWage: this.draft.prevailingWage,
      certifiedPayrollRequired: this.draft.certifiedPayrollRequired,
      wageOrderNumber: this.draft.wageOrderNumber,
      estSubCost: this.draft.estSubCost,
    });
  }

  private financialPatch(): Partial<Project> {
    return {
      originalContractAmount: this.draft.originalContractAmount,
      retainagePercent: this.draft.retainagePercent,
      billingType: this.draft.billingType,
      estLaborCost: this.draft.estLaborCost,
      estMaterialCost: this.draft.estMaterialCost,
      estSubCost: this.draft.estSubCost,
      estEquipmentCost: undefined,
      estOtherCost: this.otherEquipmentBudget || undefined,
      estCostBudget: this.draft.estCostBudget,
      wipBudgetOverride: this.draft.wipBudgetOverride,
    };
  }

  private async persist(patch: Partial<Project>): Promise<void> {
    if (!Object.keys(patch).length) return;
    this.saving.set(true);
    this.saveMessage.set(null);
    try {
      await this.record.saveProject(this.project.id, patch);
      this.saveMessage.set('Saved to job record.');
    } catch {
      this.saveMessage.set('Save failed — try again.');
    } finally {
      this.saving.set(false);
    }
  }

  private resetDraft(): void {
    this.draft = { ...this.project };
    this.otherEquipmentBudget = (this.project.estEquipmentCost ?? 0) + (this.project.estOtherCost ?? 0);
    this.driveId = this.project.driveFolderId ?? '';
    this.sheetId = this.project.googleSheetId ?? '';
    this.saveMessage.set(null);
  }
}
