import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { SyncHealthService } from '../services/sync-health.service';
import { ImportReviewService } from '../services/import-review.service';
import { DataService } from '../services/data.service';
import { ProjectLifecycleService } from '../services/project-lifecycle.service';
import { TimeDataSheetSyncService } from '../services/time-data-sheet-sync.service';
import { QuickBooksSyncSheetsService } from '../services/quickbooks-sync-sheets.service';
import { PageHeaderComponent } from '../components/ui/page-header';
import { StatCardComponent } from '../components/ui/stat-card';
import { SegmentedControlComponent } from '../components/ui/segmented-control';
import { downloadCsv } from '../utils/csv-export';
import { Project } from '../models/types';
import {
  countSetupMissing,
  SETTINGS_SEGMENT_OPTIONS,
  settingsFragmentForSegment,
  settingsHubCsvRows,
  settingsSegmentFromFragment,
  SettingsSegmentId,
  summarizeSettingsHub,
} from '../utils/settings-hub.compute';
import { buildReviewCenterItems } from '../utils/review-center.compute';
import { SettingsSourceHealthComponent } from './settings-source-health';
import { SettingsSetupDefaultsComponent } from './settings-setup-defaults';
import { SettingsReviewCenterComponent } from './settings-review-center';
import { SettingsImportCenterComponent } from './settings-import-center';
import { SettingsAdvancedToolsComponent } from './settings-advanced-tools';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    PageHeaderComponent,
    StatCardComponent,
    SegmentedControlComponent,
    SettingsSourceHealthComponent,
    SettingsSetupDefaultsComponent,
    SettingsReviewCenterComponent,
    SettingsImportCenterComponent,
    SettingsAdvancedToolsComponent,
  ],
  template: `
    <div class="p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6">
      <app-page-header
        title="Settings"
        subtitle="Control center — source health, review items, and active imports. Job setup lives in the app.">
        <button type="button" (click)="setSegment('reviewCenter')"
                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50">
          Review Center
          @if (summary().reviewItems) {
            <span class="ml-1 text-amber-700">({{ summary().reviewItems }})</span>
          }
        </button>
        <button type="button" (click)="exportReport()"
                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50">
          Export status
        </button>
      </app-page-header>

      @if (hubMessage()) {
        <p class="text-sm text-emerald-700">{{ hubMessage() }}</p>
      }
      @if (hubError()) {
        <p class="text-sm text-rose-700">{{ hubError() }}</p>
      }

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button type="button" (click)="setSegment('sourceHealth')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Sources OK" [value]="sourcesLabel()" icon="link" />
        </button>
        <button type="button" (click)="setSegment('reviewCenter')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Review Items" [value]="num(summary().reviewItems)" icon="rule"
                         [trend]="summary().reviewItems ? 'Needs attention' : undefined" [trendPositive]="false" />
        </button>
        <button type="button" (click)="setSegment('reviewCenter')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Setup Gaps" [value]="num(summary().setupMissing)" icon="build"
                         [trend]="summary().setupMissing ? 'Active jobs' : undefined" [trendPositive]="false" />
        </button>
        <button type="button" (click)="setSegment('sourceHealth')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Sync Warnings" [value]="num(summary().syncWarnings)" icon="warning"
                         [trend]="summary().syncWarnings ? 'Check sources' : undefined" [trendPositive]="false" />
        </button>
      </div>

      <app-segmented-control [options]="segmentOptions()" [value]="segment()" (select)="setSegment($event)" />

      @switch (segment()) {
        @case ('sourceHealth') {
          <app-settings-source-health (navigate)="setSegment($event)" />
        }
        @case ('setupDefaults') {
          <app-settings-setup-defaults />
        }
        @case ('reviewCenter') {
          <app-settings-review-center />
        }
        @case ('importCenter') {
          <app-settings-import-center />
        }
        @case ('advanced') {
          <app-settings-advanced-tools />
        }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private syncHealth = inject(SyncHealthService);
  private importReview = inject(ImportReviewService);
  private data = inject(DataService);
  private lifecycle = inject(ProjectLifecycleService);
  private timeSync = inject(TimeDataSheetSyncService);
  private qbSync = inject(QuickBooksSyncSheetsService);

  segment = signal<SettingsSegmentId>('sourceHealth');
  hubMessage = signal<string | null>(null);
  hubError = signal<string | null>(null);

  private projects = toSignal(this.data.getProjects(), { initialValue: [] as Project[] });

  reviewItemCount = computed(() => buildReviewCenterItems({
    projects: this.projects() ?? [],
    lifecycleFor: p => this.lifecycle.forProject(p),
    importExceptions: this.importReview.exceptions(),
  }).length);

  setupMissing = computed(() =>
    countSetupMissing(this.projects() ?? [], p => this.lifecycle.forProject(p)),
  );

  summary = computed(() => summarizeSettingsHub({
    syncRows: this.syncHealth.rows(),
    reviewItemCount: this.reviewItemCount(),
    setupMissing: this.setupMissing(),
  }));

  segmentOptions = computed(() => {
    const opts = SETTINGS_SEGMENT_OPTIONS.map(o => ({
      id: o.id,
      label: o.label,
      badge: undefined as number | undefined,
    }));
    const reviewIdx = opts.findIndex(o => o.id === 'reviewCenter');
    const count = this.reviewItemCount();
    if (reviewIdx >= 0 && count) opts[reviewIdx].badge = count;
    return opts;
  });

  constructor() {
    this.route.fragment.pipe(takeUntilDestroyed()).subscribe(fragment => {
      const fromFragment = settingsSegmentFromFragment(fragment);
      if (fromFragment) this.segment.set(fromFragment);
    });
  }

  ngOnInit(): void {
    if (!this.route.snapshot.fragment) {
      this.segment.set('sourceHealth');
    }
  }

  num(value: number): string {
    return String(value);
  }

  sourcesLabel(): string {
    const s = this.summary();
    return `${s.sourcesConnected}/${s.sourcesTotal}`;
  }

  setSegment(segment: SettingsSegmentId): void {
    this.segment.set(segment);
    void this.router.navigate([], {
      relativeTo: this.route,
      fragment: settingsFragmentForSegment(segment),
      replaceUrl: true,
    });
  }

  exportReport(): void {
    downloadCsv(
      `settings-status-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Metric', 'Value'],
      settingsHubCsvRows(this.summary()),
    );
  }
}
