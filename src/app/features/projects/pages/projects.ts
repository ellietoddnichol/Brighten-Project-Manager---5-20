import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';

import { CommonModule, CurrencyPipe } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { DataService } from '@core/services/data.service';
import { ProjectApiService } from '@core/services/api/project-api.service';

import { MatIconModule } from '@angular/material/icon';

import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { PROJECT_STATUSES, Project } from '@app/models/types';

import { Router, RouterLink, ActivatedRoute } from '@angular/router';

import { dedupeProjectsForDisplay, findProjectMatches, pickCanonicalProject } from '@features/projects/utils/project-dedupe';

import { projectSearchText, formatProjectDate, compareJobNumbers } from '@shared/utils/project';
import { effectiveForeman } from '@features/projects/utils/project-setup.util';

import { ProjectControlsService } from '@features/projects/services/project-controls.service';

import { ProjectLifecycleService } from '@features/projects/services/project-lifecycle.service';

import { ProjectFinancialService } from '@features/projects/services/project-financial.service';

import { ImportReviewService } from '@core/services/import-review.service';

import { MasterSheetSyncService } from '@core/services/master-sheet-sync.service';

import { ProjectsListView, ProjectLifecycleSnapshot } from '@app/models/project-lifecycle.types';

import { matchesProjectsListView } from '@features/projects/utils/project-lifecycle.compute';

import { PROJECT_PROFILE_OPTIONS, PROJECT_PROFILE_LABELS } from '@app/models/project-requirements.types';
import { JobRecordService } from '@features/projects/services/job-record.service';
import { manualFirstConfig } from '@app/config/manual-first.config';
import { projectProfileLabel } from '@features/projects/utils/project-profile.compat';

import { PageHeaderComponent } from '@app/components/ui/page-header';

import { StatCardComponent } from '@app/components/ui/stat-card';

import { CompactStatStripComponent } from '@app/components/ui/compact-stat-strip';

import { SegmentedControlComponent } from '@app/components/ui/segmented-control';

import { EmptyStateComponent } from '@app/components/ui/empty-state';

import {

  DetailDrawerComponent,

  DrawerSectionComponent,

  DrawerFieldComponent,

} from '@app/components/ui/detail-drawer';

import { downloadCsv } from '@shared/utils/csv-export';

import {

  buildProjectListRow,

  matchesProjectsAdvancedFilters,

  normalizeProjectsViewParam,

  PROJECTS_VIEW_OPTIONS,

  projectsCsvRows,

  projectsEmptyMessage,

  ProjectsAdvancedFilterId,

  ProjectsAdvancedFilters,

  ProjectListRow,
  ProjectListWarning,

  summarizeProjectsHub,

} from '@features/projects/utils/projects-hub.compute';

type LifecycleStatusFilter = 'active' | 'closed' | 'all';
type ProjectsSortKey = 'jobNumber' | 'name' | 'customer' | 'contract' | 'billed' | 'leftToBill' | 'updated';

const ADVANCED_FILTER_OPTIONS: { id: ProjectsAdvancedFilterId; label: string }[] = [

  { id: 'missingContract', label: 'Missing contract' },

  { id: 'missingBudget', label: 'Missing budget' },

  { id: 'missingDrive', label: 'Missing Drive' },

  { id: 'openAr', label: 'Open AR' },

  { id: 'under20Margin', label: 'Under 20% margin' },

  { id: 'cprDecision', label: 'Missing wage order' },

  { id: 'sourceReview', label: 'Source review issues' },

];



@Component({

  selector: 'app-projects',

  standalone: true,

  imports: [

    CommonModule,

    MatIconModule,

    FormsModule,

    RouterLink,

    PageHeaderComponent,

    StatCardComponent,

    CompactStatStripComponent,

    SegmentedControlComponent,

    EmptyStateComponent,

    DetailDrawerComponent,

    DrawerSectionComponent,

    DrawerFieldComponent,

  ],

  providers: [CurrencyPipe],

  template: `

    <div class="p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6">

      <app-page-header

        title="Projects"

        subtitle="Your job list — click any row to open and edit"

        primaryActionLabel="New Project"

        (primaryAction)="openNewProject()">

        @if (!manualFirst.hideMainWorkflowWarnings) {
        <a routerLink="/settings" fragment="import-review"
           class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors">
          Import / source review
        </a>
        <button type="button" (click)="syncProjects()" [disabled]="syncing()"
                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50 flex items-center gap-2">
          <mat-icon class="!text-[18px]">{{ syncing() ? 'hourglass_empty' : 'sync' }}</mat-icon>
          {{ syncing() ? 'Syncing…' : 'Sync projects' }}
        </button>
        }

        <button type="button" (click)="exportCsv()"

                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors">

          Export CSV

        </button>

      </app-page-header>



      @if (syncMessage()) {

        <p class="text-sm text-emerald-700 -mt-2">{{ syncMessage() }}</p>

      }

      @if (projectApi.error() && !manualFirst.hideMainWorkflowWarnings) {
        <div class="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <mat-icon class="!text-[16px] text-amber-500 shrink-0">warning</mat-icon>
          <span>Could not load projects from API — using Firestore fallback. {{ projectApi.error() }}</span>
          <button type="button" (click)="retryLoadProjects()"
                  class="ml-auto text-xs font-semibold underline hover:text-amber-900 transition-colors shrink-0">Retry</button>
        </div>
      }

      @if (!manualFirst.hideMainWorkflowWarnings) {
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          @for (card of summaryCards(); track card.label) {
            <button type="button" (click)="setView(card.view)"
                    class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
              <app-stat-card
                [label]="card.label"
                [value]="card.value"
                [subtext]="card.subtext"
                [icon]="card.icon"
                [trend]="card.alert ? 'View jobs' : undefined"
                [trendPositive]="true" />
            </button>
          }
        </div>

        @if (compactStats().length) {
          <app-compact-stat-strip [stats]="compactStats()" />
        }
      }

      <div class="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div class="px-4 py-3 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center gap-3">
          <div class="relative flex-1 min-w-[200px]">
            <mat-icon class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 !text-[18px]">search</mat-icon>
            <input type="text" [ngModel]="searchQuery()" (ngModelChange)="onSearch($event)"
                   placeholder="Search by job #, name, or customer…"
                   class="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-300 outline-none text-sm bg-white">
          </div>

          <div class="flex flex-wrap items-center gap-2 shrink-0">
            <select [ngModel]="viewMode()" (ngModelChange)="setView($event)"
                    class="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white hover:bg-slate-50 transition-colors min-w-[140px]">
              @for (opt of viewSelectOptions(); track opt.id) {
                <option [value]="opt.id">{{ opt.label }}</option>
              }
            </select>

            <select [ngModel]="sortKey()" (ngModelChange)="setSortFromDropdown($event)"
                    class="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white hover:bg-slate-50 transition-colors">
              <option value="jobNumber">Sort: Job # (low → high)</option>
              <option value="name">Sort: Name</option>
              <option value="customer">Sort: Customer</option>
              <option value="contract">Sort: Contract</option>
              <option value="billed">Sort: Billed</option>
              <option value="leftToBill">Sort: Left to bill</option>
              <option value="updated">Sort: Last updated</option>
            </select>

            @if (!manualFirst.hideMainWorkflowWarnings) {
              <button type="button" (click)="openFilterDrawer()"
                      class="bg-white border border-slate-200 text-slate-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-1.5">
                <mat-icon class="!text-[16px]">tune</mat-icon>
                Filters
                @if (advancedFilterCount()) {
                  <span class="text-xs font-semibold text-slate-500">({{ advancedFilterCount() }})</span>
                }
              </button>
            }
          </div>
        </div>

        @if (showHiddenHint()) {
          <p class="px-4 py-2 text-xs text-slate-500 border-b border-slate-100">
            Closed and archived jobs are hidden.
            <button type="button" (click)="setView('all')" class="font-medium text-slate-700 underline hover:text-slate-900">Show all jobs</button>
          </p>
        }

        @if (!manualFirst.hideMainWorkflowWarnings) {
          <div class="px-4 py-2 border-b border-slate-100 flex flex-wrap items-center gap-2">
            @for (opt of lifecycleFilterOptions; track opt.id) {
              <button type="button" (click)="setLifecycleFilter(opt.id)"
                      class="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                      [class.bg-slate-800]="lifecycleStatusFilter() === opt.id"
                      [class.text-white]="lifecycleStatusFilter() === opt.id"
                      [class.text-slate-600]="lifecycleStatusFilter() !== opt.id"
                      [class.hover:text-slate-900]="lifecycleStatusFilter() !== opt.id"
                      [class.hover:bg-slate-100]="lifecycleStatusFilter() !== opt.id">
                {{ opt.label }}
              </button>
            }
            <app-segmented-control
              [options]="segmentOptions()"
              [value]="viewMode()"
              (select)="setView($event)" />
          </div>
        }
      </div>



      <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

        @if (listLoading()) {
          <div class="p-4 space-y-3">
            @for (i of skeletonRows; track i) {
              <div class="animate-pulse bg-slate-100 rounded h-11"></div>
            }
          </div>
        } @else if (listRows().length) {

          <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
            <p class="text-sm text-slate-600">
              <span class="font-semibold text-slate-900">{{ listRows().length }}</span>
              {{ listRows().length === 1 ? 'job' : 'jobs' }}
              @if (visibleListRows().length < listRows().length) {
                <span class="text-slate-400">· showing {{ visibleListRows().length }}</span>
              }
            </p>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm min-w-[960px]">
              <thead>
                <tr class="text-xs font-medium text-slate-500 border-b border-slate-100">
                  <th class="px-4 py-2.5 w-16">
                    <button type="button" (click)="toggleSort('jobNumber')" class="inline-flex items-center gap-0.5 hover:text-slate-800 font-medium">
                      Job # @if (sortKey() === 'jobNumber') { <mat-icon class="!text-[14px]">{{ sortAsc() ? 'arrow_upward' : 'arrow_downward' }}</mat-icon> }
                    </button>
                  </th>
                  <th class="px-4 py-2.5">
                    <button type="button" (click)="toggleSort('name')" class="inline-flex items-center gap-0.5 hover:text-slate-800 font-medium">
                      Project @if (sortKey() === 'name') { <mat-icon class="!text-[14px]">{{ sortAsc() ? 'arrow_upward' : 'arrow_downward' }}</mat-icon> }
                    </button>
                  </th>
                  <th class="px-4 py-2.5">
                    <button type="button" (click)="toggleSort('customer')" class="inline-flex items-center gap-0.5 hover:text-slate-800 font-medium">
                      Customer @if (sortKey() === 'customer') { <mat-icon class="!text-[14px]">{{ sortAsc() ? 'arrow_upward' : 'arrow_downward' }}</mat-icon> }
                    </button>
                  </th>
                  @if (!manualFirst.hideMainWorkflowWarnings) {
                    <th class="px-4 py-2.5">Profile</th>
                    <th class="px-4 py-2.5">Status</th>
                  }
                  <th class="px-4 py-2.5 text-right">
                    <button type="button" (click)="toggleSort('contract')" class="inline-flex items-center gap-0.5 hover:text-slate-800 font-medium ml-auto">
                      Contract @if (sortKey() === 'contract') { <mat-icon class="!text-[14px]">{{ sortAsc() ? 'arrow_upward' : 'arrow_downward' }}</mat-icon> }
                    </button>
                  </th>
                  <th class="px-4 py-2.5 text-right">
                    <button type="button" (click)="toggleSort('billed')" class="inline-flex items-center gap-0.5 hover:text-slate-800 font-medium ml-auto">
                      Billed @if (sortKey() === 'billed') { <mat-icon class="!text-[14px]">{{ sortAsc() ? 'arrow_upward' : 'arrow_downward' }}</mat-icon> }
                    </button>
                  </th>
                  <th class="px-4 py-2.5 text-right">
                    <button type="button" (click)="toggleSort('leftToBill')" class="inline-flex items-center gap-0.5 hover:text-slate-800 font-medium ml-auto">
                      Left to bill @if (sortKey() === 'leftToBill') { <mat-icon class="!text-[14px]">{{ sortAsc() ? 'arrow_upward' : 'arrow_downward' }}</mat-icon> }
                    </button>
                  </th>
                  <th class="px-4 py-2.5 w-12"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (row of visibleListRows(); track row.project.id) {
                  <tr class="group hover:bg-slate-50/80 transition-colors cursor-pointer"
                      [class.opacity-60]="row.quietRow"
                      (click)="navigateToProject(row, $event)">
                    <td class="px-4 py-3 font-numeric text-sm font-semibold text-slate-900 tabular-nums">
                      {{ row.project.projectNumber }}
                    </td>
                    <td class="px-4 py-3 max-w-[280px]">
                      <a [routerLink]="['/projects', row.project.id]"
                         class="text-sm font-semibold text-slate-900 group-hover:text-slate-700 truncate block">
                        {{ row.project.projectName }}
                      </a>
                      @if (manualFirst.hideMainWorkflowWarnings) {
                        <p class="text-xs text-slate-500 truncate mt-0.5">{{ profileLabel(row.project.projectProfile) }}</p>
                      }
                    </td>
                    <td class="px-4 py-3 text-sm text-slate-600 max-w-[200px] truncate">
                      {{ row.project.customer || '—' }}
                    </td>
                    @if (!manualFirst.hideMainWorkflowWarnings) {
                      <td class="px-4 py-3 text-xs text-slate-600 max-w-[160px] truncate">
                        {{ profileLabel(row.project.projectProfile) }}
                      </td>
                      <td class="px-4 py-3">
                        <span class="inline-flex items-center gap-1.5 text-xs text-slate-600">
                          <span class="w-1.5 h-1.5 rounded-full shrink-0" [class]="statusDotClass(row)"></span>
                          {{ row.displayStatus }}
                        </span>
                      </td>
                    }
                    <td class="px-4 py-3 text-right font-numeric text-sm text-slate-700 tabular-nums">
                      {{ fmt(row.financial.currentContractAmount) }}
                    </td>
                    <td class="px-4 py-3 text-right font-numeric text-sm text-slate-700 tabular-nums">
                      {{ fmt(row.financial.billedToDate) }}
                    </td>
                    <td class="px-4 py-3 text-right font-numeric text-sm tabular-nums"
                        [class.text-slate-700]="!row.moneySecondaryAlert"
                        [class.text-rose-700]="row.moneySecondaryAlert">
                      {{ fmt(row.moneySecondaryValue) }}
                    </td>
                    <td class="px-4 py-3 text-right">
                      <a [routerLink]="['/projects', row.project.id]"
                         (click)="$event.stopPropagation()"
                         class="text-slate-400 group-hover:text-slate-700 transition-colors inline-flex"
                         title="Open project">
                        <mat-icon class="!text-[18px]">chevron_right</mat-icon>
                      </a>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          @if (visibleListRows().length < listRows().length) {
            <div class="px-4 py-3 border-t border-slate-100 text-center">
              <button type="button" (click)="loadMore()"
                      class="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                Load more
              </button>
            </div>
          }

        } @else {

          <div class="p-8">
            <app-empty-state icon="folder_off" [title]="emptyState().title" [message]="emptyState().hint ?? 'Try a different search or view.'" />
          </div>

        }

      </section>


      <app-detail-drawer

        [open]="!!quickViewRow()"

        [title]="quickViewRow() ? '#' + quickViewRow()!.project.projectNumber + ' · ' + quickViewRow()!.project.projectName : ''"

        [subtitle]="quickViewSubtitle()"

        footerActionLabel="Open full project"

        (close)="quickViewRow.set(null)"

        (footerAction)="openQuickViewProject()">

        @if (quickViewRow(); as row) {

          <app-drawer-section title="Summary">

            <app-drawer-field label="Status" [value]="row.displayStatus" />

            <app-drawer-field label="Profile" [value]="row.profileLabel" />

            <app-drawer-field label="Health" [value]="row.health" [alert]="row.health === 'Red'" />

            <app-drawer-field label="Next action" [value]="row.nextActionLabel" />

          </app-drawer-section>

          <app-drawer-section title="Money">

            <app-drawer-field label="Contract" [value]="fmt(row.financial.currentContractAmount)" [mono]="true" />

            <app-drawer-field label="Billed to date" [value]="fmt(row.financial.billedToDate)" [mono]="true" />

            <app-drawer-field label="Open AR" [value]="fmt(row.financial.arBalance)" [mono]="true" />

            <app-drawer-field label="Left to bill" [value]="fmt(row.financial.leftToBill)" [mono]="true" />

            <app-drawer-field label="Margin" [value]="row.financial.forecastMargin.toFixed(1) + '%'" [alert]="row.financial.forecastMargin < 20" />

          </app-drawer-section>

          <app-drawer-section title="Setup">

            <app-drawer-field label="Foreman" [value]="drawerForeman(row)" />

            <app-drawer-field label="Address" [value]="row.project.address || '—'" />

            <app-drawer-field label="County" [value]="row.project.county || '—'" />

            <app-drawer-field label="Start" [value]="formatDate(row.lifecycle.derivedStartDate || row.project.startDate)" />

            <app-drawer-field label="Target end" [value]="formatDate(row.project.targetCompletionDate)" />

          </app-drawer-section>

          <app-drawer-section title="Drive">

            <app-drawer-field label="Folder" [value]="row.driveLinked ? 'Linked' : 'Not linked'" [alert]="!row.driveLinked" />

            @if (row.project.driveFolderUrl) {

              <a [href]="row.project.driveFolderUrl" target="_blank" rel="noopener"

                 class="text-sm font-semibold text-indigo-700 underline">Open Drive folder</a>

            }

          </app-drawer-section>

        }

      </app-detail-drawer>



      <app-detail-drawer

        [open]="filterDrawerOpen()"

        title="Advanced filters"

        subtitle="Narrow the project list"

        footerActionLabel="Apply filters"

        (close)="filterDrawerOpen.set(false)"

        (footerAction)="applyAdvancedFilters()">

        <app-drawer-section title="Team &amp; customer">

          <label class="block text-xs font-semibold text-slate-500 mb-1">Customer</label>

          <select [(ngModel)]="advancedDraft.customer" class="w-full mb-3 px-3 py-2 rounded-lg border border-slate-200 text-sm">

            <option value="all">All customers</option>

            @for (c of customers(); track c) {

              <option [value]="c">{{ c }}</option>

            }

          </select>

          <label class="block text-xs font-semibold text-slate-500 mb-1">PM</label>

          <select [(ngModel)]="advancedDraft.pm" class="w-full mb-3 px-3 py-2 rounded-lg border border-slate-200 text-sm">

            <option value="all">All PMs</option>

            @for (p of pms(); track p) {

              <option [value]="p">{{ p }}</option>

            }

          </select>

          <label class="block text-xs font-semibold text-slate-500 mb-1">Foreman</label>

          <select [(ngModel)]="advancedDraft.foreman" class="w-full mb-3 px-3 py-2 rounded-lg border border-slate-200 text-sm">

            <option value="all">All foremen</option>

            @for (f of foremen(); track f) {

              <option [value]="f">{{ f }}</option>

            }

          </select>

          <label class="block text-xs font-semibold text-slate-500 mb-1">Project profile</label>

          <select [(ngModel)]="advancedDraft.profile" class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm">

            <option value="all">All profiles</option>

            @for (p of profileOptions; track p) {

              <option [value]="p">{{ profileLabels[p] }}</option>

            }

          </select>

        </app-drawer-section>

        <app-drawer-section title="Issues">

          <div class="space-y-2">

            @for (opt of advancedFilterOptions; track opt.id) {

              <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">

                <input type="checkbox"

                       [checked]="advancedDraft.flags.has(opt.id)"

                       (change)="toggleAdvancedFlag(opt.id, $any($event.target).checked)"

                       class="rounded">

                {{ opt.label }}

              </label>

            }

          </div>

          <button type="button" (click)="clearAdvancedFilters()"

                  class="mt-4 text-sm font-semibold text-slate-500 hover:text-slate-800">

            Clear advanced filters

          </button>

        </app-drawer-section>

      </app-detail-drawer>



      @if (showNewProject()) {

        <div class="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">

          <div class="bg-white w-full max-w-2xl rounded-xl shadow-xl overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">

            <div class="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">

              <div>

                <h2 class="text-base font-bold text-slate-900">New Project</h2>

                <p class="text-slate-500 text-xs mt-0.5">Add a job to Brighten</p>

              </div>

              <button type="button" (click)="showNewProject.set(false)" class="text-slate-400 hover:text-slate-600"><mat-icon>close</mat-icon></button>

            </div>

            <form (submit)="createProject($event)" class="p-6 space-y-5 overflow-y-auto">

              <div class="grid grid-cols-2 gap-4">

                <div>

                  <label for="num" class="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-1">Project #</label>

                  <input id="num" type="text" [(ngModel)]="newProject.projectNumber" name="num" required class="w-full px-3 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-slate-900 text-sm">

                </div>

                <div>

                  <label for="name" class="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-1">Project Name</label>

                  <input id="name" type="text" [(ngModel)]="newProject.projectName" name="name" required class="w-full px-3 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-slate-900 text-sm">

                </div>

              </div>

              <div class="grid grid-cols-2 gap-4">

                <div>

                  <label for="cust" class="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-1">Customer / GC</label>

                  <input id="cust" type="text" [(ngModel)]="newProject.customer" name="cust" required class="w-full px-3 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-slate-900 text-sm">

                </div>

                <div>

                  <label for="status" class="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-1">Status</label>

                  <select id="status" [(ngModel)]="newProject.status" name="status" class="w-full px-3 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-slate-900 text-sm">

                    @for (s of statuses; track s) {

                      <option [value]="s">{{ s }}</option>

                    }

                  </select>

                </div>

              </div>

              <div>

                <label for="address" class="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-1">Site Address</label>

                <input id="address" type="text" [(ngModel)]="newProject.address" name="address" class="w-full px-3 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-slate-900 text-sm">

              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-1">Job Profile</label>
                  <select [(ngModel)]="newProject.projectProfile" name="profile" required class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm">
                    @for (opt of profileOptions; track opt) {
                      <option [value]="opt">{{ profileLabels[opt] }}</option>
                    }
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-1">Contract ($)</label>
                  <input type="number" [(ngModel)]="newProject.originalContractAmount" name="contract" class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm">
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-1">Start Date</label>
                  <input type="date" [(ngModel)]="newProject.startDate" name="start" class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm">
                </div>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="newProject.prevailingWage" name="npw"> Prevailing Wage / CPR</label>
                <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="newProject.retainageRequired" name="nret"> Retainage Required</label>
                <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="newProject.progressBilling" name="nprog"> Progress Billing</label>
                <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="newProject.taxExempt" name="ntax"> Tax Exempt</label>
                <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="newProject.bondRequired" name="nbond"> Bond Required</label>
                <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="newProject.hasSubcontractors" name="nsubs"> Has Subcontractors</label>
                <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="newProject.tmBilling" name="ntm"> T&M Billing</label>
              </div>

              <div class="flex justify-end pt-2 shrink-0">

                <button type="submit" [disabled]="loading()"

                        class="bg-slate-900 text-white px-6 py-2 rounded-lg font-bold shadow-sm hover:bg-slate-800 disabled:opacity-50 text-sm transition-colors">

                  {{ loading() ? 'Saving…' : 'Create Project' }}

                </button>

              </div>

            </form>

          </div>

        </div>

      }

    </div>

  `,

  changeDetection: ChangeDetectionStrategy.OnPush,

})

export class Projects implements OnInit {

  private dataService = inject(DataService);
  readonly projectApi = inject(ProjectApiService);

  private controls = inject(ProjectControlsService);
  private jobRecord = inject(JobRecordService);
  readonly manualFirst = manualFirstConfig;

  private lifecycleSvc = inject(ProjectLifecycleService);

  private financialSvc = inject(ProjectFinancialService);

  private importReview = inject(ImportReviewService);

  private masterSync = inject(MasterSheetSyncService);

  private route = inject(ActivatedRoute);

  private router = inject(Router);

  private currency = inject(CurrencyPipe);



  statuses = PROJECT_STATUSES;

  profileOptions = PROJECT_PROFILE_OPTIONS;

  profileLabels = PROJECT_PROFILE_LABELS;

  advancedFilterOptions = ADVANCED_FILTER_OPTIONS;

  formatDate = formatProjectDate;

  drawerForeman(row: ProjectListRow): string {
    return effectiveForeman(row.project) || '—';
  }



  viewMode = signal<ProjectsListView>('default');

  searchQuery = signal('');

  lifecycleStatusFilter = signal<LifecycleStatusFilter>('active');

  sortKey = signal<ProjectsSortKey>('jobNumber');
  sortAsc = signal(true);

  visibleCount = signal(25);

  readonly skeletonRows = [1, 2, 3, 4, 5];

  readonly lifecycleFilterOptions: { id: LifecycleStatusFilter; label: string }[] = [
    { id: 'active', label: 'Active' },
    { id: 'closed', label: 'Closed' },
    { id: 'all', label: 'All' },
  ];

  showNewProject = signal(false);

  loading = signal(false);

  syncing = signal(false);

  syncMessage = signal<string | null>(null);

  filterDrawerOpen = signal(false);

  quickViewRow = signal<ProjectListRow | null>(null);



  advancedFilters = signal<ProjectsAdvancedFilters>({

    customer: 'all',

    pm: 'all',

    foreman: 'all',

    profile: 'all',

    flags: new Set(),

  });



  advancedDraft: ProjectsAdvancedFilters = {

    customer: 'all',

    pm: 'all',

    foreman: 'all',

    profile: 'all',

    flags: new Set(),

  };



  firestoreProjects = toSignal(this.dataService.getProjects(), { initialValue: [] as Project[] });

  projects = computed(() => {
    const apiProjects = this.projectApi.projects();
    if (this.projectApi.activeSource() === 'api' && apiProjects.length > 0) {
      return apiProjects;
    }
    return this.firestoreProjects() ?? [];
  });

  uniqueProjects = computed(() => dedupeProjectsForDisplay(this.projects() || []));

  arRecords = toSignal(this.dataService.getArRecords(), { initialValue: [] });



  lifecycleMap = computed(() => this.lifecycleSvc.snapshotMap());



  sourceReviewJobs = computed(() => {

    const jobs = new Set<string>();

    for (const e of this.importReview.unresolved()) {

      if (e.jobNumber) jobs.add(e.jobNumber.replace(/^0+/, '') || e.jobNumber);

    }

    return jobs;

  });



  allListRows = computed((): ProjectListRow[] => {

    const ar = this.arRecords() ?? [];

    const reviewJobs = this.sourceReviewJobs();

    return this.uniqueProjects().map(project => {

      const lifecycle = this.lifecycleFor(project);

      const financial = this.financialSvc.computeForProject(project);

      const jobKey = project.projectNumber.replace(/^0+/, '') || project.projectNumber;

      return buildProjectListRow({

        project,

        lifecycle,

        financial,

        arRecords: ar,

        sourceReviewIssue: reviewJobs.has(jobKey),

      });

    });

  });



  hubSummary = computed(() =>

    summarizeProjectsHub(

      this.lifecycleSvc.allSnapshots(),

      this.allListRows(),

    ),

  );



  summaryCards = computed(() => {

    const s = this.hubSummary();

    return [

      { label: 'Active Jobs', value: String(s.activeJobs), view: 'default' as ProjectsListView, icon: 'work', alert: false, subtext: undefined },

      { label: 'Upcoming', value: String(s.upcoming), view: 'upcoming' as ProjectsListView, icon: 'schedule', alert: s.upcoming > 0, subtext: undefined },

      { label: 'Closeout / AR', value: String(s.closeoutAr), view: 'closeout' as ProjectsListView, icon: 'receipt_long', alert: s.closeoutAr > 0, subtext: undefined },

      { label: 'Needs Review', value: String(s.needsReview), view: 'needsReview' as ProjectsListView, icon: 'fact_check', alert: s.needsReview > 0, subtext: undefined },

    ];

  });



  compactStats = computed(() => {
    if (manualFirstConfig.hideMainWorkflowWarnings) return [];

    const s = this.hubSummary();

    const view = this.viewMode();

    const stats: { label: string; value: string; alert?: boolean }[] = [];

    if (view === 'default' && s.closed2026Hidden > 0) {

      stats.push({ label: 'Closed 2026 hidden', value: String(s.closed2026Hidden) });

    }

    if (view === 'default' && s.archiveHidden > 0) {

      stats.push({ label: 'Archive hidden', value: String(s.archiveHidden) });

    }

    if (s.missingDrive > 0) stats.push({ label: 'Missing Drive', value: String(s.missingDrive), alert: true });

    if (s.missingContract > 0) stats.push({ label: 'Missing Contract', value: String(s.missingContract), alert: true });

    if (s.missingSetup > 0) stats.push({ label: 'Missing Setup', value: String(s.missingSetup), alert: true });

    return stats.slice(0, 5);

  });



  viewSelectOptions = computed(() => {
    const s = this.hubSummary();
    const options = manualFirstConfig.hideMainWorkflowWarnings
      ? PROJECTS_VIEW_OPTIONS.filter(opt => opt.id === 'default' || opt.id === 'all')
      : PROJECTS_VIEW_OPTIONS;

    return options.map(opt => ({
      id: opt.id,
      label: opt.id === 'default'
        ? `Active (${s.activeJobs})`
        : opt.id === 'all'
          ? 'All jobs'
          : opt.label,
    }));
  });

  segmentOptions = computed(() => {

    const s = this.hubSummary();

    return PROJECTS_VIEW_OPTIONS.map(opt => ({

      id: opt.id,

      label: opt.label,

      badge: opt.id === 'default' ? (s.activeJobs || undefined)

        : opt.id === 'closeout' ? (s.closeoutAr || undefined)

        : opt.id === 'needsReview' ? (s.needsReview || undefined)

        : undefined,

    }));

  });



  listRows = computed(() => {

    const q = this.searchQuery().trim().toLowerCase();

    const view = this.viewMode();

    const filters = this.advancedFilters();

    const lifecycleFilter = this.lifecycleStatusFilter();



    let rows = this.allListRows();



    if (q) {

      rows = rows.filter(r => projectSearchText(r.project).includes(q));

    } else {

      rows = rows.filter(r => matchesProjectsListView(r.lifecycle, view, q));

    }



    rows = rows.filter(r => matchesProjectsAdvancedFilters(r, filters));

    rows = rows.filter(r => this.matchesLifecycleStatusFilter(r, lifecycleFilter));



    return this.sortProjectRows(rows, this.sortKey(), this.sortAsc());

  });



  visibleListRows = computed(() => this.listRows().slice(0, this.visibleCount()));

  listLoading = computed(() => this.projectApi.loading() && !this.allListRows().length);



  emptyState = computed(() => projectsEmptyMessage(this.viewMode(), !!this.searchQuery().trim()));

  quickViewSubtitle = computed(() => this.quickViewRow()?.project.customer || '');



  showHiddenHint = computed(() =>

    this.viewMode() === 'default' && !this.searchQuery().trim() && this.hubSummary().closed2026Hidden + this.hubSummary().archiveHidden > 0,

  );



  advancedFilterCount = computed(() => {

    const f = this.advancedFilters();

    let n = f.flags.size;

    if (f.customer !== 'all') n++;

    if (f.pm !== 'all') n++;

    if (f.foreman !== 'all') n++;

    if (f.profile !== 'all') n++;

    return n;

  });



  customers = computed(() => [...new Set(this.uniqueProjects().map(p => p.customer).filter(Boolean))].sort() as string[]);

  pms = computed(() => [...new Set(this.uniqueProjects().map(p => p.projectManager).filter(Boolean))].sort() as string[]);

  foremen = computed(() => [...new Set(this.uniqueProjects().map(p => p.superintendent).filter(Boolean))].sort() as string[]);



  newProject: Partial<Project> = this.emptyProject();



  constructor() {

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {

      if (params.get('q')) {

        this.searchQuery.set(String(params.get('q')));

        this.viewMode.set('all');

        return;

      }

      if (params.get('view')) {

        this.viewMode.set(normalizeProjectsViewParam(params.get('view')));

      }

      if (params.get('wip')) {

        this.viewMode.set('all');

      } else if (params.get('actions') === '1') {

        this.viewMode.set('all');

      } else if (params.get('status')) {

        const s = params.get('status') as string;

        if (s === 'Closed' || s === 'closed2026') this.viewMode.set('closed2026');

        else if (s === 'Archive') this.viewMode.set('archive');

        else if (s === 'Active' || s === 'In Progress') this.viewMode.set('default');

        else if (s === 'all') this.viewMode.set('all');

        else {

          this.viewMode.set('all');

          this.searchQuery.set(s);

        }

      }

    });

  }



  ngOnInit(): void {
    this.syncAdvancedDraft();
    void this.projectApi.loadProjects();
  }

  retryLoadProjects(): void {
    void this.projectApi.loadProjects();
  }

  setLifecycleFilter(filter: LifecycleStatusFilter): void {
    this.lifecycleStatusFilter.set(filter);
    this.visibleCount.set(25);
    if (filter === 'active') this.viewMode.set('default');
    else if (filter === 'closed') this.viewMode.set('closed2026');
    else this.viewMode.set('all');
  }

  loadMore(): void {
    this.visibleCount.update(n => n + 25);
  }

  resetVisibleCount(): void {
    this.visibleCount.set(25);
  }

  navigateToProject(row: ProjectListRow, event: Event): void {
    const target = event.target as HTMLElement;
    if (target.closest('a, button')) return;
    void this.router.navigate(['/projects', row.project.id]);
  }

  private matchesLifecycleStatusFilter(row: ProjectListRow, filter: LifecycleStatusFilter): boolean {
    if (filter === 'all') return true;
    const group = row.lifecycle.projectLifecycleGroup;
    const isClosed = group === 'Closed2026' || group === 'Archive'
      || row.displayStatus === 'Closed' || row.displayStatus === 'Archived';
    return filter === 'closed' ? isClosed : !isClosed;
  }

  private sortProjectRows(rows: ProjectListRow[], key: ProjectsSortKey, asc: boolean): ProjectListRow[] {
    const dir = asc ? 1 : -1;
    return [...rows].sort((a, b) => {
      let cmp = 0;
      switch (key) {
        case 'name':
          cmp = a.project.projectName.localeCompare(b.project.projectName);
          break;
        case 'customer':
          cmp = (a.project.customer ?? '').localeCompare(b.project.customer ?? '');
          break;
        case 'contract':
          cmp = a.financial.currentContractAmount - b.financial.currentContractAmount;
          break;
        case 'billed':
          cmp = a.financial.billedToDate - b.financial.billedToDate;
          break;
        case 'leftToBill':
          cmp = a.moneySecondaryValue - b.moneySecondaryValue;
          break;
        case 'updated':
          cmp = this.projectUpdatedMs(a.project) - this.projectUpdatedMs(b.project);
          break;
        case 'jobNumber':
        default:
          cmp = compareJobNumbers(a.project.projectNumber, b.project.projectNumber);
          break;
      }
      if (cmp !== 0) return cmp * dir;
      return compareJobNumbers(a.project.projectNumber, b.project.projectNumber);
    });
  }

  private defaultSortAsc(key: ProjectsSortKey): boolean {
    return key === 'updated' ? false : true;
  }

  toggleSort(key: ProjectsSortKey): void {
    if (this.sortKey() === key) {
      this.sortAsc.update(v => !v);
    } else {
      this.sortKey.set(key);
      this.sortAsc.set(this.defaultSortAsc(key));
    }
    this.resetVisibleCount();
  }

  setSortFromDropdown(key: ProjectsSortKey): void {
    if (this.sortKey() !== key) {
      this.sortKey.set(key);
      this.sortAsc.set(this.defaultSortAsc(key));
    }
    this.resetVisibleCount();
  }

  resetDefaultSort(): void {
    this.sortKey.set('jobNumber');
    this.sortAsc.set(true);
  }

  private projectUpdatedMs(project: Project): number {
    const raw = project.updatedAt;
    if (!raw) return 0;
    const ms = raw instanceof Date ? raw.getTime() : new Date(String(raw)).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }



  lifecycleFor(project: Project): ProjectLifecycleSnapshot {

    return this.lifecycleMap().get(project.id) ?? this.lifecycleSvc.forProject(project);

  }



  fmt(value: number): string {

    return this.currency.transform(value, 'USD', 'symbol', '1.0-0') ?? '$0';

  }

  profileLabel(profile: string | undefined): string {
    return projectProfileLabel(profile);
  }

  hoursLabel(project: Project): string {
    const h = project.totalLaborHours;
    if (h == null || !Number.isFinite(h)) return '—';
    return h.toFixed(1);
  }

  profitToDate(row: ProjectListRow): number {
    return (row.financial.billedToDate ?? 0) - (row.financial.costToDate ?? 0);
  }

  warningRoute(row: ProjectListRow, chip: ProjectListWarning): string[] {
    const pid = row.project.id;
    if (chip.id === 'source-review') return ['/settings'];
    return ['/projects', pid];
  }



  statusDotClass(row: ProjectListRow): Record<string, boolean> {
    const status = row.displayStatus;
    if (status === 'Active') return { 'bg-emerald-500': true };
    if (status === 'Upcoming') return { 'bg-slate-300': true };
    if (status === 'Closeout' || status === 'Needs Review') return { 'bg-amber-400': true };
    if (row.health === 'Red') return { 'bg-rose-500': true };
    return { 'bg-slate-300': true };
  }



  setView(view: ProjectsListView): void {

    this.viewMode.set(view);

    this.visibleCount.set(25);
    this.resetDefaultSort();

    if (view === 'default' || view === 'active') this.lifecycleStatusFilter.set('active');
    else if (view === 'closed2026' || view === 'archive') this.lifecycleStatusFilter.set('closed');
    else if (view === 'all') this.lifecycleStatusFilter.set('all');

    void this.router.navigate([], {

      relativeTo: this.route,

      queryParams: { view: view === 'default' ? 'active' : view, q: null, status: null, wip: null, actions: null },

      queryParamsHandling: 'merge',

      replaceUrl: true,

    });

  }



  onSearch(value: string): void {

    this.searchQuery.set(value);

    this.visibleCount.set(25);

    if (value.trim()) {

      this.viewMode.set('all');

    }

  }



  openQuickView(row: ProjectListRow): void {

    this.quickViewRow.set(row);

  }



  openQuickViewProject(): void {

    const row = this.quickViewRow();

    if (row) void this.router.navigate(['/projects', row.project.id]);

  }



  openFilterDrawer(): void {

    this.syncAdvancedDraft();

    this.filterDrawerOpen.set(true);

  }



  applyAdvancedFilters(): void {

    this.advancedFilters.set({

      ...this.advancedDraft,

      flags: new Set(this.advancedDraft.flags),

    });

    this.filterDrawerOpen.set(false);

  }



  toggleAdvancedFlag(id: ProjectsAdvancedFilterId, checked: boolean): void {

    if (checked) this.advancedDraft.flags.add(id);

    else this.advancedDraft.flags.delete(id);

  }



  clearAdvancedFilters(): void {

    this.advancedDraft = { customer: 'all', pm: 'all', foreman: 'all', profile: 'all', flags: new Set() };

    this.advancedFilters.set({ ...this.advancedDraft, flags: new Set() });

  }



  syncAdvancedDraft(): void {

    const f = this.advancedFilters();

    this.advancedDraft = { ...f, flags: new Set(f.flags) };

  }



  exportCsv(): void {

    downloadCsv(

      `projects-${this.viewMode()}-${new Date().toISOString().slice(0, 10)}.csv`,

      ['Job #', 'Project', 'Customer', 'Status', 'Profile', 'Contract', 'Billed', 'AR', 'Left to bill', 'Health', 'Warnings', 'Next action', 'Drive'],

      projectsCsvRows(this.listRows()),

    );

  }



  async syncProjects(): Promise<void> {

    this.syncing.set(true);

    this.syncMessage.set(null);

    try {

      await this.masterSync.syncFromMasterSheet(true);

      this.syncMessage.set('Projects synced from Master Sheet.');

    } catch (err) {

      this.syncMessage.set(err instanceof Error ? err.message : 'Sync failed');

    } finally {

      this.syncing.set(false);

    }

  }



  openNewProject(): void {

    this.newProject = this.emptyProject();

    this.showNewProject.set(true);

  }



  emptyProject(): Partial<Project> {

    return {

      projectNumber: '',

      projectName: '',

      customer: '',

      status: 'Active',

      projectProfile: 'FullContractGC',

      billingType: 'Lump Sum',

      taxExempt: false,

      prevailingWage: false,

      retainageRequired: false,

      progressBilling: false,

      bondRequired: false,

      hasSubcontractors: false,

      tmBilling: false,

      kansasRemodelTax: false,

    };

  }



  createProject(event: Event): void {

    event.preventDefault();

    if (!this.newProject.projectName || !this.newProject.projectNumber) return;



    const matches = findProjectMatches(this.projects() || [], {

      projectNumber: this.newProject.projectNumber,

      projectName: this.newProject.projectName,

    });

    if (matches.length) {

      const duplicate = pickCanonicalProject(matches);

      alert(`Job #${duplicate.projectNumber} already exists (${duplicate.projectName}). Open that project instead.`);

      return;

    }



    this.loading.set(true);

    const payload = { ...this.newProject, taxable: !this.newProject.taxExempt };

    this.dataService.createProject(payload).subscribe({

      next: async (project) => {

        await this.jobRecord.upsertCompany(project.customer, 'Customer');

        void this.controls.onProjectCreated(project);

        this.showNewProject.set(false);

        this.newProject = this.emptyProject();

        this.loading.set(false);

        void this.router.navigate(['/projects', project.id]);

      },

      error: (err) => {

        this.loading.set(false);

        alert('Failed to create project.');

        console.error('Create project failed:', err);

      },

    });

  }

}


