import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

interface ShortcutGroup {
  name: string;
  shortcuts: { action: string; key: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    name: 'Navigation',
    shortcuts: [
      { action: 'Open command palette', key: '⌘K' },
      { action: 'Show this help', key: '?' },
    ],
  },
  {
    name: 'Projects',
    shortcuts: [
      { action: 'Focus search (on project list page)', key: '/' },
      { action: 'Clear search / close panel', key: 'Esc' },
    ],
  },
  {
    name: 'Data',
    shortcuts: [
      { action: 'Refresh / recalculate (on WIP page)', key: 'R' },
    ],
  },
];

@Component({
  selector: 'app-keyboard-shortcuts-modal',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open) {
      <div
        class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        (click)="onOverlayClick($event)"
      >
        <div
          class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          (click)="$event.stopPropagation()"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 class="text-sm font-semibold text-slate-900">Keyboard Shortcuts</h2>
            <button
              type="button"
              class="text-slate-400 hover:text-slate-600 transition-colors"
              (click)="close.emit()"
            >
              <mat-icon class="!text-[18px]">close</mat-icon>
            </button>
          </div>

          <!-- Shortcut groups -->
          <div class="p-5 space-y-5">
            @for (group of groups; track group.name) {
              <div>
                <div class="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  {{ group.name }}
                </div>
                <div class="space-y-1">
                  @for (shortcut of group.shortcuts; track shortcut.key) {
                    <div class="flex items-center justify-between py-1">
                      <span class="text-sm text-slate-700">{{ shortcut.action }}</span>
                      <kbd class="inline-flex items-center px-2 py-0.5 rounded border border-slate-300 bg-slate-100 text-xs font-mono text-slate-700 shadow-sm">
                        {{ shortcut.key }}
                      </kbd>
                    </div>
                  }
                </div>
              </div>
            }
          </div>

          <!-- Footer -->
          <div class="px-5 py-3 border-t border-slate-100 flex justify-end">
            <span class="text-[10px] text-slate-400 font-mono">press <kbd class="inline-flex items-center px-1.5 py-0.5 rounded border border-slate-300 bg-slate-100 text-xs font-mono text-slate-700 shadow-sm">Esc</kbd> to close</span>
          </div>
        </div>
      </div>
    }
  `,
})
export class KeyboardShortcutsModalComponent {
  @Input() open = false;
  @Output() close = new EventEmitter<void>();

  readonly groups = SHORTCUT_GROUPS;

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }
}
