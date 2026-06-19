import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { DataService } from '@core/services/data.service';
import { SubcontractorService } from '@features/subcontractors/services/subcontractor.service';
import { SubcontractorSeedService } from '@features/subcontractors/services/subcontractor-seed.service';
import { ProjectSubcontractorService } from '@features/subcontractors/services/project-subcontractor.service';
import { ImportReviewService } from '@core/services/import-review.service';
import { ProjectLifecycleService } from '@features/projects/services/project-lifecycle.service';
import { ProjectFinancialService } from '@features/projects/services/project-financial.service';
import { QuickBooksSyncDataService } from '@core/services/quickbooks-sync-data.service';
import { manualFirstConfig } from '@app/config/manual-first.config';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { StatCardComponent } from '@app/components/ui/stat-card';
import { CompactStatStripComponent } from '@app/components/ui/compact-stat-strip';
import { SegmentedControlComponent } from '@app/components/ui/segmented-control';
import { StatusChipComponent } from '@app/components/ui/status-chip';
import { EmptyStateComponent } from '@app/components/ui/empty-state';
import { downloadCsv } from '@shared/utils/csv-export';
import { Subcontractor, ProjectSubcontractor, ProjectSubcontractorStatus, VendorClassification } from '@app/models/subcontractor.types';
import { Project } from '@app/models/types';
import {
  buildDirectoryContactRows,
  buildDirectoryCustomerRows,
  buildDirectoryNeedsReviewRows,
  buildDirectoryOverviewRows,
  buildDirectorySubRows,
  buildDirectoryVendorRows,
  DIRECTORY_SEGMENT_OPTIONS,
  DIRECTORY_SUB_FILTER_OPTIONS,
  directoryHubCsvRows,
  directoryOverviewSectionLabel,
  DirectorySegmentId,
  DirectorySubFilterId,
  matchesSubHubFilter,
  normalizeDirectorySegment,
  normalizeDirectorySubFilter,
  summarizeDirectoryHub,
} from '@features/subcontractors/utils/directory-hub.compute';

@Component({
  selector: 'app-directory-hub-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    RouterLink,
    PageHeaderComponent,
    StatCardComponent,
    CompactStatStripComponent,
    SegmentedControlComponent,
    StatusChipComponent,
    EmptyStateComponent,
  ],
  providers: [CurrencyPipe],
  template: `
    <div class="p-4 lg:p-6 w-full max-w-[1440px] mx-auto space-y-4">
      <app-page-header
        [title]="manualFirst ? 'Subcontractors' : 'Directory'"
        [subtitle]="manualFirst ? 'Add subcontractors here, then assign them to jobs from the project Subs tab' : 'Companies, subcontractors, vendors, customers, and contacts'"
        [primaryActionLabel]="manualFirst ? 'Add Subcontractor' : 'New Contact / Company'"
        (primaryAction)="openNew()">
        @if (!manualFirst) {
        <button type="button" (click)="discoverSubs()" [disabled]="discovering()"
                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2">
          <mat-icon class="!text-[18px]">{{ discovering() ? 'hourglass_empty' : 'travel_explore' }}</mat-icon>
          {{ discovering() ? 'Discovering…' : 'Discover subcontractors' }}
        </button>
        <a routerLink="/settings" fragment="import-review"
           class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50">
          Source Review
        </a>
        <button type="button" (click)="exportCsv()"
                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50">
          Export CSV
        </button>
        }
      </app-page-header>

      @if (discoverMessage()) {
        <p class="text-sm text-emerald-700 -mt-2">{{ discoverMessage() }}</p>
      }
      @if (discoverError()) {
        <p class="text-sm text-rose-700 -mt-2">{{ discoverError() }}</p>
      }

      @if (!manualFirst) {
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <app-stat-card label="Companies" [value]="num(summary().companies)" icon="business" />
        <button type="button" (click)="setSegment('needsReview')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Needs Review" [value]="num(summary().needsReview)" icon="rule"
                         [trend]="summary().needsReview ? 'Classify vendors' : undefined" [trendPositive]="false" />
        </button>
        <button type="button" (click)="setSegment('subcontractors'); subFilter.set('missingCoi')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Missing COI" [value]="num(summary().missingCoi)" icon="health_and_safety"
                         [trend]="summary().missingCoi ? 'Collect COI' : undefined" [trendPositive]="false" />
        </button>
        <button type="button" (click)="setSegment('subcontractors'); subFilter.set('missingW9')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Missing W-9" [value]="num(summary().missingW9)" icon="description"
                         [trend]="summary().missingW9 ? 'Collect W-9' : undefined" [trendPositive]="false" />
        </button>
      </div>
      }

      @if (!manualFirst && compactStats().length) {
        <app-compact-stat-strip [stats]="compactStats()" />
      }

      <app-segmented-control
        [options]="segmentOptions()"
        [value]="segment()"
        (select)="setSegment($event)" />

      @if (manualFirst && segment() !== 'subcontractors') {
        <p class="text-xs text-slate-500">Assign subs to jobs from each project's <strong>Subs</strong> tab (appears after the first assignment).</p>
      }

      @switch (segment()) {
        @case ('overview') {
          <section class="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 class="text-sm font-semibold text-slate-900">Directory actions</h2>
                <p class="text-xs text-slate-500 mt-0.5">Classification, compliance, active subs, and source issues</p>
              </div>
              <a routerLink="/subcontractors" class="text-xs font-bold text-indigo-700 hover:underline">Open full subcontractors view</a>
            </div>
            @if (overviewRows().length) {
              <div class="divide-y divide-slate-100">
                @for (row of overviewRows(); track row.id) {
                  <div class="px-5 py-3 flex flex-wrap items-center gap-3 hover:bg-slate-50 transition-colors">
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="text-sm font-semibold text-slate-900">{{ row.name }}</span>
                        <app-status-chip tone="slate">{{ row.typeLabel }}</app-status-chip>
                        <app-status-chip tone="blue">{{ row.sourceLabel }}</app-status-chip>
                        @if (row.complianceIssue) {
                          <app-status-chip [tone]="row.severity === 'error' ? 'red' : 'amber'">{{ row.complianceIssue }}</app-status-chip>
                        }
                      </div>
                      <p class="text-xs text-slate-500 mt-0.5">
                        {{ directoryOverviewSectionLabel(row.section) }}
                        @if (row.activeProjectCount) {
                          · {{ row.activeProjectCount }} active job{{ row.activeProjectCount === 1 ? '' : 's' }}
                        }
                      </p>
                    </div>
                    <button type="button" (click)="openFromOverview(row)" class="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg">
                      {{ row.nextAction }}
                    </button>
                  </div>
                }
              </div>
            } @else {
              <div class="p-5">
                <app-empty-state title="No directory actions right now" message="Subcontractors, vendors, and contacts are up to date." />
              </div>
            }
          </section>
        }

        @case ('subcontractors') {
          <div class="space-y-4">
            @if (!manualFirst) {
            <div class="flex flex-wrap items-center justify-between gap-3">
              <app-segmented-control [options]="subFilterOptions()" [value]="subFilter()" (select)="setSubFilter($event)" />
              <a routerLink="/subcontractors" class="text-xs font-bold text-indigo-700 hover:underline">Open full subcontractors view</a>
            </div>
            }
            <section class="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
              @for (row of filteredSubRows(); track row.id) {
                <div class="px-5 py-4 hover:bg-slate-50 transition-colors">
                  <div class="flex flex-wrap items-start gap-4">
                    <button type="button" (click)="selectSub(row.sub)" class="min-w-0 flex-1 text-left">
                      <div class="flex flex-wrap items-center gap-2 mb-1">
                        <span class="text-sm font-bold text-slate-900">{{ row.companyName }}</span>
                        @if (row.trade) {
                          <app-status-chip tone="slate">{{ row.trade }}</app-status-chip>
                        }
                        @if (!manualFirst) {
                        <app-status-chip tone="blue">{{ row.sourceLabel }}</app-status-chip>
                        }
                      </div>
                      <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <span><span class="text-slate-400">Active jobs</span> <span class="font-semibold">{{ row.activeProjects }}</span></span>
                        @if (!manualFirst) {
                        <span><span class="text-slate-400">W-9</span> <span class="font-semibold" [class.text-rose-700]="row.w9Status === 'Missing'">{{ row.w9Status }}</span></span>
                        <span><span class="text-slate-400">COI</span> <span class="font-semibold" [class.text-rose-700]="row.coiLabel === 'Missing' || row.coiLabel === 'Expired'">{{ row.coiLabel }}</span></span>
                        <span><span class="text-slate-400">Cost</span> <span class="font-mono font-semibold">{{ row.costLabel }}</span></span>
                        <span><span class="text-slate-400">Status</span> <span class="font-semibold">{{ row.status }}</span></span>
                        }
                        @if (manualFirst && row.sub.contactName) {
                        <span><span class="text-slate-400">Contact</span> <span class="font-semibold">{{ row.sub.contactName }}</span></span>
                        }
                      </div>
                      @if (row.badges.length) {
                        <div class="flex flex-wrap gap-1.5 mt-2">
                          @for (b of row.badges; track b) {
                            <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                                  [class.bg-rose-100]="b.includes('Missing') || b === 'Do Not Use' || b === 'Expired COI'"
                                  [class.text-rose-800]="b.includes('Missing') || b === 'Do Not Use' || b === 'Expired COI'"
                                  [class.bg-amber-100]="b === 'Expiring' || b === 'Needs Review'"
                                  [class.text-amber-800]="b === 'Expiring' || b === 'Needs Review'"
                                  [class.bg-slate-100]="b === 'Not on a job yet'"
                                  [class.text-slate-600]="b === 'Not on a job yet'">{{ b }}</span>
                          }
                        </div>
                      }
                    </button>
                    <button type="button" (click)="selectSub(row.sub)" class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg shrink-0">{{ row.nextAction }}</button>
                  </div>
                </div>
              } @empty {
                <div class="p-5">
                  <app-empty-state title="No subcontractors match this filter" message="Try a different filter or add subs to the directory." />
                </div>
              }
            </section>
          </div>
        }

        @case ('vendors') {
          <section class="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
            @for (row of vendorRows(); track row.id) {
              <div class="px-5 py-4 hover:bg-slate-50 flex flex-wrap items-start gap-4">
                <button type="button" (click)="selectSub(row.sub)" class="min-w-0 flex-1 text-left">
                  <div class="flex flex-wrap items-center gap-2 mb-1">
                    <span class="text-sm font-bold text-slate-900">{{ row.vendorName }}</span>
                    <app-status-chip [tone]="row.classification === 'Needs Review' ? 'amber' : 'slate'">{{ row.classification }}</app-status-chip>
                    <app-status-chip tone="blue">{{ row.sourceLabel }}</app-status-chip>
                  </div>
                  <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span><span class="text-slate-400">QB balance / cost</span> <span class="font-mono font-semibold">{{ row.balanceLabel }}</span></span>
                    <span><span class="text-slate-400">Linked jobs</span> <span class="font-semibold">{{ row.linkedProjects }}</span></span>
                  </div>
                </button>
                <button type="button" (click)="selectSub(row.sub)" class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg shrink-0">{{ row.nextAction }}</button>
              </div>
            } @empty {
              <div class="p-5">
                <app-empty-state title="No vendors in this directory yet" message="Import subcontractors from Subcontractors → Import CSV, or add them manually." />
              </div>
            }
          </section>
        }

        @case ('customers') {
          <section class="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
            @for (row of customerRows(); track row.id) {
              <div class="px-5 py-4 hover:bg-slate-50 flex flex-wrap items-start gap-4">
                <a [routerLink]="row.route" class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2 mb-1">
                    <span class="text-sm font-bold text-slate-900">{{ row.customerName }}</span>
                    <app-status-chip tone="slate">{{ row.companyType }}</app-status-chip>
                    <app-status-chip tone="blue">{{ row.sourceLabel }}</app-status-chip>
                  </div>
                  <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span><span class="text-slate-400">Active jobs</span> <span class="font-semibold">{{ row.activeProjects }}</span></span>
                    <span><span class="text-slate-400">Open AR</span> <span class="font-mono font-semibold" [class.text-rose-700]="row.openAr > 0">{{ fmt(row.openAr) }}</span></span>
                    <span><span class="text-slate-400">Contract value</span> <span class="font-mono font-semibold">{{ fmt(row.contractValue) }}</span></span>
                    @if (row.primaryContact) {
                      <span><span class="text-slate-400">Contact</span> <span class="font-semibold">{{ row.primaryContact }}</span></span>
                    }
                  </div>
                </a>
                <a [routerLink]="row.route" class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg shrink-0">{{ row.nextAction }}</a>
              </div>
            } @empty {
              <div class="p-5">
                <app-empty-state title="No companies yet" message="Companies appear when you enter customers on jobs, add subs, or create directory records." />
              </div>
            }
          </section>
        }

        @case ('employees') {
          <section class="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
            @for (row of contactRows(); track row.id) {
              <div class="px-5 py-4 hover:bg-slate-50 flex flex-wrap items-start gap-4">
                <a [routerLink]="row.route" class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2 mb-1">
                    <span class="text-sm font-bold text-slate-900">{{ row.name }}</span>
                    <app-status-chip tone="slate">{{ row.role }}</app-status-chip>
                    <app-status-chip tone="blue">{{ row.sourceLabel }}</app-status-chip>
                  </div>
                  <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span><span class="text-slate-400">Company</span> <span class="font-semibold">{{ row.company }}</span></span>
                    <span><span class="text-slate-400">Contact</span> <span class="font-semibold">{{ row.contact }}</span></span>
                    <span><span class="text-slate-400">Job links</span> <span class="font-semibold">{{ row.activeProjectLinks }}</span></span>
                  </div>
                </a>
                <a [routerLink]="row.route" class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg shrink-0">{{ row.nextAction }}</a>
              </div>
            } @empty {
              <div class="p-5">
                <app-empty-state title="No employees or contacts on file" message="Add contacts or sync directory data." />
              </div>
            }
          </section>
        }

        @case ('needsReview') {
          <section class="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
            @for (row of needsReviewRows(); track row.id) {
              <div class="px-5 py-4 hover:bg-slate-50 flex flex-wrap items-start gap-4">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2 mb-1">
                    <span class="text-sm font-bold text-slate-900">{{ row.name }}</span>
                    <app-status-chip [tone]="row.severity === 'error' ? 'red' : 'amber'">{{ row.issueType }}</app-status-chip>
                    <app-status-chip tone="blue">{{ row.sourceLabel }}</app-status-chip>
                  </div>
                  <p class="text-xs text-slate-500">{{ row.detail }}</p>
                </div>
                @if (row.nextAction === 'Source Review') {
                  <a routerLink="/settings" fragment="import-review" class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg shrink-0">{{ row.nextAction }}</a>
                } @else {
                  <button type="button" (click)="openNeedsReviewRow(row)" class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg shrink-0">{{ row.nextAction }}</button>
                }
              </div>
            } @empty {
              <div class="p-5">
                <app-empty-state title="Nothing needs review" message="Directory imports and classifications look clean." />
              </div>
            }
          </section>
        }
      }

      @if (drawerOpen()) {
        <div class="fixed inset-0 z-40 bg-black/30" (click)="closeDrawer()"></div>
        <aside class="fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-white shadow-xl overflow-y-auto">
          <div class="p-5 border-b flex justify-between items-center bg-slate-50">
            <h3 class="text-lg font-bold">{{ editingId() ? 'Edit Subcontractor' : (manualFirst ? 'Add Subcontractor' : 'New Contact / Company') }}</h3>
            <button type="button" (click)="closeDrawer()">✕</button>
          </div>
          <div class="p-5 space-y-4">
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Company Name</label>
              <input [(ngModel)]="draft.companyName" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Trade / Scope</label>
                <input [(ngModel)]="draft.trade" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Contact Name</label>
                <input [(ngModel)]="draft.contactName" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Phone</label>
                <input [(ngModel)]="draft.phone" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
                <input [(ngModel)]="draft.email" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
            </div>
            @if (manualFirst) {
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Address</label>
              <input [(ngModel)]="draft.address" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Notes</label>
              <textarea [(ngModel)]="draft.notes" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Internal notes about this subcontractor"></textarea>
            </div>
            }
            @if (manualFirst && editingId() && editingAssignments().length) {
            <div class="rounded-lg border border-slate-200 divide-y divide-slate-100">
              <div class="px-4 py-3 bg-slate-50">
                <h4 class="text-xs font-bold text-slate-700 uppercase">Job contracts</h4>
              </div>
              @for (ps of editingAssignments(); track ps.id) {
                <div class="p-4 space-y-3">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <p class="text-sm font-semibold text-slate-900">{{ ps.jobNumber }} · {{ ps.projectName }}</p>
                    <a [routerLink]="['/projects', ps.projectId]" fragment="subs" class="text-xs font-semibold text-indigo-700 hover:underline">Open job</a>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs text-slate-500 mb-1">Contract amount</label>
                      <input type="number" [(ngModel)]="assignmentEdits[ps.id].currentCommitmentAmount" class="w-full px-3 py-2 border rounded-lg text-sm">
                    </div>
                    <div>
                      <label class="block text-xs text-slate-500 mb-1">Cost code</label>
                      <input [(ngModel)]="assignmentEdits[ps.id].costCode" class="w-full px-3 py-2 border rounded-lg text-sm">
                    </div>
                  </div>
                  <div>
                    <label class="block text-xs text-slate-500 mb-1">Scope of work</label>
                    <textarea [(ngModel)]="assignmentEdits[ps.id].scopeOfWork" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs text-slate-500 mb-1">Start date</label>
                      <input type="date" [(ngModel)]="assignmentEdits[ps.id].startDate" class="w-full px-3 py-2 border rounded-lg text-sm">
                    </div>
                    <div>
                      <label class="block text-xs text-slate-500 mb-1">Finish date</label>
                      <input type="date" [(ngModel)]="assignmentEdits[ps.id].finishDate" class="w-full px-3 py-2 border rounded-lg text-sm">
                    </div>
                  </div>
                  <div>
                    <label class="block text-xs text-slate-500 mb-1">Job notes</label>
                    <textarea [(ngModel)]="assignmentEdits[ps.id].notes" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
                  </div>
                </div>
              }
            </div>
            }
            @if (manualFirst) {
            <div class="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div>
                <h4 class="text-xs font-bold text-slate-700 uppercase">{{ editingId() ? 'Add to another job (optional)' : 'Assign to a job (optional)' }}</h4>
                <p class="text-xs text-slate-500 mt-1">Enter contract details here. W-9 and COI are only required after assignment.</p>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Job</label>
                <select [(ngModel)]="setupProjectId" class="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                  <option value="">— {{ editingId() ? 'Skip new assignment' : 'Add to directory only' }} —</option>
                  @for (p of setupProjects(); track p.id) {
                    <option [value]="p.id">{{ p.projectNumber }} · {{ p.projectName }}</option>
                  }
                </select>
              </div>
              @if (setupProjectId) {
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Contract amount</label>
                    <input type="number" [(ngModel)]="setupContract" class="w-full px-3 py-2 border rounded-lg text-sm bg-white" placeholder="0">
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Cost code</label>
                    <input [(ngModel)]="setupCostCode" class="w-full px-3 py-2 border rounded-lg text-sm bg-white" placeholder="e.g. 03-300">
                  </div>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Scope of work</label>
                  <textarea [(ngModel)]="setupScope" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm bg-white" placeholder="What this sub is doing on the job"></textarea>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Start date</label>
                    <input type="date" [(ngModel)]="setupStartDate" class="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Finish date</label>
                    <input type="date" [(ngModel)]="setupFinishDate" class="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                  </div>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Job status</label>
                  <select [(ngModel)]="setupJobStatus" class="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                    <option value="Planned">Planned</option>
                    <option value="PendingContract">Pending contract</option>
                    <option value="Active">Active</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Job notes</label>
                  <textarea [(ngModel)]="setupJobNotes" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm bg-white" placeholder="Contract notes, PO reference, etc."></textarea>
                </div>
              }
            </div>
            }
            @if (!manualFirst) {
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">W-9 Status</label>
                <select [(ngModel)]="draft.w9Status" class="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="Missing">Missing</option>
                  <option value="OnFile">On File</option>
                  <option value="Expired">Expired</option>
                  <option value="NotRequired">Not Required</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">COI Expiration</label>
                <input type="date" [(ngModel)]="draft.coiExpirationDate" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Classification</label>
              <select [(ngModel)]="draft.vendorClassification" class="w-full px-3 py-2 border rounded-lg text-sm">
                @for (c of vendorClassifications; track c) {
                  <option [value]="c">{{ c === 'NeedsReview' ? 'Needs Review' : c }}</option>
                }
              </select>
            </div>
            }
            @if (saveError()) {
              <p class="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{{ saveError() }}</p>
            }
            <div class="flex flex-wrap gap-2 pt-2">
              <button type="button" (click)="save()" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">Save</button>
              @if (!manualFirst) {
              <a routerLink="/subcontractors" class="border px-4 py-2 rounded-lg text-sm">Open full view</a>
              }
            </div>
          </div>
        </aside>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectoryHubPage {
  readonly manualFirst = manualFirstConfig;
  private data = inject(DataService);
  private subSvc = inject(SubcontractorService);
  private subSeed = inject(SubcontractorSeedService);
  private psSvc = inject(ProjectSubcontractorService);
  private importReview = inject(ImportReviewService);
  private lifecycleSvc = inject(ProjectLifecycleService);
  private financialSvc = inject(ProjectFinancialService);
  private qbSyncData = inject(QuickBooksSyncDataService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private currency = inject(CurrencyPipe);

  segment = signal<DirectorySegmentId>(manualFirstConfig.hideMainWorkflowWarnings ? 'subcontractors' : 'overview');
  subFilter = signal<DirectorySubFilterId>('all');
  discovering = signal(false);
  discoverMessage = signal<string | null>(null);
  discoverError = signal<string | null>(null);
  drawerOpen = signal(false);
  editingId = signal<string | null>(null);
  draft: Partial<Subcontractor> = {};
  setupProjectId = '';
  setupContract: number | null = null;
  setupScope = '';
  setupCostCode = '';
  setupStartDate = '';
  setupFinishDate = '';
  setupJobNotes = '';
  setupJobStatus: ProjectSubcontractorStatus = 'Active';
  assignmentEdits: Record<string, Partial<ProjectSubcontractor>> = {};
  saveError = signal<string | null>(null);

  readonly vendorClassifications: VendorClassification[] = [
    'Subcontractor', 'Supplier', 'Consultant', 'Ignore', 'NeedsReview',
  ];

  readonly directoryOverviewSectionLabel = directoryOverviewSectionLabel;

  private subs = toSignal(this.data.getSubcontractors(), { initialValue: [] as Subcontractor[] });
  private projectSubs = toSignal(this.data.getProjectSubcontractors(), { initialValue: [] });
  private projects = toSignal(this.data.getProjects(), { initialValue: [] as Project[] });
  private employees = toSignal(this.data.getEmployees(), { initialValue: [] });
  private arRecords = toSignal(this.data.getArRecords(), { initialValue: [] });

  private companies = toSignal(this.data.getCompanies(), { initialValue: [] });

  setupProjects = computed(() =>
    [...(this.projects() ?? [])]
      .filter(p => p.status !== 'Closed')
      .sort((a, b) => String(a.projectNumber).localeCompare(String(b.projectNumber), undefined, { numeric: true })),
  );

  editingAssignments = computed(() => {
    const id = this.editingId();
    if (!id) return [] as ProjectSubcontractor[];
    return (this.projectSubs() ?? []).filter(ps => ps.subcontractorId === id);
  });

  summary = computed(() => summarizeDirectoryHub({
    subs: this.subs() ?? [],
    projectSubs: this.projectSubs() ?? [],
    companies: this.companies() ?? [],
    projects: this.projects() ?? [],
  }));

  compactStats = computed(() => {
    const s = this.summary();
    return [
      { label: 'Discovered from QuickBooks', value: String(s.fromQuickBooks) },
      { label: 'Discovered from Drive', value: String(s.fromDrive) },
      { label: 'Active project subs', value: String(s.activeProjectSubs) },
      { label: 'Expiring COIs', value: String(s.expiringCois), alert: s.expiringCois > 0 },
      { label: 'Ignored vendors', value: String(s.ignoredVendors) },
    ];
  });

  overviewRows = computed(() => buildDirectoryOverviewRows({
    subs: this.subs() ?? [],
    projectSubs: this.projectSubs() ?? [],
    importExceptions: this.importReview.exceptions(),
  }));

  subRows = computed(() => buildDirectorySubRows({
    subs: this.subs() ?? [],
    projectSubs: this.projectSubs() ?? [],
    vendorBalances: this.qbSyncData.vendorBalances(),
  }));

  filteredSubRows = computed(() =>
    this.subRows().filter(r => matchesSubHubFilter(r.sub, r.activeProjects, this.subFilter())),
  );

  vendorRows = computed(() => buildDirectoryVendorRows({
    subs: this.subs() ?? [],
    projectSubs: this.projectSubs() ?? [],
    vendorBalances: this.qbSyncData.vendorBalances(),
  }));

  customerRows = computed(() => {
    const lifecycleByProjectId = new Map(
      (this.projects() ?? []).map(p => [p.id, this.lifecycleSvc.forProject(p)]),
    );
    const financialByProjectId = new Map(
      (this.projects() ?? []).map(p => [p.id, this.financialSvc.computeForProject(p)]),
    );
    return buildDirectoryCustomerRows({
      projects: this.projects() ?? [],
      lifecycleByProjectId,
      financialByProjectId,
      arRecords: this.arRecords() ?? [],
      companies: this.companies() ?? [],
      subs: this.subs() ?? [],
    });
  });

  contactRows = computed(() => buildDirectoryContactRows({
    employees: this.employees() ?? [],
    subs: this.subs() ?? [],
    projects: this.projects() ?? [],
    projectSubs: this.projectSubs() ?? [],
  }));

  needsReviewRows = computed(() => buildDirectoryNeedsReviewRows({
    subs: this.subs() ?? [],
    projectSubs: this.projectSubs() ?? [],
    importExceptions: this.importReview.exceptions(),
  }));

  segmentOptions = computed(() => {
    const opts = DIRECTORY_SEGMENT_OPTIONS.map(o => ({ ...o, badge: undefined as number | undefined }));
    const reviewIdx = opts.findIndex(o => o.id === 'needsReview');
    const count = this.needsReviewRows().length;
    if (reviewIdx >= 0 && count) opts[reviewIdx].badge = count;
    return opts;
  });

  subFilterOptions = computed(() =>
    DIRECTORY_SUB_FILTER_OPTIONS.map(o => ({
      id: o.id,
      label: o.label,
      badge: o.id === 'missingW9'
        ? (this.summary().missingW9 || undefined)
        : o.id === 'missingCoi'
          ? (this.summary().missingCoi || undefined)
          : undefined,
    })),
  );

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      if (params.get('segment')) {
        this.segment.set(normalizeDirectorySegment(params.get('segment')));
      }
      if (params.get('filter')) {
        this.subFilter.set(normalizeDirectorySubFilter(params.get('filter')));
      }
    });
  }

  fmt(value: number): string {
    return this.currency.transform(value, 'USD', 'symbol', '1.0-0') ?? '$0';
  }

  num(value: number): string {
    return String(value);
  }

  setSegment(segment: DirectorySegmentId): void {
    this.segment.set(segment);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { segment },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  setSubFilter(filter: DirectorySubFilterId): void {
    this.subFilter.set(filter);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { filter },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  openNew(): void {
    this.editingId.set(null);
    this.draft = {
      status: 'PendingSetup',
      vendorClassification: manualFirstConfig.hideMainWorkflowWarnings ? 'Subcontractor' : 'NeedsReview',
      source: 'Manual',
    };
    this.resetSetupJobFields();
    this.assignmentEdits = {};
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  selectSub(sub: Subcontractor): void {
    this.editingId.set(sub.id);
    this.draft = { ...sub };
    this.resetSetupJobFields();
    this.assignmentEdits = Object.fromEntries(
      (this.projectSubs() ?? [])
        .filter(ps => ps.subcontractorId === sub.id)
        .map(ps => [ps.id, {
          currentCommitmentAmount: ps.currentCommitmentAmount,
          originalCommitmentAmount: ps.originalCommitmentAmount ?? ps.currentCommitmentAmount,
          scopeOfWork: ps.scopeOfWork,
          costCode: ps.costCode,
          startDate: ps.startDate,
          finishDate: ps.finishDate,
          notes: ps.notes,
          status: ps.status,
        }]),
    );
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  private resetSetupJobFields(): void {
    this.setupProjectId = '';
    this.setupContract = null;
    this.setupScope = '';
    this.setupCostCode = '';
    this.setupStartDate = '';
    this.setupFinishDate = '';
    this.setupJobNotes = '';
    this.setupJobStatus = 'Active';
  }

  openFromOverview(row: { id: string; nextAction: string; route: string }): void {
    if (row.nextAction === 'Source Review') {
      void this.router.navigate(['/settings'], { fragment: 'import-review' });
      return;
    }
    const subId = row.id.split('-').slice(1).join('-');
    const sub = (this.subs() ?? []).find(s => s.id === subId);
    if (sub) {
      this.selectSub(sub);
      return;
    }
    this.setSegment('subcontractors');
  }

  openNeedsReviewRow(row: { id: string; name: string }): void {
    const sub = (this.subs() ?? []).find(s => s.companyName === row.name || row.id.endsWith(s.id));
    if (sub) this.selectSub(sub);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.saveError.set(null);
  }

  async save(): Promise<void> {
    if (!this.draft.companyName?.trim()) return;
    this.saveError.set(null);
    if (this.setupProjectId && (this.setupContract ?? 0) <= 0) {
      this.saveError.set('Enter a contract amount to assign this subcontractor to a job.');
      return;
    }
    try {
      const saved = await this.subSvc.saveSubcontractor(this.draft, this.editingId());

      for (const ps of this.editingAssignments()) {
        const edits = this.assignmentEdits[ps.id];
        if (!edits) continue;
        const contract = edits.currentCommitmentAmount ?? 0;
        if (contract <= 0) {
          this.saveError.set(`Enter a contract amount for ${ps.projectName ?? 'the job'}.`);
          return;
        }
        await this.psSvc.saveProjectSubcontractor(ps, {
          ...edits,
          originalCommitmentAmount: edits.originalCommitmentAmount ?? contract,
          currentCommitmentAmount: contract,
        });
      }

      if (this.setupProjectId) {
        const project = (this.projects() ?? []).find(p => p.id === this.setupProjectId);
        if (project) {
          const alreadyAssigned = (this.projectSubs() ?? []).some(
            ps => ps.subcontractorId === saved.id && ps.projectId === project.id,
          );
          if (alreadyAssigned) {
            this.saveError.set('This subcontractor is already assigned to that job.');
            return;
          }
          await this.psSvc.assignToProject(project, saved, {
            trade: saved.trade,
            scopeOfWork: this.setupScope.trim() || undefined,
            costCode: this.setupCostCode.trim() || undefined,
            startDate: this.setupStartDate || undefined,
            finishDate: this.setupFinishDate || undefined,
            notes: this.setupJobNotes.trim() || undefined,
            originalCommitmentAmount: this.setupContract ?? 0,
            currentCommitmentAmount: this.setupContract ?? 0,
            status: this.setupJobStatus,
          });
          this.subSvc.refreshDerivedStatus(saved.id);
        }
      }
      this.closeDrawer();
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Could not save subcontractor.');
    }
  }

  async discoverSubs(): Promise<void> {
    this.discovering.set(true);
    this.discoverMessage.set(null);
    this.discoverError.set(null);
    try {
      const result = await this.subSeed.discoverFromSources(false);
      this.discoverMessage.set(
        this.subSeed.lastMessage()
        ?? `Discovered ${result.created} record${result.created === 1 ? '' : 's'}.`,
      );
    } catch (err) {
      this.discoverError.set(err instanceof Error ? err.message : 'Discovery failed.');
    } finally {
      this.discovering.set(false);
    }
  }

  exportCsv(): void {
    const segment = this.segment();
    const headers: Record<DirectorySegmentId, string[]> = {
      overview: ['Name', 'Type', 'Source', 'Active jobs', 'Issue', 'Next action'],
      subcontractors: ['Company', 'Trade', 'Source', 'Active jobs', 'W-9', 'COI', 'Cost', 'Status', 'Next action'],
      vendors: ['Vendor', 'Classification', 'Source', 'QB balance / cost', 'Linked jobs', 'Next action'],
      customers: ['Customer', 'Active jobs', 'Open AR', 'Contract value', 'Contact', 'Next action'],
      employees: ['Name', 'Company', 'Role', 'Contact', 'Job links', 'Source', 'Next action'],
      needsReview: ['Name', 'Issue', 'Source', 'Detail', 'Next action'],
    };
    downloadCsv(
      `directory-${segment}-${new Date().toISOString().slice(0, 10)}.csv`,
      headers[segment],
      directoryHubCsvRows(
        segment,
        this.overviewRows(),
        this.filteredSubRows(),
        this.vendorRows(),
        this.customerRows(),
        this.contactRows(),
        this.needsReviewRows(),
      ),
    );
  }
}
