import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface SegmentOption<T extends string = string> {
  id: T;
  label: string;
  badge?: number;
}

@Component({
  selector: 'app-segmented-control',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="inline-flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg">
      @for (opt of options; track opt.id) {
        <button type="button"
                (click)="select.emit(opt.id)"
                class="px-3 py-1.5 rounded-md text-sm font-semibold transition-colors flex items-center gap-1.5"
                [class.bg-white]="value === opt.id"
                [class.text-slate-900]="value === opt.id"
                [class.shadow-sm]="value === opt.id"
                [class.text-slate-600]="value !== opt.id"
                [class.hover:text-slate-900]="value !== opt.id">
          {{ opt.label }}
          @if (opt.badge) {
            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white">{{ opt.badge }}</span>
          }
        </button>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SegmentedControlComponent<T extends string = string> {
  @Input({ required: true }) options: SegmentOption<T>[] = [];
  @Input({ required: true }) value!: T;
  @Output() select = new EventEmitter<T>();
}
