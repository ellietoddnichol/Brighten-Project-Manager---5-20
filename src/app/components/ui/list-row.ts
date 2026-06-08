import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StatusChipComponent } from '@app/components/ui/status-chip';

export type HealthDot = 'Green' | 'Yellow' | 'Red' | 'Neutral';

@Component({
  selector: 'app-list-row',
  standalone: true,
  imports: [CommonModule, StatusChipComponent],
  template: `
    <button type="button"
            (click)="rowClick.emit()"
            class="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0">
      <div class="flex items-start gap-2.5">
        <span class="inline-block w-2 h-2 rounded-full mt-1.5 shrink-0"
              [class.bg-emerald-500]="health === 'Green'"
              [class.bg-amber-400]="health === 'Yellow'"
              [class.bg-rose-600]="health === 'Red'"
              [class.bg-slate-300]="health === 'Neutral'"></span>
        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-sm font-bold text-slate-900 truncate leading-tight">{{ title }}</p>
              @if (subtitle) {
                <p class="text-xs text-slate-500 truncate">{{ subtitle }}</p>
              }
            </div>
            @if (nextAction) {
              <span class="text-xs font-semibold text-indigo-700 shrink-0 max-w-[140px] truncate">{{ nextAction }}</span>
            }
          </div>
          @if (metrics.length) {
            <div class="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs">
              @for (m of metrics; track m.label) {
                <span>
                  <span class="text-slate-400">{{ m.label }}</span>
                  <span class="font-mono font-semibold ml-1" [class.text-rose-700]="m.alert">{{ m.value }}</span>
                </span>
              }
            </div>
          }
          @if (chips.length) {
            <div class="flex flex-wrap gap-1 mt-1.5">
              @for (chip of chips; track chip) {
                <app-status-chip tone="amber" [label]="chip" />
              }
            </div>
          }
        </div>
      </div>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListRowComponent {
  @Input({ required: true }) title!: string;
  @Input() subtitle?: string;
  @Input() health: HealthDot = 'Neutral';
  @Input() metrics: { label: string; value: string; alert?: boolean }[] = [];
  @Input() chips: string[] = [];
  @Input() nextAction?: string;
  @Output() rowClick = new EventEmitter<void>();
}
