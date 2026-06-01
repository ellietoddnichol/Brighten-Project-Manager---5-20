import { Component, Input, computed, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { DRIVE_FOLDER_MAPPING_RULES } from '../models/drive-folder-mapping.types';
import { PROJECT_PROFILE_LABELS, PROJECT_PROFILE_OPTIONS } from '../models/project-requirements.types';
import { Project, ProjectFolder } from '../models/types';
import { AuthService } from '../services/auth.service';
import { DataService } from '../services/data.service';
import { DriveFolderDiscoveryService, DiscoveryResult } from '../services/drive-folder-discovery.service';
import { DriveService, parseDriveFolderId } from '../services/drive.service';
import { ProjectDocumentSaveService } from '../services/project-document-save.service';
import { ProjectRequirementsService } from '../services/project-requirements.service';
import { folderNeedStatusLabel } from '../utils/project-requirements.compute';

@Component({
  selector: 'app-drive-mapping-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  template: `
    <div class="space-y-6">
      @if (authWarning()) {
        <div class="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          Drive mapping is not connected. Re-authorize Drive to scan or save project documents.
          <button (click)="reauthorize()" class="ml-3 underline font-bold">Re-authorize Drive</button>
        </div>
      }

      @if (summary().needsProfile) {
        <div class="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          <p class="font-bold mb-1">Drive structure not fully mapped — choose a project profile</p>
          <p class="mb-3">This job has a light folder structure. Pick a profile so required-folder checks match how the job actually runs.</p>
          <select [(ngModel)]="profileDraft" (ngModelChange)="saveProfile()" class="px-3 py-2 border rounded-lg text-sm bg-white">
            <option value="">— Select profile —</option>
            @for (p of profileOptions; track p) {
              <option [value]="p">{{ profileLabels[p] }}</option>
            }
          </select>
        </div>
      }

      <div class="bg-white rounded-md shadow-sm border border-slate-200 p-5">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 class="text-lg font-bold text-slate-900">Drive Folder Mapping</h3>
            <p class="text-sm text-slate-600 mt-1 max-w-2xl">
              Normalizes Brighten's existing subfolders. Required checks depend on project profile and actual job data — not every job needs every folder.
            </p>
            <p class="text-xs text-slate-500 mt-2">
              Profile: <span class="font-semibold">{{ summary().profileLabel }}</span>
              @if (project.projectProfile) { (set) } @else { (inferred) }
            </p>
            @if (project.driveFolderId) {
              <a [href]="drive.folderUrl(project.driveFolderId)" target="_blank"
                 class="inline-flex items-center gap-1 text-sm text-blue-600 font-medium mt-2 hover:underline">
                <mat-icon class="!text-[16px]">folder_open</mat-icon>
                Open project root folder
              </a>
            } @else {
              <p class="text-sm text-rose-600 mt-2">Link a project Drive folder in Setup first.</p>
            }
          </div>
          <div class="flex flex-col gap-2 min-w-[220px]">
            <label class="text-[10px] font-bold uppercase text-slate-500">Project Profile</label>
            <select [(ngModel)]="profileDraft" (ngModelChange)="saveProfile()" class="px-3 py-2 border rounded-lg text-sm">
              <option value="">Auto-detect</option>
              @for (p of profileOptions; track p) {
                <option [value]="p">{{ profileLabels[p] }}</option>
              }
            </select>
          </div>
          <div class="flex flex-wrap gap-2">
            <button (click)="rescan(false)" [disabled]="scanning() || !project.driveFolderId"
                    class="bg-slate-900 text-white px-4 py-2 rounded-md font-bold text-sm disabled:opacity-50">
              {{ scanning() ? 'Scanning…' : 'Rescan folders' }}
            </button>
            <button (click)="rescan(true)" [disabled]="scanning() || !project.driveFolderId"
                    class="bg-white text-slate-700 border border-slate-300 px-4 py-2 rounded-md font-bold text-sm disabled:opacity-50">
              Rescan & replace manual
            </button>
            <button (click)="reauthorize()" class="bg-white text-slate-700 border border-slate-300 px-4 py-2 rounded-md font-bold text-sm">
              Re-authorize Drive
            </button>
          </div>
        </div>

        @if (lastResult()) {
          <p class="text-xs text-slate-500 mt-4">
            Last scan: {{ lastResult()!.linkedCount }} linked · {{ lastResult()!.missingCount }} unmapped
            @if (lastResult()!.needsReviewCount) { · {{ lastResult()!.needsReviewCount }} need review }
            @if (lastResult()!.skippedManual) { · {{ lastResult()!.skippedManual }} manual kept }
            @if (lastResult()!.scannedCount) { · {{ lastResult()!.scannedCount }} folders scanned }
          </p>
        }
        @if (scanError()) {
          <p class="text-sm text-rose-600 mt-2">{{ scanError() }}</p>
        }
      </div>

      <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Found</p>
          <p class="text-xl font-bold text-emerald-600">{{ summary().found }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Missing — Required</p>
          <p class="text-xl font-bold text-rose-600">{{ summary().missingRequired }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Missing — Optional</p>
          <p class="text-xl font-bold text-amber-600">{{ summary().missingOptional }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Not Needed</p>
          <p class="text-xl font-bold text-slate-500">{{ summary().notNeeded }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Needs Review</p>
          <p class="text-xl font-bold text-blue-600">{{ reviewCount() }}</p>
        </div>
      </div>

      @if (manualLinkKey()) {
        <div class="bg-slate-50 border border-slate-200 rounded-md p-5">
          <h4 class="font-bold text-slate-900 mb-3">Manually link: {{ docSave.displayName(manualLinkKey()!) }}</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Drive Folder ID or URL</label>
              <input [(ngModel)]="manualFolderInput" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Path label (optional)</label>
              <input [(ngModel)]="manualPathInput" [placeholder]="docSave.expectedPath(manualLinkKey()!)"
                     class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
            </div>
          </div>
          <div class="flex gap-2 mt-4">
            <button (click)="saveManualLink()" class="bg-emerald-600 text-white px-4 py-2 rounded font-bold text-sm">Save link</button>
            <button (click)="cancelManualLink()" class="px-4 py-2 rounded font-bold text-slate-600 text-sm">Cancel</button>
          </div>
        </div>
      }

      <div class="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm min-w-[1000px]">
            <thead>
              <tr class="bg-slate-50 border-b border-slate-200">
                <th class="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Folder Key</th>
                <th class="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Expected Path</th>
                <th class="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Linked Folder</th>
                <th class="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">For This Job</th>
                <th class="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Match</th>
                <th class="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (row of mappingRows(); track row.folderKey) {
                <tr class="hover:bg-slate-50" [class.opacity-50]="row.needStatus === 'not_needed'">
                  <td class="px-5 py-3">
                    <div class="font-medium text-slate-900">{{ row.displayName }}</div>
                    <div class="text-[10px] text-slate-400 font-mono">{{ row.folderKey }}</div>
                  </td>
                  <td class="px-5 py-3 text-slate-600 text-xs">{{ row.expectedPath }}</td>
                  <td class="px-5 py-3">
                    @if (row.link?.folderId) {
                      <a [href]="row.link!.folderUrl" target="_blank" class="text-blue-600 hover:underline text-xs">
                        {{ row.link!.drivePath || row.link!.folderName }}
                      </a>
                    } @else {
                      <span class="text-slate-400 text-xs">Not found</span>
                    }
                  </td>
                  <td class="px-5 py-3">
                    <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded whitespace-nowrap"
                          [class.bg-emerald-100]="row.needStatus === 'found'"
                          [class.text-emerald-700]="row.needStatus === 'found'"
                          [class.bg-rose-100]="row.needStatus === 'missing_required'"
                          [class.text-rose-700]="row.needStatus === 'missing_required'"
                          [class.bg-amber-100]="row.needStatus === 'missing_optional'"
                          [class.text-amber-700]="row.needStatus === 'missing_optional'"
                          [class.bg-slate-100]="row.needStatus === 'not_needed'"
                          [class.text-slate-500]="row.needStatus === 'not_needed'">
                      {{ needLabel(row.needStatus) }}
                    </span>
                  </td>
                  <td class="px-5 py-3">
                    <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded"
                          [class.bg-blue-100]="row.link?.linkStatus === 'Manual'"
                          [class.text-blue-700]="row.link?.linkStatus === 'Manual'"
                          [class.bg-amber-100]="row.link?.linkStatus === 'Needs Review'"
                          [class.text-amber-700]="row.link?.linkStatus === 'Needs Review'"
                          [class.bg-emerald-100]="row.link?.linkStatus === 'Linked'"
                          [class.text-emerald-700]="row.link?.linkStatus === 'Linked'"
                          [class.bg-slate-100]="!row.link?.folderId"
                          [class.text-slate-500]="!row.link?.folderId">
                      {{ row.link?.linkStatus || 'Missing' }}
                    </span>
                  </td>
                  <td class="px-5 py-3 text-right whitespace-nowrap">
                    @if (row.link?.folderId) {
                      <a [href]="row.link!.folderUrl" target="_blank"
                         class="text-xs font-bold text-blue-600 hover:underline mr-3">Open</a>
                    }
                    <button (click)="startManualLink(row.folderKey)" class="text-xs font-bold text-slate-600 hover:underline mr-3">Link</button>
                    @if (row.folderKey !== 'PROJECT_ROOT' && row.needStatus !== 'not_needed' && !row.link?.folderId) {
                      <button (click)="createFolder(row.folderKey)" [disabled]="creatingKey() === row.folderKey"
                              class="text-xs font-bold text-orange-600 hover:underline disabled:opacity-50">
                        {{ creatingKey() === row.folderKey ? 'Creating…' : 'Create' }}
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class DriveMappingTabComponent {
  @Input({ required: true }) project!: Project;

  private data = inject(DataService);
  private discovery = inject(DriveFolderDiscoveryService);
  private auth = inject(AuthService);
  private requirements = inject(ProjectRequirementsService);
  drive = inject(DriveService);
  docSave = inject(ProjectDocumentSaveService);

  private allFolders = toSignal(this.data.getProjectFolders(), { initialValue: [] as ProjectFolder[] });

  scanning = signal(false);
  scanError = signal<string | null>(null);
  lastResult = signal<DiscoveryResult | null>(null);
  manualLinkKey = signal<string | null>(null);
  manualFolderInput = '';
  manualPathInput = '';
  creatingKey = signal<string | null>(null);
  profileDraft = '';

  readonly profileOptions = PROJECT_PROFILE_OPTIONS;
  readonly profileLabels = PROJECT_PROFILE_LABELS;
  needLabel = folderNeedStatusLabel;

  authWarning = computed(() => !this.auth.accessToken() && !!this.project.driveFolderId);

  projectLinks = computed(() =>
    this.allFolders().filter(f => f.projectId === this.project.id).sort((a, b) => a.sortOrder - b.sortOrder),
  );

  reqCtx = computed(() => this.requirements.buildContext(this.project, this.projectLinks()));

  summary = computed(() => this.requirements.summarize(this.project, this.projectLinks()));

  mappingRows = computed(() => {
    const reqRows = new Map(this.requirements.rows(this.project, this.projectLinks()).map(r => [r.folderKey, r]));
    return DRIVE_FOLDER_MAPPING_RULES.map(rule => ({
      folderKey: rule.key,
      displayName: rule.displayName,
      expectedPath: rule.expectedPath,
      link: this.projectLinks().find(f => f.folderKey === rule.key),
      needStatus: reqRows.get(rule.key)?.needStatus ?? 'not_needed',
    }));
  });

  reviewCount = computed(() => this.projectLinks().filter(f => f.linkStatus === 'Needs Review').length);

  constructor() {
    effect(() => {
      if (this.project?.id) {
        this.profileDraft = this.project.projectProfile ?? '';
        void this.discovery.initializeFolderLinks(this.project.id, this.project.driveFolderId);
      }
    });
  }

  async saveProfile(): Promise<void> {
    const profile = this.profileDraft || undefined;
    await firstValueFrom(this.data.updateProject(this.project.id, {
      projectProfile: profile as Project['projectProfile'],
    }));
  }

  async reauthorize() {
    this.scanError.set(null);
    try {
      await this.auth.refreshDriveAccess();
    } catch (e) {
      this.scanError.set(e instanceof Error ? e.message : 'Re-authorization failed');
    }
  }

  async rescan(replaceManual: boolean) {
    if (!this.project.driveFolderId) return;
    this.scanning.set(true);
    this.scanError.set(null);
    try {
      const token = await this.auth.getAccessToken();
      if (!token) {
        await this.auth.refreshDriveAccess();
      }
      const result = await this.discovery.discoverProjectFolders(this.project, { replaceManual });
      this.lastResult.set(result);
      if (result.error) this.scanError.set(result.error);
      if (result.authRequired) {
        this.scanError.set('Drive mapping is not connected. Re-authorize Drive to scan project folders.');
      }
    } catch (e) {
      this.scanError.set(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      this.scanning.set(false);
    }
  }

  startManualLink(folderKey: string) {
    this.manualLinkKey.set(folderKey);
    this.manualFolderInput = '';
    this.manualPathInput = '';
  }

  cancelManualLink() {
    this.manualLinkKey.set(null);
  }

  async saveManualLink() {
    const key = this.manualLinkKey();
    if (!key || !this.manualFolderInput.trim()) return;
    const folderId = parseDriveFolderId(this.manualFolderInput);
    await this.discovery.manualLinkFolder(
      this.project.id,
      key,
      folderId,
      this.manualPathInput.trim() || this.docSave.expectedPath(key),
    );
    this.manualLinkKey.set(null);
  }

  async createFolder(folderKey: string) {
    if (!confirm(`Create "${this.docSave.displayName(folderKey)}" folder in Drive?`)) return;
    this.creatingKey.set(folderKey);
    this.scanError.set(null);
    try {
      const token = await this.auth.getAccessToken();
      if (!token) await this.auth.refreshDriveAccess();
      await this.discovery.createMissingFolder(this.project, folderKey);
    } catch (e) {
      this.scanError.set(e instanceof Error ? e.message : 'Create folder failed');
    } finally {
      this.creatingKey.set(null);
    }
  }
}
