import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface CompactStat {
  label: string;
  value: string;
  alert?: boolean;
}

@Component({
  selector: 'app-compact-stat-strip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-wrap gap-x-6 gap-y-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm">
      @for (stat of stats; track stat.label) {
        <div class="flex items-baseline gap-2">
          <span class="text-[10px] font-bold uppercase text-slate-400">{{ stat.label }}</span>
          <span class="font-semibold font-mono" [class.text-rose-700]="stat.alert">{{ stat.value }}</span>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompactStatStripComponent {
  @Input({ required: true }) stats: CompactStat[] = [];
}
