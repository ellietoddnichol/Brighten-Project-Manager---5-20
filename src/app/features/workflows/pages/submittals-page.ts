import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { HiddenModuleBannerComponent } from '@app/components/layout/hidden-module-banner';
import { DataService } from '@core/services/data.service';
import { resolveProjectLabel } from '@shared/utils/project';

@Component({
  selector: 'app-submittals',
  standalone: true,
  imports: [CommonModule, RouterModule, PageHeaderComponent, HiddenModuleBannerComponent],
  template: `
    <div class="p-4 lg:p-6 w-full max-w-[1440px] mx-auto">
      <app-hidden-module-banner moduleId="submittals" />
      <app-page-header title="Submittals" subtitle="Submittal log and approval status across projects." />
      <div class="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
        <table class="w-full text-sm">
          <thead><tr class="text-[10px] uppercase text-slate-400 border-b">
            <th class="px-5 py-3 text-left">#</th><th class="px-5 py-3 text-left">Project</th>
            <th class="px-5 py-3 text-left">Description</th><th class="px-5 py-3 text-left">Status</th><th class="px-5 py-3 text-left">Due</th>
          </tr></thead>
          <tbody class="divide-y divide-slate-100">
            @for (s of submittals(); track s.id) {
              <tr class="hover:bg-slate-50">
                <td class="px-5 py-3"><a [routerLink]="['/projects', s.projectId]" [queryParams]="{ tab: 'submittals' }" class="text-blue-600 font-medium">{{ s.submittalNumber || '—' }}</a></td>
                <td class="px-5 py-3">{{ projectLabel(s.projectId) }}</td>
                <td class="px-5 py-3">{{ s.description || '—' }}</td>
                <td class="px-5 py-3">{{ s.status }}</td>
                <td class="px-5 py-3">{{ s.dueDate || '—' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="px-5 py-12 text-center text-slate-400 italic">No submittals yet</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Submittals {
  private data = inject(DataService);
  projects = toSignal(this.data.getProjects(), { initialValue: [] });
  submittals = toSignal(this.data.getSubmittals(), { initialValue: [] });

  projectLabel(projectId: string): string {
    return resolveProjectLabel(this.projects(), { projectId });
  }
}
