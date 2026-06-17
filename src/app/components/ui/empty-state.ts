import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';

import { CommonModule } from '@angular/common';



@Component({

  selector: 'app-empty-state',

  standalone: true,

  imports: [CommonModule],

  template: `

    <div class="flex flex-col items-center justify-center py-16 text-center">

      <span class="material-icons !text-[22px] text-slate-300 mb-3">{{ icon }}</span>

      <p class="text-sm font-semibold text-slate-500 mb-1">{{ title }}</p>

      @if (message) {

        <p class="text-xs text-slate-400">{{ message }}</p>

      }

      @if (actionLabel) {

        <button type="button" (click)="actionClick.emit()"

                class="mt-3 text-sm font-semibold text-indigo-700 hover:underline">

          {{ actionLabel }}

        </button>

      }

    </div>

  `,

  changeDetection: ChangeDetectionStrategy.OnPush,

})

export class EmptyStateComponent {

  @Input() icon = 'inbox';

  @Input({ required: true }) title!: string;

  @Input() message?: string;

  @Input() actionLabel?: string;

  @Output() actionClick = new EventEmitter<void>();

}

