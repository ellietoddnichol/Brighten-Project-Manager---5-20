import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';

import { CommonModule } from '@angular/common';

import { RouterModule } from '@angular/router';

import {

  FEATURE_SETUP_MATRIX,

  FeatureSetupStatus,

  isWorkCompAuditEnabled,

  setWorkCompAuditEnabled,

} from '@app/config/feature-setup.config';

import { GlobalNeedsService } from '@core/services/global-needs.service';

import { StatusChipComponent } from '@app/components/ui/status-chip';



@Component({

  selector: 'app-settings-feature-setup',

  standalone: true,

  imports: [CommonModule, RouterModule, StatusChipComponent],

  template: `

    <section id="feature-setup" class="space-y-4">

      <div>

        <h3 class="text-sm font-bold text-slate-900 mb-1">Feature flags</h3>

        <p class="text-xs text-slate-500">

          Toggle optional tools and rollout flags. Hidden features remain available via routes and Show all tools.

        </p>

      </div>



      <div class="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100">

        <div class="px-5 py-4 flex flex-wrap items-center justify-between gap-4">

          <div class="min-w-0 flex-1">

            <p class="text-sm font-semibold text-slate-900">Show all tools</p>

            <p class="text-xs text-slate-500 mt-0.5">Reveal hidden modules in navigation and project tabs.</p>

          </div>

          <button type="button" role="switch" [attr.aria-checked]="showAllTools()"

                  (click)="toggleShowAllTools(!showAllTools())"

                  class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300"

                  [class.bg-slate-900]="showAllTools()"

                  [class.bg-slate-200]="!showAllTools()">

            <span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition"

                  [class.translate-x-5]="showAllTools()"

                  [class.translate-x-0]="!showAllTools()"></span>

          </button>

        </div>



        <div class="px-5 py-4 flex flex-wrap items-center justify-between gap-4">

          <div class="min-w-0 flex-1">

            <p class="text-sm font-semibold text-slate-900">Work Comp audit mode</p>

            <p class="text-xs text-slate-500 mt-0.5">Shows Work Comp CSV export on Labor pages.</p>

          </div>

          <button type="button" role="switch" [attr.aria-checked]="workCompAudit()"

                  (click)="toggleWorkComp(!workCompAudit())"

                  class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300"

                  [class.bg-slate-900]="workCompAudit()"

                  [class.bg-slate-200]="!workCompAudit()">

            <span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition"

                  [class.translate-x-5]="workCompAudit()"

                  [class.translate-x-0]="!workCompAudit()"></span>

          </button>

        </div>

      </div>



      @for (group of groups; track group.status) {

        <div>

          <h4 class="text-xs font-bold uppercase tracking-widest mb-3" [class]="group.tone">{{ group.label }}</h4>

          <div class="space-y-2">

            @for (entry of group.entries; track entry.id) {

              <div class="flex flex-wrap items-start justify-between gap-3 bg-slate-50 rounded-xl border border-slate-200 px-5 py-4">

                <div class="min-w-0 flex-1">

                  <div class="flex flex-wrap items-center gap-2">

                    <p class="text-sm font-semibold text-slate-900">{{ entry.label }}</p>

                    <app-status-chip [tone]="statusChipTone(entry.status)" [label]="entry.status" />

                  </div>

                  <p class="text-xs text-slate-500 mt-1">{{ entry.description }}</p>

                </div>

                @if (entry.route) {

                  <a [routerLink]="entry.route" [fragment]="entry.fragment"

                     class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors shrink-0">

                    Open

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

  private globalNeeds = inject(GlobalNeedsService);



  workCompAudit = signal(isWorkCompAuditEnabled());

  showAllTools = this.globalNeeds.showAllTools;



  readonly groups = STATUS_GROUPS.map(group => ({

    ...group,

    entries: FEATURE_SETUP_MATRIX.filter(e => e.status === group.status),

  }));



  toggleWorkComp(value: boolean): void {

    setWorkCompAuditEnabled(value);

    this.workCompAudit.set(value);

  }



  toggleShowAllTools(value: boolean): void {

    this.globalNeeds.setShowAllTools(value);

  }



  statusChipTone(status: FeatureSetupStatus): 'green' | 'amber' | 'slate' | 'orange' | 'blue' {

    switch (status) {

      case 'Active': return 'green';

      case 'NeedsVerification': return 'amber';

      case 'NeedsMigration': return 'orange';

      case 'NextUp': return 'blue';

      default: return 'slate';

    }

  }

}



const STATUS_GROUPS: Array<{ status: FeatureSetupStatus; label: string; tone: string }> = [

  { status: 'Active', label: 'Active', tone: 'text-emerald-700' },

  { status: 'NeedsVerification', label: 'Needs Verification', tone: 'text-amber-700' },

  { status: 'HiddenForNow', label: 'Hidden For Now', tone: 'text-slate-500' },

  { status: 'NeedsMigration', label: 'Needs Migration', tone: 'text-orange-700' },

  { status: 'NextUp', label: 'Next Up', tone: 'text-indigo-700' },

];

