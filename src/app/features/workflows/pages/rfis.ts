import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { HiddenModuleBannerComponent } from '@app/components/layout/hidden-module-banner';
import { DataService } from '@core/services/data.service';
import { resolveProjectLabel } from '@shared/utils/project';

@Component({
  selector: 'app-rfis',
  standalone: true,
  imports: [CommonModule, RouterModule, PageHeaderComponent, HiddenModuleBannerComponent],
  template: `
    <div class="p-4 lg:p-6 w-full max-w-[1440px] mx-auto">
      <app-hidden-module-banner moduleId="rfis" />
      <app-page-header title="RFIs" subtitle="Requests for information across all projects." />
      <div class="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
        <table class="w-full text-sm">
          <thead><tr class="text-[10px] uppercase text-slate-400 border-b">
            <th class="px-5 py-3 text-left">RFI #</th><th class="px-5 py-3 text-left">Project</th>
            <th class="px-5 py-3 text-left">Question</th><th class="px-5 py-3 text-left">Status</th><th class="px-5 py-3 text-left">Needed By</th>
          </tr></thead>
          <tbody class="divide-y divide-slate-100">
            @for (rfi of rfis(); track rfi.id) {
              <tr class="hover:bg-slate-50">
                <td class="px-5 py-3"><a [routerLink]="['/projects', rfi.projectId]" [queryParams]="{ tab: 'rfis' }" class="text-blue-600 font-medium">{{ rfi.rfiNumber || '—' }}</a></td>
                <td class="px-5 py-3">{{ projectLabel(rfi.projectId) }}</td>
                <td class="px-5 py-3 max-w-md truncate">{{ rfi.question || '—' }}</td>
                <td class="px-5 py-3">{{ rfi.status }}</td>
                <td class="px-5 py-3">{{ rfi.neededByDate || '—' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="px-5 py-12 text-center text-slate-400 italic">No RFIs yet</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Rfis {
  private data = inject(DataService);
  projects = toSignal(this.data.getProjects(), { initialValue: [] });
  rfis = toSignal(this.data.getRfis(), { initialValue: [] });

  projectLabel(projectId: string): string {
    return resolveProjectLabel(this.projects(), { projectId });
  }
}
