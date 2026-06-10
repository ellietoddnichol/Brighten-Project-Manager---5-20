import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-detail-drawer',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <!-- Overlay -->
    <div class="fixed inset-0 z-40 bg-black/30 transition-opacity duration-200"
         [class.opacity-0]="!open"
         [class.pointer-events-none]="!open"
         [class.opacity-100]="open"
         (click)="close.emit()"></div>
    <!-- Drawer panel -->
    <aside class="fixed top-0 right-0 bottom-0 z-50 w-[400px] bg-white shadow-2xl flex flex-col transition-transform duration-200"
           [class.translate-x-full]="!open"
           [class.translate-x-0]="open"
           style="overflow-y: auto;">
      <div class="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-start justify-between gap-3 shrink-0">
        <div class="min-w-0">
          <h2 class="text-base font-bold text-slate-900 truncate">{{ title }}</h2>
          @if (subtitle) {
            <p class="text-sm text-slate-500 truncate">{{ subtitle }}</p>
          }
        </div>
        <button type="button" (click)="close.emit()" class="text-slate-400 hover:text-slate-600 shrink-0 text-lg leading-none px-1">
          ×
        </button>
      </div>
      <div class="flex-1 p-5 space-y-4 overflow-y-auto">
        <ng-content />
      </div>
      @if (footerActionLabel) {
        <div class="sticky bottom-0 border-t border-slate-200 bg-white p-4 shrink-0">
          <button type="button" (click)="footerAction.emit()"
                  class="w-full bg-slate-900 text-white py-2.5 rounded-lg text-sm font-semibold">
            {{ footerActionLabel }}
          </button>
        </div>
      }
    </aside>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailDrawerComponent {
  @Input({ required: true }) open = false;
  @Input({ required: true }) title!: string;
  @Input() subtitle?: string;
  @Input() footerActionLabel?: string;
  @Output() close = new EventEmitter<void>();
  @Output() footerAction = new EventEmitter<void>();
}

@Component({
  selector: 'app-drawer-section',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section>
      <h3 class="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">{{ title }}</h3>
      <div class="space-y-2 text-sm">
        <ng-content />
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DrawerSectionComponent {
  @Input({ required: true }) title!: string;
}

@Component({
  selector: 'app-drawer-field',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex justify-between gap-4 py-1.5 border-b border-slate-50 last:border-0">
      <span class="text-slate-500 shrink-0">{{ label }}</span>
      <span class="font-medium text-right" [class.font-mono]="mono" [class.text-rose-700]="alert">{{ value }}</span>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DrawerFieldComponent {
  @Input({ required: true }) label!: string;
  @Input({ required: true }) value!: string;
  @Input() mono = false;
  @Input() alert = false;
}
