import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  FEATURE_SETUP_MATRIX,
  FeatureSetupStatus,
  isWorkCompAuditEnabled,
  setWorkCompAuditEnabled,
} from '@app/config/feature-setup.config';

@Component({
  selector: 'app-settings-feature-setup',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <section id="feature-setup" class="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm mb-6">
      <h2 class="text-xl font-bold mb-1">Feature Setup Matrix</h2>
      <p class="text-sm text-slate-500 mb-6">
        Rollout status for optional tools. Hidden features remain available via routes and Show all tools.
      </p>

      @for (group of groups; track group.status) {
        <div class="mb-6">
          <h3 class="text-xs font-bold uppercase tracking-widest mb-3" [class]="group.tone">{{ group.label }}</h3>
          <div class="space-y-2">
            @for (entry of group.entries; track entry.id) {
              <div class="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
                <div>
                  <p class="font-semibold text-slate-900">{{ entry.label }}</p>
                  <p class="text-sm text-slate-500">{{ entry.description }}</p>
                  @if (entry.id === 'work-comp-audit') {
                    <label class="mt-2 flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" [checked]="workCompAudit()" (change)="toggleWorkComp($any($event.target).checked)" />
                      Enable audit mode (shows Work Comp CSV export on Labor pages)
                    </label>
                  }
                </div>
                @if (entry.route) {
                  <a [routerLink]="entry.route" [fragment]="entry.fragment"
                     class="text-sm font-semibold text-indigo-700 hover:text-indigo-900 shrink-0">
                    Open →
                  </a>
                }
              </div>
            }
          </div>
        </div>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsFeatureSetupComponent {
  workCompAudit = signal(isWorkCompAuditEnabled());

  readonly groups = STATUS_GROUPS.map(group => ({
    ...group,
    entries: FEATURE_SETUP_MATRIX.filter(e => e.status === group.status),
  }));

  toggleWorkComp(value: boolean): void {
    setWorkCompAuditEnabled(value);
    this.workCompAudit.set(value);
  }
}

const STATUS_GROUPS: Array<{ status: FeatureSetupStatus; label: string; tone: string }> = [
  { status: 'Active', label: 'Active', tone: 'text-emerald-700' },
  { status: 'NeedsVerification', label: 'Needs Verification', tone: 'text-amber-700' },
  { status: 'HiddenForNow', label: 'Hidden For Now', tone: 'text-slate-500' },
  { status: 'NeedsMigration', label: 'Needs Migration', tone: 'text-orange-700' },
  { status: 'NextUp', label: 'Next Up', tone: 'text-indigo-700' },
];
