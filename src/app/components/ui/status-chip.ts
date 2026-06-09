import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export type StatusTone = 'blue' | 'green' | 'amber' | 'red' | 'slate' | 'violet' | 'orange';

@Component({
  selector: 'app-status-chip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="inline-flex items-center gap-1.5 text-xs font-medium"
          [ngClass]="textClass()">
      <span class="w-1.5 h-1.5 rounded-full shrink-0" [ngClass]="dotClass()"></span>
      <ng-content />
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusChipComponent {
  @Input({ required: true }) tone: StatusTone = 'slate';

  dotClass(): string {
    const map: Record<StatusTone, string> = {
      blue:   'bg-blue-500',
      green:  'bg-emerald-500',
      amber:  'bg-amber-400',
      red:    'bg-rose-500',
      slate:  'bg-slate-400',
      violet: 'bg-violet-500',
      orange: 'bg-orange-400',
    };
    return map[this.tone];
  }

  textClass(): string {
    const map: Record<StatusTone, string> = {
      blue:   'text-blue-700',
      green:  'text-emerald-700',
      amber:  'text-amber-700',
      red:    'text-rose-700',
      slate:  'text-slate-500',
      violet: 'text-violet-700',
      orange: 'text-orange-700',
    };
    return map[this.tone];
  }
}
