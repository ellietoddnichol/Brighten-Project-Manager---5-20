import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-chart-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col">
      <div class="px-5 py-3 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
        <h3 class="text-sm font-bold text-slate-900">{{ title }}</h3>
        @if (subtitle) {
          <span class="text-xs text-slate-500">{{ subtitle }}</span>
        }
      </div>
      <div class="p-4 flex-1 min-h-[220px]">
        <ng-content />
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartCardComponent {
  @Input({ required: true }) title!: string;
  @Input() subtitle?: string;
}
