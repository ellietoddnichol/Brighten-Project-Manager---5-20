import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Project } from '../../models/types';
import { DocumentsTabComponent, fileCountForView } from '../../pages/documents-tab';
import { FILE_VIEW_LABELS, FileView, UtilityView } from './project-detail.types';
import { ProjectEnabledModules } from '../../models/project-needs.types';
import { DataService } from '../../services/data.service';
import { ProjectRequirementsService } from '../../services/project-requirements.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { ProjectLifecycleService } from '../../services/project-lifecycle.service';
import { fileViewVisibleInNav } from '../../utils/project-documents.compute';

@Component({
  selector: 'app-project-documents-panel',
  standalone: true,
  imports: [CommonModule, MatIconModule, DocumentsTabComponent],
  template: `
    <div class="space-y-5">
      <div class="flex flex-wrap items-center gap-2">
        @for (seg of primarySegments(); track seg.id) {
          <button type="button" (click)="fileViewChange.emit(seg.id)"
                  [class.bg-slate-900]="activeView === seg.id"
                  [class.text-white]="activeView === seg.id"
                  class="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold transition-colors hover:bg-slate-50 flex items-center gap-1.5">
            {{ seg.label }}
            @if (seg.badge) {
              <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    [class.bg-amber-500]="activeView !== seg.id"
                    [class.text-white]="activeView !== seg.id"
                    [class.bg-white/20]="activeView === seg.id">{{ seg.badge }}</span>
            }
          </button>
        }
        @if (moreSegments().length) {
          <div class="relative">
            <button type="button" (click)="moreOpen.set(!moreOpen())"
                    class="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold bg-white hover:bg-slate-50 flex items-center gap-1">
              More
              @if (moreBadgeTotal() > 0) {
                <span class="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{{ moreBadgeTotal() }}</span>
              }
            </button>
            @if (moreOpen()) {
              <div class="absolute z-20 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[200px]">
                @for (seg of moreSegments(); track seg.id) {
                  <button type="button" (click)="onMoreSelect(seg.id)"
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

      @if (activeView !== 'drive-mapping') {
        @if (project.driveFolderUrl || project.driveFolderId) {
          <a [href]="project.driveFolderUrl" target="_blank" rel="noopener"
             class="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
            <mat-icon class="!text-[18px]">folder_shared</mat-icon> Open Drive folder
          </a>
        } @else if (!project.driveFolderId && isActiveJob()) {
          <div class="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-900">
            Drive folder not linked.
            <button type="button" (click)="utilitySelect.emit('drive-mapping')" class="ml-2 font-bold underline">Link folder</button>
          </div>
        }
      }

      @if (activeView === 'drive-mapping') {
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-5 text-sm text-slate-600">
          Drive mapping opens in the utility panel.
          <button type="button" (click)="utilitySelect.emit('drive-mapping')" class="ml-2 font-bold text-blue-600 underline">Open Drive Mapping</button>
        </div>
      } @else {
        <app-documents-tab
          [project]="project"
          [fileView]="activeView"
          [modules]="modules"
          [showAllTools]="modules.showAllTools" />
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDocumentsPanelComponent {
  @Input({ required: true }) project!: Project;
  @Input({ required: true }) activeView: FileView = 'all';
  @Input({ required: true }) modules!: ProjectEnabledModules;
  @Output() utilitySelect = new EventEmitter<UtilityView>();
  @Output() fileViewChange = new EventEmitter<FileView>();

  private data = inject(DataService);
  private requirements = inject(ProjectRequirementsService);
  private lifecycle = inject(ProjectLifecycleService);

  moreOpen = signal(false);

  private allFiles = toSignal(this.data.getProjectFiles(), { initialValue: [] });
  private allReqs = toSignal(this.data.getRequiredDocuments(), { initialValue: [] });

  private reqCtx = computed(() => this.requirements.buildContext(this.project));
  private projectReqs = computed(() => (this.allReqs() ?? []).filter(r => r.projectId === this.project.id));

  private countFor = (view: FileView) =>
    fileCountForView(
      this.allFiles() ?? [],
      view,
      this.project,
      this.projectReqs(),
      this.requirements,
      this.lifecycle.forProject(this.project),
    );

  private segmentBadge(view: FileView): number | undefined {
    const count = this.countFor(view);
    if (view === 'required' && count > 0) return count;
    if (view !== 'required' && view !== 'all' && count > 0) return count;
    return undefined;
  }

  primarySegments = computed(() =>
    this.modules.filesPrimary.map(id => ({
      id,
      label: FILE_VIEW_LABELS[id] ?? id,
      badge: this.segmentBadge(id),
    })),
  );

  moreSegments = computed(() => {
    const ctx = this.reqCtx();
    const files = (this.allFiles() ?? []).filter(f => f.projectId === this.project.id);
    return this.modules.filesMore
      .filter(id => id === 'drive-mapping' || fileViewVisibleInNav(id, this.modules, files, ctx, this.projectReqs()))
      .map(id => ({
        id,
        label: FILE_VIEW_LABELS[id] ?? id,
        badge: id === 'drive-mapping' ? undefined : this.segmentBadge(id),
      }));
  });

  moreBadgeTotal = computed(() =>
    this.moreSegments().reduce((s, seg) => s + (seg.badge ?? 0), 0),
  );

  isActiveJob(): boolean {
    return !['Closed', 'Archive'].includes(this.project.status ?? '');
  }

  onMoreSelect(view: FileView): void {
    this.moreOpen.set(false);
    if (view === 'drive-mapping') {
      this.utilitySelect.emit('drive-mapping');
    } else {
      this.fileViewChange.emit(view);
    }
  }
}
