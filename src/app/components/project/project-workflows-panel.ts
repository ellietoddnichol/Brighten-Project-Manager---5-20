import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Project } from '@app/models/types';
import { ProjectEnabledModules } from '@app/models/project-needs.types';
import { WORKFLOW_VIEW_LABELS, WorkflowView } from './project-detail.types';
import { TasksTabComponent } from '@features/projects/pages/tasks-tab';
import { ChangesTabComponent } from '@features/projects/pages/changes-tab';
import { RfisTabComponent } from '@features/projects/pages/rfis-tab';
import { SubmittalsTabComponent } from '@features/projects/pages/submittals-tab';
import { DailyLogsTabComponent } from '@features/projects/pages/daily-logs-tab';
import { FieldIssuesTabComponent } from '@features/projects/pages/field-issues-tab';
import { CertifiedPayrollTabComponent } from '@features/projects/pages/certified-payroll-tab';
import { DataService } from '@core/services/data.service';
import { CertifiedPayrollDataService } from '@features/labor/services/certified-payroll-data.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { normalizeWorkflowView } from './project-navigation';
import { EmptyStateComponent } from '../ui/empty-state';
import { ListRowComponent } from '../ui/list-row';
import { DetailDrawerComponent, DrawerSectionComponent, DrawerFieldComponent } from '../ui/detail-drawer';
import { SegmentedControlComponent, SegmentOption } from '../ui/segmented-control';
import { emptyModuleMessage } from '@features/projects/utils/project-needs.compute';
import {
  buildAllWorkList,
  ChangeListSegment,
  requiredWorkPrompts,
  TaskFilterSegment,
  workItemToListRow,
  WorkListItem,
} from '@features/projects/utils/project-work.compute';

@Component({
  selector: 'app-project-workflows-panel',
  standalone: true,
  imports: [
    CommonModule, MatIconModule,
    TasksTabComponent, ChangesTabComponent, RfisTabComponent, SubmittalsTabComponent,
    DailyLogsTabComponent, FieldIssuesTabComponent, CertifiedPayrollTabComponent,
    EmptyStateComponent, ListRowComponent,
    DetailDrawerComponent, DrawerSectionComponent, DrawerFieldComponent,
    SegmentedControlComponent,
  ],
  template: `
    <div class="space-y-5">
      <div class="flex flex-wrap items-center gap-2">
        @for (seg of primarySegments(); track seg.id) {
          <button type="button" (click)="selectView(seg.id)"
                  [class.bg-slate-900]="normalizedView() === seg.id"
                  [class.text-white]="normalizedView() === seg.id"
                  class="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold transition-colors hover:bg-slate-50">
            {{ seg.label }}
          </button>
        }
        @if (moreSegments().length) {
          <div class="relative">
            <button type="button" (click)="moreOpen.set(!moreOpen())"
                    class="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold bg-white hover:bg-slate-50 flex items-center gap-1">
              More
              @if (moreBadgeCount() > 0) {
                <span class="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{{ moreBadgeCount() }}</span>
              }
            </button>
            @if (moreOpen()) {
              <div class="absolute z-20 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[180px]">
                @for (seg of moreSegments(); track seg.id) {
                  <button type="button" (click)="selectView(seg.id); moreOpen.set(false)"
                          class="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 flex justify-between gap-2">
                    <span>{{ seg.label }}</span>
                    @if (seg.badge) {
                      <span class="text-xs font-bold text-amber-700">{{ seg.badge }}</span>
                    }
                  </button>
                }
              </div>
            }
          </div>
        }
      </div>

      @if (normalizedView() === 'all-work') {
        @for (prompt of workPrompts(); track prompt.id) {
          <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p class="text-sm font-semibold text-amber-900">{{ prompt.label }}</p>
            <button type="button" (click)="selectView(prompt.view)"
                    class="text-xs font-bold text-indigo-700 underline">{{ prompt.actionLabel }}</button>
          </div>
        }

        @if (allWorkRows().length) {
          <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div class="px-5 py-3 border-b bg-slate-50 text-sm font-bold text-slate-900">Active work</div>
            @for (row of allWorkRows(); track row.id) {
              @let display = workRowDisplay(row);
              <app-list-row
                [title]="display.title"
                [subtitle]="display.subtitle"
                [metrics]="display.metrics"
                [chips]="display.chips"
                [nextAction]="display.nextAction"
                [health]="display.health"
                (rowClick)="openWorkDrawer(row)" />
            }
          </div>
        } @else if (!workPrompts().length) {
          <app-empty-state
            title="Nothing needed here right now."
            message="Open tasks or changes will show up here." />
        }
      }

      @if (normalizedView() === 'tasks') {
        <app-segmented-control
          [options]="taskSegmentOptions"
          [value]="taskSegment()"
          (select)="taskSegment.set($event)" />
        <app-tasks-tab
          [project]="project"
          [simplified]="true"
          [filterSegment]="taskSegment()" />
      }

      @if (normalizedView() === 'changes') {
        <app-segmented-control
          [options]="changeSegmentOptions"
          [value]="changeSegment()"
          (select)="changeSegment.set($event)" />
        <app-changes-tab
          [project]="project"
          [simplified]="!modules.showAllTools"
          [showAllTools]="modules.showAllTools"
          [changeSegment]="changeSegment()" />
      }

      @if (normalizedView() === 'field') {
        @if (fieldHasRecords()) {
          <div class="space-y-6">
            @if (projectLogs().length) {
              <app-daily-logs-tab [project]="project" />
            }
            @if (projectFieldIssues().length) {
              <app-field-issues-tab [project]="project" />
            }
            @if (fieldPhotosCount() > 0) {
              <div class="bg-white rounded-xl border border-slate-200 px-5 py-4 text-sm text-slate-600">
                {{ fieldPhotosCount() }} field photo(s) attached to daily logs.
              </div>
            }
          </div>
        } @else {
          <app-empty-state
            title="Nothing in the field log right now."
            message="Field issues, daily logs, and photos appear here when records exist." />
        }
      }

      @if (normalizedView() === 'rfis') { <app-rfis-tab [project]="project" /> }
      @if (normalizedView() === 'submittals') { <app-submittals-tab [project]="project" /> }
      @if (normalizedView() === 'daily-logs') { <app-daily-logs-tab [project]="project" /> }
      @if (normalizedView() === 'field-issues') { <app-field-issues-tab [project]="project" /> }
      @if (normalizedView() === 'certified-payroll') { <app-certified-payroll-tab [project]="project" /> }

      @if (normalizedView() === 'safety') {
        @if (safetyHasRecords()) {
          <app-field-issues-tab [project]="project" />
        } @else {
          <app-empty-state
            title="No safety records yet."
            [message]="emptyModuleMessage('safety')" />
        }
      }

      @if (normalizedView() === 'inspections') {
        @if (inspectionHasRecords()) {
          <app-daily-logs-tab [project]="project" />
        } @else {
          <app-empty-state
            title="No inspection records yet."
            [message]="emptyModuleMessage('inspections')" />
        }
      }

      <app-detail-drawer
        [open]="!!selectedWork()"
        [title]="selectedWork()?.title ?? 'Work item'"
        [subtitle]="selectedWork()?.itemType"
        [footerActionLabel]="selectedWork()?.nextAction"
        (close)="selectedWork.set(null)"
        (footerAction)="goToSelectedWork()">
        @if (selectedWork(); as item) {
          <app-drawer-section title="Summary">
            <p class="text-sm text-slate-700">{{ item.summary }}</p>
          </app-drawer-section>
          <app-drawer-section title="Status">
            <app-drawer-field label="Status" [value]="item.status" />
            @if (item.date) {
              <app-drawer-field [label]="item.dateLabel" [value]="item.date" />
            }
            @if (item.amount != null && item.amount > 0) {
              <app-drawer-field label="Amount" [value]="fmt(item.amount)" [mono]="true" />
            }
          </app-drawer-section>
          <app-drawer-section title="Linked Documents">
            <p class="text-sm text-slate-500 italic">Open the workflow tab to manage linked documents.</p>
          </app-drawer-section>
          <app-drawer-section title="Related Records">
            @for (rel of item.relatedRecords; track rel.label) {
              <app-drawer-field [label]="rel.label" [value]="rel.value" />
            }
          </app-drawer-section>
          <app-drawer-section title="Next Action">
            <p class="text-sm font-semibold text-indigo-800">{{ item.nextAction }}</p>
          </app-drawer-section>
          @if (item.notes) {
            <app-drawer-section title="Notes">
              <p class="text-sm text-slate-600 whitespace-pre-wrap">{{ item.notes }}</p>
            </app-drawer-section>
          }
        }
      </app-detail-drawer>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectWorkflowsPanelComponent {
  @Input({ required: true }) project!: Project;
  @Input({ required: true }) activeView!: WorkflowView;
  @Input({ required: true }) modules!: ProjectEnabledModules;
  @Output() viewChange = new EventEmitter<WorkflowView>();

  private data = inject(DataService);
  private cprData = inject(CertifiedPayrollDataService);

  moreOpen = signal(false);
  selectedWork = signal<WorkListItem | null>(null);
  taskSegment = signal<TaskFilterSegment>('all');
  changeSegment = signal<ChangeListSegment>('all');
  readonly emptyModuleMessage = emptyModuleMessage;

  readonly taskSegmentOptions: SegmentOption<TaskFilterSegment>[] = [
    { id: 'all', label: 'All' },
    { id: 'due-soon', label: 'Due Soon' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'completed', label: 'Completed' },
  ];

  readonly changeSegmentOptions: SegmentOption<ChangeListSegment>[] = [
    { id: 'all', label: 'All' },
    { id: 'pricing', label: 'Pricing Needed' },
    { id: 'awaiting', label: 'Sent / Awaiting Approval' },
    { id: 'approved', label: 'Approved / Bill' },
    { id: 'closed', label: 'Closed' },
  ];

  tasks = toSignal(this.data.getProjectTasks(), { initialValue: [] });
  changeRequests = toSignal(this.data.getChangeRequests(), { initialValue: [] });
  changeOrders = toSignal(this.data.getChangeOrders(), { initialValue: [] });
  rfis = toSignal(this.data.getRfis(), { initialValue: [] });
  submittals = toSignal(this.data.getSubmittals(), { initialValue: [] });
  logs = toSignal(this.data.getDailyLogs(), { initialValue: [] });
  fieldIssues = toSignal(this.data.getFieldIssues(), { initialValue: [] });
  cprWeeks = toSignal(this.cprData.getWeeks(), { initialValue: [] });

  projectLogs = computed(() => this.logs().filter(l => l.projectId === this.project.id));
  projectFieldIssues = computed(() => this.fieldIssues().filter(f => f.projectId === this.project.id));
  fieldHasRecords = computed(() => this.projectLogs().length > 0 || this.projectFieldIssues().length > 0);
  fieldPhotosCount = computed(() =>
    this.projectLogs().reduce((n, l) => n + (l.photos?.length ?? l.photoUrls?.length ?? 0), 0),
  );
  safetyHasRecords = computed(() =>
    this.projectFieldIssues().some(i => i.issueType === 'Safety')
    || this.projectLogs().some(l => !!l.safetyIssues?.trim()),
  );
  inspectionHasRecords = computed(() => this.projectLogs().some(l => !!l.inspections?.trim()));

  normalizedView = computed(() => normalizeWorkflowView(this.activeView));

  workBuildInput = computed(() => ({
    projectId: this.project.id,
    showAllTools: this.modules.showAllTools,
    requiresRfis: this.modules.profile === 'FullProject' || this.modules.profile === 'Subcontracted',
    requiresSubmittals: this.modules.profile === 'FullProject' || this.modules.profile === 'Subcontracted' || this.modules.profile === 'SmallInstall',
    requiresDailyLogs: this.modules.profile === 'TMWorkOrder' || this.modules.profile === 'FullProject' || this.modules.profile === 'Subcontracted',
    certifiedPayrollRequired: !!this.project.certifiedPayrollRequired,
    prevailingWage: !!this.project.prevailingWage,
    showRfis: this.modules.workMore.includes('rfis') || this.modules.showAllTools,
    showSubmittals: this.modules.workMore.includes('submittals') || this.modules.showAllTools,
    showDailyLogs: this.modules.workMore.includes('daily-logs') || this.modules.showAllTools,
    showFieldIssues: this.modules.workMore.includes('field-issues') || this.modules.showAllTools,
    showCpr: this.modules.workMore.includes('certified-payroll') || this.modules.showAllTools,
    hasRFIs: this.rfis().some(r => r.projectId === this.project.id),
    hasSubmittals: this.submittals().some(s => s.projectId === this.project.id),
    hasDailyLogs: this.projectLogs().length > 0,
    hasFieldIssues: this.projectFieldIssues().length > 0,
    hasCPRRecords: this.cprWeeks().some(w => w.projectId === this.project.id),
    tasks: this.tasks(),
    changeRequests: this.changeRequests(),
    changeOrders: this.changeOrders(),
    rfis: this.rfis(),
    submittals: this.submittals(),
    dailyLogs: this.logs(),
    fieldIssues: this.fieldIssues(),
    cprWeeks: this.cprWeeks(),
  }));

  allWorkRows = computed(() => buildAllWorkList(this.workBuildInput()));
  workPrompts = computed(() => requiredWorkPrompts(this.workBuildInput()));

  primarySegments = computed(() =>
    this.modules.workPrimary.map(id => ({
      id,
      label: WORKFLOW_VIEW_LABELS[id] ?? id,
    })),
  );

  moreSegments = computed(() => {
    const pid = this.project.id;
    return this.modules.workMore.map(id => {
      let badge: number | undefined;
      if (id === 'rfis') badge = this.rfis().filter(r => r.projectId === pid && r.status !== 'Closed').length || undefined;
      if (id === 'submittals') badge = this.submittals().filter(s => s.projectId === pid && !['Approved', 'Approved as Noted', 'Closed'].includes(s.status)).length || undefined;
      if (id === 'field-issues') badge = this.fieldIssues().filter(f => f.projectId === pid && f.status !== 'Closed').length || undefined;
      if (id === 'certified-payroll') badge = this.cprWeeks().filter(w => w.projectId === pid && w.status !== 'exported').length || undefined;
      return { id, label: WORKFLOW_VIEW_LABELS[id] ?? id, badge };
    });
  });

  moreBadgeCount = computed(() =>
    this.moreSegments().reduce((s, seg) => s + (seg.badge ?? 0), 0),
  );

  workRowDisplay = (row: WorkListItem) => workItemToListRow(row);

  fmt(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }

  openWorkDrawer(row: WorkListItem): void {
    this.selectedWork.set(row);
  }

  goToSelectedWork(): void {
    const item = this.selectedWork();
    if (!item) return;
    this.selectedWork.set(null);
    this.selectView(item.view);
  }

  selectView(view: WorkflowView): void {
    this.viewChange.emit(normalizeWorkflowView(view));
  }
}
