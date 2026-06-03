import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { HubLink } from '@app/config/global-nav.config';

@Component({
  selector: 'app-nav-hub-card',
  standalone: true,
  imports: [RouterLink, MatIconModule],
  template: `
    <a [routerLink]="link.route"
       [queryParams]="link.queryParams"
       class="group block bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:border-slate-300 hover:shadow-md transition-all">
      <div class="flex items-start gap-4">
        <div class="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 group-hover:bg-slate-900 group-hover:text-white transition-colors">
          <mat-icon class="!text-[20px]">{{ link.icon }}</mat-icon>
        </div>
        <div class="min-w-0">
          <h2 class="text-sm font-bold text-slate-900">{{ link.title }}</h2>
          <p class="text-sm text-slate-500 mt-1 leading-relaxed">{{ link.description }}</p>
        </div>
        <mat-icon class="!text-[18px] text-slate-300 group-hover:text-slate-500 shrink-0 mt-0.5">chevron_right</mat-icon>
      </div>
    </a>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavHubCardComponent {
  @Input({ required: true }) link!: HubLink;
}
