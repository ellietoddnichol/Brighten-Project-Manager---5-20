import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 tracking-tight">{{ title }}</h1>
        @if (subtitle) {
          <p class="text-slate-500 text-sm mt-1">{{ subtitle }}</p>
        }
      </div>
      <div class="flex flex-wrap items-center gap-2">
        @if (primaryActionLabel) {
          <button type="button" (click)="primaryAction.emit()"
                  class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">
            {{ primaryActionLabel }}
          </button>
        }
        <ng-content />
      </div>
    </header>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeaderComponent {
  @Input({ required: true }) title!: string;
  @Input() subtitle?: string;
  @Input() primaryActionLabel?: string;
  /** @deprecated Actions slot is always available; kept for existing page templates */
  @Input() hasActions = false;
  @Output() primaryAction = new EventEmitter<void>();
}
