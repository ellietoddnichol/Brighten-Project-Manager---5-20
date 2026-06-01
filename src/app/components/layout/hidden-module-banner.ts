import { Component, Input, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GlobalModuleId } from '../../models/global-enabled-modules.types';
import { GlobalNeedsService } from '../../services/global-needs.service';
import { globalModuleHiddenMessage } from '../../utils/global-enabled-modules.compute';

@Component({
  selector: 'app-hidden-module-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (hidden()) {
      <div class="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {{ message }}
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HiddenModuleBannerComponent {
  @Input({ required: true }) moduleId!: GlobalModuleId;

  private globalNeeds = inject(GlobalNeedsService);

  hidden = computed(() => !this.globalNeeds.isModuleVisible(this.moduleId));
  readonly message = globalModuleHiddenMessage('rfis');
}
