import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  inject,
  signal,
  computed,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Project, ChangeOrder } from '@app/models/types';
import { ProjectFinancialSummary } from '@shared/utils/financial';
import { formatProjectDate, isOverheadJob } from '@shared/utils/project';
import { PROJECT_PROFILE_LABELS } from '@app/models/project-requirements.types';
import { WorkflowChip, WorkflowView, FinancialView, ProjectNavState } from './project-detail.types';
import { ControlNextAction } from '@app/models/active-2026-control.types';
import { ActionItem } from '@shared/utils/action-items';
import { StatCardComponent } from '@app/components/ui/stat-card';
import { DataService } from '@core/services/data.service';
import { ProjectApiService } from '@core/services/api/project-api.service';
import { buildProjectApiUpdatePayload, hasApiUpdateFields } from '@core/services/api/project-api-update';
import { apiConfig } from '@app/config/api.config';
import { DriveService } from '@core/services/drive.service';
import { ActivityEventsService } from '@core/services/activity-events.service';
import { ActivityEvent } from '@app/models/activity-event.types';

export interface ActivityRow {
  id: string;
  title: string;
  description?: string;
  activityType: string;
  createdAt?: unknown;
}

type EditableField =
  | 'projectName'
  | 'address'
  | 'owner'
  | 'customer'
  | 'superintendent'
  | 'projectManager'
  | 'scopeSummary';

interface ActivityDisplayRow {
  id: string;
  timestamp: string;
  description: string;
}

@Component({
  selector: 'app-project-overview-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, StatCardComponent],
  template: `
    @if (project && !isOverheadJob(project)) {
      <div class="p-5 space-y-6">
        <!-- Stat cards + Drive link inline -->
        <div class="flex flex-wrap items-start gap-4">
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
            <app-stat-card label="Contract Value" [value]="statValue(summary.revisedContract)" icon="payments" />
            <app-stat-card label="Billed to Date" [value]="statValue(summary.billedToDate)" icon="receipt_long" />
            <app-stat-card label="Remaining" [value]="statValue(summary.leftToBill)" icon="account_balance_wallet" />
            <app-stat-card label="% Complete" [value]="percentCompleteLabel()" icon="trending_up" />
          </div>
          @if (project.driveFolderId) {
            <a [href]="driveService.folderUrl(project.driveFolderId)" target="_blank" rel="noopener"
               class="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50
                      px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors shrink-0 self-start mt-1">
              <span class="material-icons !text-[14px]">folder</span>
              Open Drive Folder
            </a>
          }
        </div>

        <!-- Unified info section: 2-col grid with dividers between groups -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          <!-- Project Information -->
          <div class="p-5">
            <h3 class="text-xs text-slate-500 font-medium mb-3">Project Information</h3>
            <div class="grid sm:grid-cols-2 gap-x-6 gap-y-4">
              @for (field of infoFields; track field.key) {
                <div>
                  <div class="text-xs text-slate-500 font-medium">{{ field.label }}</div>
                  <div class="mt-0.5 flex items-center gap-1 min-w-0">
                    @if (editingField() === field.key) {
                      @if (field.key === 'scopeSummary') {
                        <textarea [(ngModel)]="editValue" rows="3"
                                  class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 resize-y"
                                  (blur)="saveField(field.key)"
                                  (keydown.escape)="cancelEdit($event)"></textarea>
                      } @else {
                        <input type="text" [(ngModel)]="editValue"
                               class="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
                               (blur)="saveField(field.key)"
                               (keydown.enter)="saveField(field.key)"
                               (keydown.escape)="cancelEdit($event)" />
                      }
                    } @else {
                      <span class="text-sm text-slate-900 min-w-0 truncate">{{ displayValue(field.key) }}</span>
                      @if (field.editable) {
                        <span class="material-icons !text-[14px] text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
                              (click)="startEdit($any(field.key))">edit</span>
                      }
                    }
                  </div>
                  @if (field.key === 'scopeSummary' && editingField() === 'scopeSummary') {
                    <p class="text-xs text-slate-400 mt-1">{{ editValue.length }} characters</p>
                  }
                </div>
              }
            </div>
          </div>

          <!-- Contacts -->
          <div class="p-5">
            <h3 class="text-xs text-slate-500 font-medium mb-3">Contacts</h3>
            <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
              <div>
                <div class="text-xs text-slate-500 font-medium">Owner</div>
                <div class="mt-0.5 flex items-center gap-1">
                  @if (editingField() === 'owner') {
                    <input type="text" [(ngModel)]="editValue"
                           class="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                           (blur)="saveField('owner')"
                           (keydown.escape)="cancelEdit($event)" />
                  } @else {
                    <span class="text-sm text-slate-900">{{ project.owner || '—' }}</span>
                    <span class="material-icons !text-[14px] text-slate-400 hover:text-slate-700 cursor-pointer"
                          (click)="startEdit('owner')">edit</span>
                  }
                </div>
              </div>
              <div>
                <div class="text-xs text-slate-500 font-medium">GC / Customer</div>
                <div class="mt-0.5 flex items-center gap-1">
                  @if (editingField() === 'customer') {
                    <input type="text" [(ngModel)]="editValue"
                           class="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                           (blur)="saveField('customer')"
                           (keydown.escape)="cancelEdit($event)" />
                  } @else {
                    <span class="text-sm text-slate-900">{{ project.customer || '—' }}</span>
                    <span class="material-icons !text-[14px] text-slate-400 hover:text-slate-700 cursor-pointer"
                          (click)="startEdit('customer')">edit</span>
                  }
                </div>
              </div>
              <div>
                <div class="text-xs text-slate-500 font-medium">Project Manager</div>
                <div class="mt-0.5 flex items-center gap-1">
                  @if (editingField() === 'projectManager') {
                    <input type="text" [(ngModel)]="editValue"
                           class="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                           (blur)="saveField('projectManager')"
                           (keydown.escape)="cancelEdit($event)" />
                  } @else {
                    <span class="text-sm text-slate-900">{{ project.projectManager || '—' }}</span>
                    <span class="material-icons !text-[14px] text-slate-400 hover:text-slate-700 cursor-pointer"
                          (click)="startEdit('projectManager')">edit</span>
                  }
                </div>
              </div>
              <div>
                <div class="text-xs text-slate-500 font-medium">Superintendent / Foreman</div>
                <div class="mt-0.5 flex items-center gap-1">
                  @if (editingField() === 'superintendent') {
                    <input type="text" [(ngModel)]="editValue"
                           class="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                           (blur)="saveField('superintendent')"
                           (keydown.escape)="cancelEdit($event)" />
                  } @else {
                    <span class="text-sm text-slate-900">{{ project.superintendent || '—' }}</span>
                    <span class="material-icons !text-[14px] text-slate-400 hover:text-slate-700 cursor-pointer"
                          (click)="startEdit('superintendent')">edit</span>
                  }
                </div>
              </div>
            </div>
          </div>

          <!-- Schedule -->
          <div class="p-5">
            <h3 class="text-xs text-slate-500 font-medium mb-3">Schedule</h3>
            <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
              <div>
                <div class="text-xs text-slate-500 font-medium">Start Date</div>
                <div class="text-sm text-slate-900 mt-0.5">{{ date(project.startDate) }}</div>
              </div>
              <div>
                <div class="text-xs text-slate-500 font-medium">Projected End</div>
                <div class="text-sm mt-0.5" [class.text-rose-700]="endDateOverdue()">
                  {{ date(project.targetCompletionDate) }}
                </div>
              </div>
              <div>
                <div class="text-xs text-slate-500 font-medium">Award Date</div>
                <div class="text-sm text-slate-900 mt-0.5">{{ date(project.awardDate) }}</div>
              </div>
              <div>
                <div class="text-xs text-slate-500 font-medium">Current Phase</div>
                <div class="text-sm text-slate-900 mt-0.5">{{ project.currentPhase || '—' }}</div>
              </div>
            </div>
          </div>

          <!-- Notes & Scope -->
          <div class="p-5">
            <h3 class="text-xs text-slate-500 font-medium mb-3">Notes &amp; Scope</h3>
            @if (editingField() === 'scopeSummary') {
              <textarea [(ngModel)]="editValue" rows="3"
                        class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 resize-y"
                        (blur)="saveField('scopeSummary')"
                        (keydown.escape)="cancelEdit($event)"></textarea>
              <p class="text-xs text-slate-400 mt-1">{{ editValue.length }} characters</p>
            } @else {
              <p class="text-sm text-slate-900 whitespace-pre-line">{{ project.scopeSummary?.trim() || 'No notes yet.' }}</p>
              <button type="button" (click)="startEdit('scopeSummary')"
                      class="mt-2 text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition-colors">
                Edit notes
              </button>
            }
          </div>
        </div>

        <!-- Recent Activity -->
        <section class="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div class="flex items-center justify-between gap-3 mb-3">
            <h3 class="text-sm font-bold text-slate-900">Recent Activity</h3>
            @if (activityRows().length > 5) {
              <button type="button" (click)="activityExpanded.set(!activityExpanded())"
                      class="text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors">
                {{ activityExpanded() ? 'Show less' : 'View all activity' }}
              </button>
            }
          </div>
          @if (activityRows().length) {
            <ul class="space-y-2">
              @for (row of visibleActivity(); track row.id) {
                <li>
                  <div class="text-xs text-slate-400">{{ row.timestamp }}</div>
                  <div class="text-xs text-slate-600">{{ row.description }}</div>
                </li>
              }
            </ul>
          } @else {
            <p class="text-xs text-slate-500">No activity recorded yet.</p>
          }
        </section>
      </div>
    } @else if (project) {
      <div class="p-5 bg-white rounded-xl border border-slate-200 text-center text-slate-600 text-sm">
        Overhead project — use Work and Money for POs and time tracking.
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectOverviewPanelComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) project!: Project;
  @Input({ required: true }) summary!: ProjectFinancialSummary;
  @Input({ required: true }) actionItems: ActionItem[] = [];
  @Input({ required: true }) activityFeed: ActivityRow[] = [];
  @Input({ required: true }) latestChangeOrders: ChangeOrder[] = [];
  @Input({ required: true }) visibleWorkflowChips: WorkflowChip[] = [];
  @Input() lifecycleGroup = '';
  @Input() nextAction?: ControlNextAction;

  @Output() navigateWorkflow = new EventEmitter<WorkflowView | 'billing'>();
  @Output() navigateFinancial = new EventEmitter<FinancialView>();
  @Output() navigateAction = new EventEmitter<ProjectNavState>();
  @Output() editProject = new EventEmitter<void>();

  readonly driveService = inject(DriveService);
  private data = inject(DataService);
  private projectApi = inject(ProjectApiService);
  private activityEvents = inject(ActivityEventsService);

  isOverheadJob = isOverheadJob;

  editingField = signal<EditableField | null>(null);
  editValue = '';
  activityExpanded = signal(false);
  private firestoreActivity = signal<ActivityEvent[]>([]);

  readonly infoFields: { key: EditableField | 'projectNumber' | 'status' | 'profile'; label: string; editable: boolean }[] = [
    { key: 'projectNumber', label: 'Job Number', editable: false },
    { key: 'projectName', label: 'Project Name', editable: true },
    { key: 'status', label: 'Status', editable: false },
    { key: 'profile', label: 'Profile', editable: false },
    { key: 'address', label: 'Address', editable: true },
  ];
  private activitySub?: Subscription;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['project'] && this.project?.id) {
      this.activitySub?.unsubscribe();
      this.activitySub = this.activityEvents.getProjectEvents(this.project.id)
        .subscribe(events => this.firestoreActivity.set(events));
    }
  }

  activityRows = computed((): ActivityDisplayRow[] => {
    const fromFirestore = this.firestoreActivity().map(e => ({
      id: e.id,
      timestamp: this.formatActivityTime(e.createdAt),
      description: e.description ? `${e.title} — ${e.description}` : e.title,
    }));
    const fromFeed = this.activityFeed.map(row => ({
      id: row.id,
      timestamp: this.formatActivityTime(row.createdAt),
      description: row.description ? `${row.title} — ${row.description}` : row.title,
    }));
    return fromFirestore.length ? fromFirestore : fromFeed;
  });

  visibleActivity = computed(() => {
    const rows = this.activityRows();
    return this.activityExpanded() ? rows : rows.slice(0, 5);
  });

  ngOnDestroy(): void {
    this.activitySub?.unsubscribe();
  }

  statValue(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  }

  percentCompleteLabel(): string {
    const pct = this.summary.percentComplete;
    if (pct === null || pct === undefined || !Number.isFinite(pct)) return '—';
    return `${pct.toFixed(1)}%`;
  }

  displayValue(key: EditableField | 'projectNumber' | 'status' | 'profile'): string {
    switch (key) {
      case 'projectNumber': return this.project.projectNumber || '—';
      case 'status': return this.project.status || '—';
      case 'profile': return this.projectProfileLabel();
      case 'projectName': return this.project.projectName || '—';
      case 'address': return this.project.address?.trim() || this.projectLocation();
      case 'owner': return this.project.owner || '—';
      case 'superintendent': return this.project.superintendent || '—';
      case 'projectManager': return this.project.projectManager || '—';
      case 'scopeSummary': return this.project.scopeSummary?.trim() || '—';
      default: return '—';
    }
  }

  startEdit(field: EditableField): void {
    this.editingField.set(field);
    this.editValue = field === 'address'
      ? (this.project.address?.trim() ?? '')
      : String(this.project[field] ?? '').trim();
  }

  cancelEdit(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.editingField.set(null);
    this.editValue = '';
  }

  saveField(field: EditableField): void {
    const next = this.editValue.trim();
    const current = String(this.project[field] ?? '').trim();
    this.editingField.set(null);
    if (next === current) return;

    const patch: Partial<Project> = { [field]: next || undefined };
    const id = this.project.id;

    if (apiConfig.useApiBackend && this.projectApi.isEnabled()) {
      const apiPatch = buildProjectApiUpdatePayload(this.project, patch);
      if (hasApiUpdateFields(apiPatch)) {
        void this.projectApi.updateProject(this.project.projectNumber || id, apiPatch);
      }
      return;
    }

    this.data.updateProject(id, patch).subscribe();
  }

  endDateOverdue(): boolean {
    const end = this.project.targetCompletionDate;
    if (!end) return false;
    const active = this.project.status === 'Active' || this.project.status === 'Awarded';
    if (!active) return false;
    const endMs = new Date(`${end}`.slice(0, 10) + 'T00:00:00').getTime();
    return Number.isFinite(endMs) && endMs < Date.now();
  }

  projectProfileLabel(): string {
    const profile = this.project.projectProfile;
    return profile ? (PROJECT_PROFILE_LABELS[profile] ?? profile) : 'Not set';
  }

  projectLocation(): string {
    const cityState = [this.project.city, this.project.state].filter(Boolean).join(', ');
    const parts = [
      this.project.address,
      cityState,
      this.project.county ? `${this.project.county} County` : undefined,
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Not available';
  }

  date(value: string | null | undefined): string {
    if (!value) return '—';
    return formatProjectDate(value) || '—';
  }

  private formatActivityTime(value: unknown): string {
    if (!value) return '—';
    if (typeof value === 'object' && value !== null && 'seconds' in value) {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
      }).format(new Date(Number((value as { seconds: number }).seconds) * 1000));
    }
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(d);
  }

  onChip(id: string): void {
    if (id === 'billing') {
      this.navigateFinancial.emit('billing');
    } else {
      this.navigateWorkflow.emit(id as WorkflowView);
    }
  }
}
