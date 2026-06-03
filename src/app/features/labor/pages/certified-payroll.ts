import { Component, ChangeDetectionStrategy, computed, inject, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { HiddenModuleBannerComponent } from '@app/components/layout/hidden-module-banner';
import { StatCardComponent } from '@app/components/ui/stat-card';
import { StatusChipComponent, StatusTone } from '@app/components/ui/status-chip';
import { CertifiedPayrollService } from '@features/labor/services/certified-payroll.service';
import { CertifiedPayrollDataService } from '@features/labor/services/certified-payroll-data.service';
import { DataService } from '@core/services/data.service';
import { CertifiedPayrollException, CertifiedPayrollTask, CertifiedPayrollWeek } from '@app/models/certified-payroll.types';
import { Project } from '@app/models/types';

type CprTab = 'dashboard' | 'tasks' | 'weeks' | 'exceptions';

@Component({
  selector: 'app-certified-payroll',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    PageHeaderComponent,
    HiddenModuleBannerComponent,
    StatCardComponent,
    StatusChipComponent,
  ],
  providers: [CurrencyPipe, DecimalPipe],
  template: `
    <div class="p-6 lg:p-8 w-full max-w-[1440px] mx-auto">
      <app-hidden-module-banner moduleId="certified-payroll" />
      @if (cpr.exportBanner()) {
        <div class="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          {{ cpr.exportBanner() }}
        </div>
      }

      @if (cpr.lastMessage()) {
        <div class="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{{ cpr.lastMessage() }}</div>
      }
      @if (cpr.lastError()) {
        <div class="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{{ cpr.lastError() }}</div>
      }

      <app-page-header
        title="Certified Payroll Compliance"
        subtitle="Prepare, validate, and export prevailing wage certified payroll drafts from approved time logs."
        [hasActions]="true">
        <button type="button" (click)="generate()" [disabled]="cpr.loading()"
                class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
          <mat-icon class="!text-[18px]">{{ cpr.loading() ? 'hourglass_empty' : 'play_arrow' }}</mat-icon>
          Generate Weekly Drafts
        </button>
        <a routerLink="/settings" class="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
          Connect export sheet <mat-icon class="!text-[16px] w-4 h-4">settings</mat-icon>
        </a>
      </app-page-header>

      <div class="flex flex-wrap gap-2 mb-6 border-b border-slate-200 pb-1">
        @for (tab of tabs; track tab.id) {
          <button type="button" (click)="activeTab.set(tab.id)"
                  class="px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors"
                  [class.bg-white]="activeTab() === tab.id"
                  [class.text-blue-700]="activeTab() === tab.id"
                  [class.border]="activeTab() === tab.id"
                  [class.border-slate-200]="activeTab() === tab.id"
                  [class.border-b-white]="activeTab() === tab.id"
                  [class.-mb-px]="activeTab() === tab.id"
                  [class.text-slate-500]="activeTab() !== tab.id">
            <mat-icon class="!text-[16px] align-middle mr-1">{{ tab.icon }}</mat-icon>
            {{ tab.label }}
            @if (tab.id === 'exceptions' && openExceptions().length) {
              <span class="ml-1 px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px]">{{ openExceptions().length }}</span>
            }
          </button>
        }
      </div>

      @if (activeTab() === 'dashboard') {
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <app-stat-card label="CPR Projects" [value]="kpiCertifiedProjects()" icon="gavel" />
          <app-stat-card label="Open Tasks" [value]="kpiOpenTasks()" icon="task_alt" />
          <app-stat-card label="Ready Weeks" [value]="kpiReadyWeeks()" icon="check_circle" />
          <app-stat-card label="Open Exceptions" [value]="kpiOpenExceptions()" icon="warning" />
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-200 bg-slate-50">
              <h2 class="text-sm font-bold text-slate-900">Prevailing Wage Projects</h2>
            </div>
            <div class="divide-y divide-slate-100">
              @for (project of cprProjects(); track project.id) {
                <a [routerLink]="['/projects', project.id]" [queryParams]="{ tab: 'certified-payroll' }"
                   class="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                  <div>
                    <div class="font-medium text-slate-900">#{{ project.projectNumber }} {{ project.projectName }}</div>
                    <div class="text-xs text-slate-500">{{ project.payrollComplianceType || 'Compliance not set' }} · {{ project.certifiedPayrollStatus || 'Not Started' }}</div>
                  </div>
                  <mat-icon class="text-slate-400">chevron_right</mat-icon>
                </a>
              } @empty {
                <div class="px-5 py-10 text-center text-slate-400 italic">No prevailing wage projects flagged yet.</div>
              }
            </div>
          </div>

          <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-200 bg-slate-50">
              <h2 class="text-sm font-bold text-slate-900">Recent Weekly Drafts</h2>
            </div>
            <div class="divide-y divide-slate-100">
              @for (week of recentWeeks(); track week.id) {
                <div class="flex items-center justify-between px-5 py-3">
                  <div>
                    <div class="font-medium text-slate-900">{{ projectLabel(week.projectId) }} · Week ending {{ week.weekEnding }}</div>
                    <div class="text-xs text-slate-500">{{ week.entryCount }} entries · {{ week.totalHours | number:'1.1-1' }} hrs · {{ week.exceptionCount }} exceptions</div>
                  </div>
                  <app-status-chip [tone]="weekTone(week.status)">{{ week.status }}</app-status-chip>
                </div>
              } @empty {
                <div class="px-5 py-10 text-center text-slate-400 italic">Generate drafts to see weekly payroll records.</div>
              }
            </div>
          </div>
        </div>
      }

      @if (activeTab() === 'tasks') {
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="text-[10px] uppercase font-bold text-slate-400 tracking-wider border-b border-slate-100">
                <th class="px-5 py-3">Project</th>
                <th class="px-5 py-3">Task</th>
                <th class="px-5 py-3">Priority</th>
                <th class="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (task of allTasks(); track task.id) {
                <tr class="hover:bg-slate-50">
                  <td class="px-5 py-3 text-slate-700">{{ projectLabel(task.projectId) }}</td>
                  <td class="px-5 py-3">
                    <div class="font-medium text-slate-900">{{ task.title }}</div>
                    <div class="text-xs text-slate-500">{{ task.description }}</div>
                  </td>
                  <td class="px-5 py-3 text-slate-600">{{ task.priority || 'Medium' }}</td>
                  <td class="px-5 py-3"><app-status-chip [tone]="taskTone(task.status)">{{ task.status }}</app-status-chip></td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="px-5 py-10 text-center text-slate-400 italic">No certified payroll tasks yet.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (activeTab() === 'weeks') {
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="text-[10px] uppercase font-bold text-slate-400 tracking-wider border-b border-slate-100">
                <th class="px-5 py-3">Project</th>
                <th class="px-5 py-3">Week Ending</th>
                <th class="px-5 py-3 text-right">Hours</th>
                <th class="px-5 py-3">Entries</th>
                <th class="px-5 py-3">Status</th>
                <th class="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (week of allWeeks(); track week.id) {
                <tr class="hover:bg-slate-50">
                  <td class="px-5 py-3 text-slate-700">{{ projectLabel(week.projectId) }}</td>
                  <td class="px-5 py-3 font-medium">{{ week.weekEnding }}</td>
                  <td class="px-5 py-3 text-right font-mono text-xs">{{ week.totalHours | number:'1.1-1' }}</td>
                  <td class="px-5 py-3">{{ week.entryCount }}</td>
                  <td class="px-5 py-3"><app-status-chip [tone]="weekTone(week.status)">{{ week.status }}</app-status-chip></td>
                  <td class="px-5 py-3 text-right">
                    <button type="button" (click)="reviewWeek.set(week.id)" class="text-blue-600 hover:text-blue-800 text-xs font-semibold mr-3">Review</button>
                    <button type="button" (click)="exportWeek(week.id)" [disabled]="week.status === 'blocked' || cpr.loading()"
                            class="text-emerald-700 hover:text-emerald-900 text-xs font-semibold disabled:opacity-40">Export</button>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="px-5 py-10 text-center text-slate-400 italic">No weekly drafts yet.</td></tr>
              }
            </tbody>
          </table>
        </div>

        @if (reviewWeek()) {
          <div class="mt-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h2 class="text-sm font-bold text-slate-900">Weekly Review · {{ reviewWeekLabel() }}</h2>
              <button type="button" (click)="reviewWeek.set(null)" class="text-slate-500 hover:text-slate-700"><mat-icon>close</mat-icon></button>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm">
                <thead>
                  <tr class="text-[10px] uppercase font-bold text-slate-400 tracking-wider border-b border-slate-100">
                    <th class="px-5 py-3">Employee</th>
                    <th class="px-5 py-3">Classification</th>
                    <th class="px-5 py-3 text-right">Reg</th>
                    <th class="px-5 py-3 text-right">OT</th>
                    <th class="px-5 py-3 text-right">DT</th>
                    <th class="px-5 py-3 text-right">Base</th>
                    <th class="px-5 py-3 text-right">Fringe</th>
                    <th class="px-5 py-3 text-right">Gross Pkg</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (entry of reviewEntries(); track entry.id) {
                    <tr>
                      <td class="px-5 py-3 font-medium">{{ entry.employeeName }}</td>
                      <td class="px-5 py-3">{{ entry.classification }}</td>
                      <td class="px-5 py-3 text-right font-mono text-xs">{{ entry.regularHours | number:'1.1-1' }}</td>
                      <td class="px-5 py-3 text-right font-mono text-xs">{{ entry.overtimeHours | number:'1.1-1' }}</td>
                      <td class="px-5 py-3 text-right font-mono text-xs">{{ entry.doubleTimeHours | number:'1.1-1' }}</td>
                      <td class="px-5 py-3 text-right font-mono text-xs">{{ entry.baseRate | currency:'USD':'symbol':'1.2-2' }}</td>
                      <td class="px-5 py-3 text-right font-mono text-xs">{{ entry.fringeRate | currency:'USD':'symbol':'1.2-2' }}</td>
                      <td class="px-5 py-3 text-right font-mono text-xs">{{ entry.grossPackage | currency:'USD':'symbol':'1.0-0' }}</td>
                    </tr>
                  } @empty {
                    <tr><td colspan="8" class="px-5 py-10 text-center text-slate-400 italic">No entries for this week.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      }

      @if (activeTab() === 'exceptions') {
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="text-[10px] uppercase font-bold text-slate-400 tracking-wider border-b border-slate-100">
                <th class="px-5 py-3">Project</th>
                <th class="px-5 py-3">Type</th>
                <th class="px-5 py-3">Message</th>
                <th class="px-5 py-3">Employee</th>
                <th class="px-5 py-3">Severity</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (ex of openExceptions(); track ex.id) {
                <tr class="hover:bg-slate-50">
                  <td class="px-5 py-3 text-slate-700">{{ projectLabel(ex.projectId) }}</td>
                  <td class="px-5 py-3 font-mono text-xs">{{ ex.type }}</td>
                  <td class="px-5 py-3 text-slate-700">{{ ex.message }}</td>
                  <td class="px-5 py-3 text-slate-500">{{ ex.employeeName || '—' }}</td>
                  <td class="px-5 py-3"><app-status-chip [tone]="ex.severity === 'error' ? 'red' : 'amber'">{{ ex.severity }}</app-status-chip></td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="px-5 py-10 text-center text-slate-400 italic">No open certified payroll exceptions.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CertifiedPayroll {
  cpr = inject(CertifiedPayrollService);
  private cprData = inject(CertifiedPayrollDataService);
  private dataService = inject(DataService);

  activeTab = signal<CprTab>('dashboard');
  reviewWeek = signal<string | null>(null);

  readonly tabs = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: 'dashboard' },
    { id: 'tasks' as const, label: 'Task Board', icon: 'view_kanban' },
    { id: 'weeks' as const, label: 'Weekly Drafts', icon: 'date_range' },
    { id: 'exceptions' as const, label: 'Exceptions', icon: 'report_problem' },
  ];

  private projects = toSignal(this.dataService.getProjects(), { initialValue: [] as Project[] });
  private weeks = toSignal(this.cprData.getWeeks(), { initialValue: [] as CertifiedPayrollWeek[] });
  private tasks = toSignal(this.cprData.getTasks(), { initialValue: [] as CertifiedPayrollTask[] });
  private exceptions = toSignal(this.cprData.getExceptions(), { initialValue: [] as CertifiedPayrollException[] });
  private entries = toSignal(this.cprData.getEntries(), { initialValue: [] });

  kpis = this.cpr.dashboardKpis;
  cprProjects = this.cpr.certifiedProjects;

  kpiCertifiedProjects = computed(() => String(this.kpis().certifiedProjects));
  kpiOpenTasks = computed(() => String(this.kpis().openTasks));
  kpiReadyWeeks = computed(() => String(this.kpis().readyWeeks));
  kpiOpenExceptions = computed(() => String(this.kpis().openExceptions));

  recentWeeks = computed(() =>
    [...this.weeks()].sort((a, b) => b.weekEnding.localeCompare(a.weekEnding)).slice(0, 8),
  );

  allWeeks = computed(() => [...this.weeks()].sort((a, b) => b.weekEnding.localeCompare(a.weekEnding)));
  allTasks = computed(() => [...this.tasks()].sort((a, b) => a.sortOrder - b.sortOrder));
  openExceptions = computed(() => this.exceptions().filter(e => !e.resolved));

  reviewEntries = computed(() => {
    const weekId = this.reviewWeek();
    if (!weekId) return [];
    return this.entries().filter(e => e.weekId === weekId);
  });

  reviewWeekLabel = computed(() => {
    const week = this.weeks().find(w => w.id === this.reviewWeek());
    return week ? `${this.projectLabel(week.projectId)} · ${week.weekEnding}` : '';
  });

  generate(): void {
    void this.cpr.generateDrafts();
  }

  exportWeek(weekId: string): void {
    void this.cpr.exportWeek(weekId);
  }

  projectLabel(projectId: string): string {
    const project = this.projects().find(p => p.id === projectId);
    if (!project) return 'Unknown';
    return `#${project.projectNumber} ${project.projectName}`;
  }

  weekTone(status: string): StatusTone {
    if (status === 'ready' || status === 'exported' || status === 'submitted') return 'green';
    if (status === 'blocked') return 'red';
    if (status === 'draft') return 'amber';
    return 'slate';
  }

  taskTone(status: string): StatusTone {
    if (status === 'Complete') return 'green';
    if (status === 'In Progress') return 'blue';
    if (status === 'Waiting') return 'amber';
    return 'slate';
  }
}
