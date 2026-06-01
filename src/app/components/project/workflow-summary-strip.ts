import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkflowChip } from './project-detail.types';

@Component({
  selector: 'app-workflow-summary-strip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <p class="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Workflow Summary</p>
      <div class="flex flex-wrap gap-2">
        @for (chip of chips; track chip.id) {
          <button type="button" (click)="chipClick.emit(chip.id)"
                  class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors hover:bg-slate-50"
                  [class.border-slate-200]="chip.status === 'ok'"
                  [class.border-amber-200]="chip.status === 'attention'"
                  [class.bg-amber-50]="chip.status === 'attention'"
                  [class.border-red-200]="chip.status === 'alert'"
                  [class.bg-red-50]="chip.status === 'alert'">
            <span class="text-slate-700">{{ chip.label }}</span>
            <span class="font-bold text-slate-900">{{ chip.count }}</span>
            @if (chip.status !== 'ok') {
              <span class="w-1.5 h-1.5 rounded-full"
                    [class.bg-amber-500]="chip.status === 'attention'"
                    [class.bg-red-500]="chip.status === 'alert'"></span>
            }
          </button>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowSummaryStripComponent {
  @Input({ required: true }) chips: WorkflowChip[] = [];
  @Output() chipClick = new EventEmitter<string>();
}
