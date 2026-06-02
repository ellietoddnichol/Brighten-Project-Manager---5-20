import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  PROJECT_SETUP_DEFAULTS,
  SETUP_NON_BLOCKERS,
  SETUP_REQUIRED_FIELDS,
} from '../config/project-setup-defaults.config';

@Component({
  selector: 'app-settings-setup-defaults',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section id="setup-defaults" class="space-y-6">
      <div>
        <h2 class="text-xl font-bold text-slate-900">Project Setup Defaults</h2>
        <p class="text-sm text-slate-500 mt-1 max-w-3xl">
          App rules for what counts as a complete job record. Job setup lives in the app — not in repeated bulk imports.
        </p>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <article class="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 class="text-sm font-bold text-slate-900 mb-3">Required field rules</h3>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between gap-4 py-1 border-b border-slate-50">
              <dt class="text-slate-600">PM required</dt>
              <dd class="font-semibold">{{ defaults.pmRequired ? 'Yes' : 'No' }}</dd>
            </div>
            <div class="flex justify-between gap-4 py-1 border-b border-slate-50">
              <dt class="text-slate-600">Start date required</dt>
              <dd class="font-semibold">{{ defaults.startDateRequired ? 'Yes' : 'No — derived automatically' }}</dd>
            </div>
            <div class="flex justify-between gap-4 py-1 border-b border-slate-50">
              <dt class="text-slate-600">Target end required</dt>
              <dd class="font-semibold">{{ defaults.targetEndRequired ? 'Yes' : 'No — optional' }}</dd>
            </div>
            <div class="flex justify-between gap-4 py-1 border-b border-slate-50">
              <dt class="text-slate-600">Wage order blocks setup</dt>
              <dd class="font-semibold">{{ defaults.wageOrderBlocksSetup ? 'Yes' : 'No — future compliance' }}</dd>
            </div>
            <div class="flex justify-between gap-4 py-1 border-b border-slate-50">
              <dt class="text-slate-600">Budget required for setup</dt>
              <dd class="font-semibold">{{ defaults.budgetRequiredForSetup ? 'Yes' : 'No' }}</dd>
            </div>
            <div class="flex justify-between gap-4 py-1">
              <dt class="text-slate-600">Billing/SOV before start</dt>
              <dd class="font-semibold">{{ defaults.billingRequiredBeforeStart ? 'Yes' : 'No — Not started is valid' }}</dd>
            </div>
          </dl>
        </article>

        <article class="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 class="text-sm font-bold text-slate-900 mb-3">Prevailing wage & CPR</h3>
          <ul class="text-sm text-slate-600 space-y-2">
            <li>Prevailing Wage <strong>Yes</strong> → CPR Required <strong>Yes</strong> (automatic)</li>
            <li>Prevailing Wage <strong>No</strong> → CPR Required <strong>No</strong></li>
            <li>Non-PW wage order: {{ defaults.nonPwWageOrderRequired ? 'Required' : 'Not required' }}</li>
          </ul>
        </article>

        <article class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 lg:col-span-2">
          <h3 class="text-sm font-bold text-slate-900 mb-3">Default foreman rules</h3>
          <table class="w-full text-sm">
            <thead class="text-left text-[10px] uppercase text-slate-500 border-b">
              <tr>
                <th class="py-2 pr-4">Match</th>
                <th class="py-2 pr-4">Foreman</th>
                <th class="py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              @for (rule of defaults.foremanDefaults; track rule.match) {
                <tr class="border-b border-slate-50">
                  <td class="py-2 pr-4 font-medium">{{ rule.match }}</td>
                  <td class="py-2 pr-4">{{ rule.foreman }}</td>
                  <td class="py-2 text-slate-500">{{ rule.note }}</td>
                </tr>
              }
            </tbody>
          </table>
        </article>

        <article class="bg-white rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
          <h3 class="text-sm font-bold text-emerald-900 mb-2">Complete enough when present</h3>
          <ul class="text-sm text-emerald-900/90 space-y-1 list-disc list-inside">
            @for (field of requiredFields; track field) {
              <li>{{ field }}</li>
            }
          </ul>
        </article>

        <article class="bg-white rounded-xl border border-slate-200 p-5">
          <h3 class="text-sm font-bold text-slate-900 mb-2">Not setup blockers</h3>
          <ul class="text-sm text-slate-600 space-y-1 list-disc list-inside">
            @for (field of nonBlockers; track field) {
              <li>{{ field }}</li>
            }
          </ul>
        </article>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsSetupDefaultsComponent {
  readonly defaults = PROJECT_SETUP_DEFAULTS;
  readonly requiredFields = SETUP_REQUIRED_FIELDS;
  readonly nonBlockers = SETUP_NON_BLOCKERS;
}
