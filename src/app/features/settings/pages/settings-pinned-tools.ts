import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { GlobalNeedsService } from '@core/services/global-needs.service';
import { GlobalModuleId } from '@app/models/global-enabled-modules.types';
import {
  DEFAULT_PINNED_TOOLS,
  PINNABLE_TOOL_GROUPS,
} from '@shared/utils/global-pinned-tools';
import { globalNavLabel } from '@shared/utils/global-enabled-modules.compute';

@Component({
  selector: 'app-settings-pinned-tools',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <section id="pinned-tools" class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mb-6">
      <div class="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h2 class="text-xl font-bold mb-1">Navigation / Pinned Tools</h2>
          <p class="text-sm text-slate-500">
            Pinned tools stay visible in the sidebar even when there are no active items.
          </p>
        </div>
        <button type="button" (click)="resetDefaults()"
                class="text-sm font-semibold text-indigo-700 hover:text-indigo-900 underline">
          Reset to defaults
        </button>
      </div>

      <div class="space-y-6">
        @for (group of toolGroups; track group.label) {
          <div>
            <h3 class="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">{{ group.label }}</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              @for (id of group.toolIds; track id) {
                <label class="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <button type="button"
                          (click)="toggle(id); $event.preventDefault()"
                          class="shrink-0 text-slate-400 hover:text-amber-500"
                          [class.text-amber-500]="isPinned(id)"
                          [attr.aria-label]="isPinned(id) ? 'Unpin ' + label(id) : 'Pin ' + label(id)">
                    <mat-icon class="!text-[20px]">{{ isPinned(id) ? 'push_pin' : 'push_pin_outlined' }}</mat-icon>
                  </button>
                  <span class="text-sm font-medium text-slate-800 flex-1">{{ label(id) }}</span>
                  <input type="checkbox"
                         class="rounded border-slate-300"
                         [checked]="isPinned(id)"
                         (change)="setPin(id, $any($event.target).checked)" />
                </label>
              }
            </div>
          </div>
        }
      </div>

      <p class="text-xs text-slate-400 mt-4">
        Defaults: {{ defaultLabels }}
      </p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPinnedToolsComponent {
  private globalNeeds = inject(GlobalNeedsService);

  readonly toolGroups = PINNABLE_TOOL_GROUPS;
  readonly defaultLabels = DEFAULT_PINNED_TOOLS.map(id => globalNavLabel(id)).join(', ');

  label(id: GlobalModuleId): string {
    return globalNavLabel(id);
  }

  isPinned(id: GlobalModuleId): boolean {
    return this.globalNeeds.isPinned(id);
  }

  toggle(id: GlobalModuleId): void {
    this.globalNeeds.togglePin(id);
  }

  setPin(id: GlobalModuleId, pinned: boolean): void {
    this.globalNeeds.setPin(id, pinned);
  }

  resetDefaults(): void {
    this.globalNeeds.resetPinnedTools();
  }
}
