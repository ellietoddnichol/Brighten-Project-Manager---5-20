import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-4 py-6 text-center">
      <p class="text-sm font-medium text-slate-700">{{ title }}</p>
      @if (message) {
        <p class="text-xs text-slate-500 mt-1.5 max-w-md mx-auto">{{ message }}</p>
      }
      @if (actionLabel) {
        <button type="button" (click)="actionClick.emit()"
                class="mt-3 text-sm font-bold text-indigo-700 underline">
          {{ actionLabel }}
        </button>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  @Input({ required: true }) title!: string;
  @Input() message?: string;
  @Input() actionLabel?: string;
  @Output() actionClick = new EventEmitter<void>();
}
