import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export type StatusTone = 'blue' | 'green' | 'amber' | 'red' | 'slate' | 'violet' | 'orange';

@Component({
  selector: 'app-status-chip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border"
          [ngClass]="toneClass()">
      @if (label) {
        {{ label }}
      } @else {
        <ng-content />
      }
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusChipComponent {
  @Input({ required: true }) tone: StatusTone = 'slate';
  @Input() label?: string;

  toneClass(): Record<string, boolean> {
    const map: Record<StatusTone, string> = {
      blue:   'bg-blue-50 text-blue-700 border-blue-200',
      green:  'bg-emerald-50 text-emerald-700 border-emerald-200',
      amber:  'bg-amber-50 text-amber-700 border-amber-200',
      red:    'bg-rose-50 text-rose-700 border-rose-200',
      slate:  'bg-slate-100 text-slate-600 border-slate-200',
      violet: 'bg-violet-50 text-violet-700 border-violet-200',
      orange: 'bg-orange-50 text-orange-700 border-orange-200',
    };
    return { [map[this.tone]]: true };
  }
}
