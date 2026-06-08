import { Component, inject, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { DriveFolderSeedService } from '@features/subcontractors/services/drive-folder-seed.service';
import { DataService } from '@core/services/data.service';
import { ProjectLifecycleService } from '@features/projects/services/project-lifecycle.service';
import { isActiveSetupProject } from '@shared/utils/settings-hub.compute';

@Component({
  selector: 'app-settings-drive-folders',
  standalone: true,
  imports: [CommonModule, MatIconModule, RouterLink],
  template: `
    <section id="drive-links" class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mb-6">
      <span id="drive-folders" class="sr-only"></span>
      <h2 class="text-xl font-bold mb-2">Drive Links</h2>
      <p class="text-sm text-slate-500 font-medium mb-4 max-w-2xl">
        Google Drive stores actual files. Firestore stores project root links, folder mappings, and file metadata.
        Scan folders from the Documents hub or open Drive Mapping on each active job.
      </p>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 text-sm">
        <div class="bg-slate-50 rounded-xl border p-3">
          <p class="text-[10px] uppercase font-bold text-slate-500">Active jobs linked</p>
          <p class="text-lg font-bold">{{ stats().linkedActive }}</p>
        </div>
        <div class="bg-slate-50 rounded-xl border p-3">
          <p class="text-[10px] uppercase font-bold text-slate-500">Missing on active</p>
          <p class="text-lg font-bold" [class.text-rose-700]="stats().missingActive > 0">{{ stats().missingActive }}</p>
        </div>
        <div class="bg-slate-50 rounded-xl border p-3">
          <p class="text-[10px] uppercase font-bold text-slate-500">Folder mappings</p>
          <p class="text-lg font-bold">{{ folderMappingCount() }}</p>
        </div>
        <div class="bg-slate-50 rounded-xl border p-3">
          <p class="text-[10px] uppercase font-bold text-slate-500">Needs review</p>
          <p class="text-lg font-bold" [class.text-amber-700]="stats().duplicateReview > 0">{{ stats().duplicateReview }}</p>
        </div>
      </div>

      @if (driveSeed.duplicateReviews.length) {
        <div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-4">
          <strong>Duplicate folder warnings:</strong> {{ duplicateJobList() }} — review mapping on the job.
        </div>
      }

      <div class="flex flex-wrap gap-3 mb-4">
        <a routerLink="/documents" [queryParams]="{ segment: 'driveLinks' }"
           class="bg-slate-900 text-white px-5 py-2.5 rounded-md text-sm font-semibold hover:bg-slate-800 flex items-center gap-2">
          <mat-icon class="!text-[18px]">folder_open</mat-icon>
          Open Documents → Drive Links
        </a>
        <a routerLink="/documents"
           class="bg-white border border-slate-300 text-slate-700 px-5 py-2.5 rounded-md text-sm font-semibold hover:bg-slate-50">
          Scan Drive folders
        </a>
      </div>

      <details class="rounded-xl border border-slate-200 p-4 mt-4">
        <summary class="text-sm font-semibold text-slate-700 cursor-pointer">Dev: import from Drive audit CSV</summary>
        <p class="text-xs text-slate-500 mt-3 mb-3">
          Optional developer tool — bulk-import project root links from a cleaned Drive audit export.
          Production workflow uses per-job Drive Mapping and scan.
        </p>
        <div class="flex flex-wrap gap-3">
          <button type="button" (click)="importActive()" [disabled]="driveSeed.syncing()"
                  class="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-50">
            Import missing active links
          </button>
          <button type="button" (click)="importClosed()" [disabled]="driveSeed.syncing()"
                  class="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-50">
            Import closed/archive links
          </button>
        </div>
        @if (driveSeed.lastMessage()) {
          <p class="text-sm text-emerald-700 mt-3">{{ driveSeed.lastMessage() }}</p>
        }
      </details>
    </section>
  `,
})
export class SettingsDriveFolders implements OnInit {
  driveSeed = inject(DriveFolderSeedService);
  private data = inject(DataService);
  private lifecycle = inject(ProjectLifecycleService);

  private projects = toSignal(this.data.getProjects(), { initialValue: [] });
  private folders = toSignal(this.data.getProjectFolders(), { initialValue: [] });

  stats = computed(() => {
    const projects = this.projects() ?? [];
    let linkedActive = 0;
    let missingActive = 0;
    for (const p of projects) {
      const snap = this.lifecycle.forProject(p);
      if (!isActiveSetupProject(snap)) continue;
      if (p.driveFolderId || p.driveFolderUrl) linkedActive++;
      else missingActive++;
    }
    const seedStats = this.driveSeed.stats();
    return {
      linkedActive,
      missingActive,
      duplicateReview: seedStats.duplicateReview,
    };
  });

  folderMappingCount = computed(() => (this.folders() ?? []).length);

  ngOnInit(): void {
    void this.driveSeed.refreshProjectLinkStats();
  }

  duplicateJobList(): string {
    return this.driveSeed.duplicateReviews.map(r => r.jobNumber).join(', ');
  }

  async importActive(): Promise<void> {
    await this.driveSeed.syncDriveFolderIds(false, 'active');
    await this.driveSeed.refreshProjectLinkStats();
  }

  async importClosed(): Promise<void> {
    await this.driveSeed.syncDriveFolderIds(false, 'closed');
    await this.driveSeed.refreshProjectLinkStats();
  }
}
