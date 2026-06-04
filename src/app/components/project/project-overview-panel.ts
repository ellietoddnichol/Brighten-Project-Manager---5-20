import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';

import { CommonModule } from '@angular/common';

import { MatIconModule } from '@angular/material/icon';

import { Project, ChangeOrder } from '@app/models/types';

import { ProjectFinancialSummary } from '@shared/utils/financial';

import { isOverheadJob } from '@shared/utils/project';

import { PROJECT_PROFILE_LABELS } from '@app/models/project-requirements.types';

import { WorkflowChip, WorkflowView, FinancialView, ProjectNavState } from './project-detail.types';

import { ControlNextAction } from '@app/models/active-2026-control.types';

import { ActionItem } from '@shared/utils/action-items';



export interface ActivityRow {

  id: string;

  title: string;

  description?: string;

  activityType: string;

  createdAt?: unknown;

}



@Component({

  selector: 'app-project-overview-panel',

  standalone: true,

  imports: [CommonModule, MatIconModule],

  template: `
    @if (project && !isOverheadJob(project)) {
      <div class="space-y-4">
        <section class="rounded-2xl bg-slate-900 text-white shadow-sm overflow-hidden">
          <div class="p-4 lg:p-5 flex flex-col lg:flex-row lg:items-end justify-between gap-3">
            <div class="min-w-0">
              <p class="text-[10px] uppercase tracking-[0.18em] text-slate-300 font-bold mb-1">Project Overview</p>
              <h2 class="text-xl lg:text-2xl font-bold tracking-tight truncate">{{ project.projectName }}</h2>
              <p class="text-xs text-slate-300 mt-1">{{ project.customer || 'Client not available' }}</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded-full bg-white/10 border border-white/15 px-3 py-1 text-xs font-bold">{{ project.status }}</span>
              @if (project.currentPhase) {
                <span class="rounded-full bg-blue-400/15 border border-blue-300/20 px-3 py-1 text-xs font-bold text-blue-100">
                  {{ project.currentPhase }}
                </span>
              }
              <button type="button" (click)="editProject.emit()"
                      class="rounded-lg bg-white text-slate-900 px-3 py-1.5 text-xs font-bold shadow-sm hover:bg-slate-100 transition-colors flex items-center gap-1.5">
                <mat-icon class="!text-[16px]">edit</mat-icon>
                Edit Overview
              </button>
            </div>
          </div>
        </section>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <section class="overview-card">
            <div class="card-title">
              <div>
                <p class="eyebrow">Project Information</p>
                <h3>Project profile</h3>
              </div>
              <mat-icon>assignment</mat-icon>
            </div>
            <div class="grid sm:grid-cols-2 gap-2.5">
              <div class="info-box">
                <span>Project Number</span>
                <strong>#{{ project.projectNumber }}</strong>
              </div>
              <div class="info-box">
                <span>Project Status</span>
                <strong>{{ project.status }}</strong>
              </div>
              <div class="info-box sm:col-span-2">
                <span>Project Name</span>
                <strong>{{ project.projectName }}</strong>
              </div>
              <div class="info-box">
                <span>Client / Customer</span>
                <strong>{{ project.customer || 'Not available' }}</strong>
              </div>
              <div class="info-box">
                <span>Project Type / Profile</span>
                <strong>{{ projectProfileLabel() }}</strong>
              </div>
              <div class="info-box sm:col-span-2">
                <span>Project Location / Address</span>
                <strong>{{ projectLocation() }}</strong>
              </div>
            </div>
          </section>

          <section class="overview-card">
            <div class="card-title">
              <div>
                <p class="eyebrow">Project Team</p>
                <h3>Assignments</h3>
              </div>
              <mat-icon>groups</mat-icon>
            </div>
            <div class="grid sm:grid-cols-2 gap-2.5">
              <div class="info-box">
                <span>Superintendent / Foreman</span>
                <strong>{{ project.superintendent || 'Not assigned' }}</strong>
              </div>
              <div class="info-box">
                <span>Project Manager</span>
                <strong>{{ project.projectManager || 'Not assigned' }}</strong>
              </div>
              <div class="info-box">
                <span>Client Contact</span>
                <strong>Not available</strong>
              </div>
              <div class="info-box">
                <span>Billing Contact</span>
                <strong>Not available</strong>
              </div>
            </div>
            <p class="mt-2 text-xs text-slate-500">Contacts and PM assignment are read-only placeholders until SQL support is added.</p>
          </section>
        </div>

        <section class="overview-card">
          <div class="card-title">
            <div>
              <p class="eyebrow">Contract / Billing Snapshot</p>
              <h3>Commercial summary</h3>
            </div>
            <mat-icon>request_quote</mat-icon>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2.5">
            <div class="metric-box">
              <span>Contract Amount</span>
              <strong>{{ money(project.originalContractAmount) }}</strong>
            </div>
            <div class="metric-box">
              <span>Billed to Date</span>
              <strong>{{ money(project.billedToDate) }}</strong>
            </div>
            <div class="metric-box">
              <span>Remaining to Bill</span>
              <strong>{{ money(project.wipLeftToBill) }}</strong>
            </div>
            <div class="metric-box">
              <span>Billing Status</span>
              <strong>{{ project.billingStatus || 'Not available' }}</strong>
            </div>
            <div class="metric-box">
              <span>Retainage %</span>
              <strong>{{ percent(project.retainagePercent) }}</strong>
            </div>
          </div>
        </section>

        <section class="overview-card">
          <div class="card-title">
            <div>
              <p class="eyebrow">Scope of Work</p>
              <h3>Project scope</h3>
            </div>
            <mat-icon>format_list_bulleted</mat-icon>
          </div>
          <div class="space-y-2.5">
            <div class="scope-box">
              <span>Scope Summary</span>
              <p>{{ text(project.scopeSummary, 'No scope summary provided.') }}</p>
            </div>
            <div class="grid lg:grid-cols-2 gap-2.5">
              <div class="scope-box">
                <span>Included Work</span>
                <p>{{ text(project.includedWork, 'No included work listed.') }}</p>
              </div>
              <div class="scope-box">
                <span>Exclusions / By Others</span>
                <p>{{ text(project.exclusions, 'No exclusions listed.') }}</p>
              </div>
              <div class="scope-box">
                <span>Schedule / Access Notes</span>
                <p>{{ text(project.scheduleAccessNotes, 'No schedule or access notes listed.') }}</p>
              </div>
              <div class="scope-box">
                <span>Closeout / Special Requirements</span>
                <p>{{ text(project.closeoutRequirements, 'No closeout requirements listed.') }}</p>
              </div>
            </div>
          </div>
        </section>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <section class="overview-card">
            <div class="card-title">
              <div>
                <p class="eyebrow">Schedule</p>
                <h3>Key dates</h3>
              </div>
              <mat-icon>event</mat-icon>
            </div>
            <div class="grid sm:grid-cols-2 gap-2.5">
              <div class="info-box">
                <span>Award Date</span>
                <strong>{{ date(project.awardDate) }}</strong>
              </div>
              <div class="info-box">
                <span>Planned Start</span>
                <strong>{{ date(project.startDate) }}</strong>
              </div>
              <div class="info-box">
                <span>Target Completion</span>
                <strong>{{ date(project.targetCompletionDate) }}</strong>
              </div>
              <div class="info-box">
                <span>Current Phase</span>
                <strong>{{ project.currentPhase || 'Not set' }}</strong>
              </div>
            </div>
          </section>

          <section class="overview-card">
            <div class="card-title">
              <div>
                <p class="eyebrow">Project Requirements</p>
                <h3>Compliance setup</h3>
              </div>
              <mat-icon>verified_user</mat-icon>
            </div>
            <div class="grid sm:grid-cols-2 gap-2.5">
              <div class="info-box">
                <span>Prevailing Wage / Certified Payroll Required</span>
                <strong>{{ yesNo(requiresCertifiedPayroll()) }}</strong>
              </div>
              <div class="info-box">
                <span>County / Wage Area</span>
                <strong>{{ project.county || 'Not available' }}</strong>
              </div>
              <div class="info-box">
                <span>Tax Exempt</span>
                <strong>{{ yesNo(project.taxExempt) }}</strong>
              </div>
              <div class="info-box">
                <span>Bond Required</span>
                <strong>{{ yesNo(project.bondRequired) }}</strong>
              </div>
            </div>
            @if (requiresCertifiedPayroll()) {
              <p class="mt-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                Prevailing wage / certified payroll setup is required for this project.
              </p>
            }
          </section>
        </div>
      </div>
    } @else if (project) {
      <div class="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-600">
        Overhead project — use Work and Money for POs and time tracking.
      </div>
    }
  `,

  styles: [`
    .overview-card {
      border: 1px solid rgb(226 232 240);
      border-radius: 1rem;
      background: white;
      padding: 0.875rem;
      box-shadow: 0 1px 2px rgb(15 23 42 / 0.05);
    }

    .card-title {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }

    .card-title h3 {
      margin: 0;
      color: rgb(15 23 42);
      font-size: 0.95rem;
      font-weight: 800;
      letter-spacing: -0.01em;
    }

    .card-title mat-icon {
      color: rgb(100 116 139);
      background: rgb(248 250 252);
      border: 1px solid rgb(226 232 240);
      border-radius: 0.625rem;
      padding: 0.375rem;
      height: 1.9rem;
      width: 1.9rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .eyebrow {
      margin: 0 0 0.25rem;
      color: rgb(100 116 139);
      font-size: 0.65rem;
      line-height: 1rem;
      font-weight: 800;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .info-box,
    .metric-box,
    .scope-box {
      background: rgb(248 250 252);
      border: 1px solid rgb(226 232 240);
      border-radius: 0.875rem;
      padding: 0.625rem;
    }

    .info-box span,
    .metric-box span,
    .scope-box span {
      display: block;
      color: rgb(100 116 139);
      font-size: 0.65rem;
      line-height: 1rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-bottom: 0.25rem;
    }

    .info-box strong,
    .metric-box strong {
      color: rgb(15 23 42);
      font-size: 0.875rem;
      line-height: 1.25rem;
      font-weight: 800;
    }

    .metric-box strong {
      font-size: 1rem;
    }

    .scope-box p {
      color: rgb(30 41 59);
      font-size: 0.875rem;
      line-height: 1.35rem;
      margin: 0;
      white-space: pre-line;
    }
  `],

  changeDetection: ChangeDetectionStrategy.OnPush,

})

export class ProjectOverviewPanelComponent {

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

  isOverheadJob = isOverheadJob;

  onChip(id: string): void {
    if (id === 'billing') {
      this.navigateFinancial.emit('billing');
    } else {
      this.navigateWorkflow.emit(id as WorkflowView);
    }
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

  requiresCertifiedPayroll(): boolean {
    return Boolean(this.project.prevailingWage || this.project.certifiedPayrollRequired);
  }

  yesNo(value: unknown): string {
    return value ? 'Yes' : 'No';
  }

  text(value: string | null | undefined, fallback: string): string {
    return value?.trim() || fallback;
  }

  money(value: number | string | null | undefined): string {
    const n = Number(value ?? 0);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
  }

  percent(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return 'Not set';
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toFixed(2).replace(/\.00$/, '')}%` : 'Not set';
  }

  date(value: string | null | undefined): string {
    if (!value) return 'Not set';
    const d = new Date(`${value}`.slice(0, 10) + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return 'Not set';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
  }
}


