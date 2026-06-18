import { Component, ChangeDetectionStrategy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { DataService } from '@core/services/data.service';
import { EmployeeDirectoryService } from '@features/labor/services/employee-directory.service';
import { Employee } from '@app/models/types';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { EmptyStateComponent } from '@app/components/ui/empty-state';
import { formatMoney } from '@features/projects/utils/project-profit.compute';
import { findEmployeeByName } from '@shared/utils/labor-cost.compute';

@Component({
  selector: 'app-employees-page',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-4 lg:p-6 w-full max-w-[1200px] mx-auto space-y-5">
      <app-page-header
        title="Employees"
        subtitle="Set hourly wages here. Master Time hours on each job are multiplied by these rates to calculate labor cost." />

      <div class="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div class="bg-white p-4 rounded-xl border border-slate-200">
          <p class="text-[10px] font-bold uppercase text-slate-500 mb-1">On roster</p>
          <p class="text-2xl font-bold text-slate-900">{{ employees().length }}</p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200">
          <p class="text-[10px] font-bold uppercase text-slate-500 mb-1">In Master Time</p>
          <p class="text-2xl font-bold text-slate-900">{{ masterTimeNames().length }}</p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200" [class.border-amber-200]="missingPay().length">
          <p class="text-[10px] font-bold uppercase text-amber-700 mb-1">Need wage</p>
          <p class="text-2xl font-bold" [class.text-amber-800]="missingPay().length">{{ missingPay().length }}</p>
        </div>
      </div>

      @if (missingPay().length) {
        <section class="bg-amber-50 rounded-xl border border-amber-200 overflow-hidden">
          <div class="px-5 py-3 border-b border-amber-100">
            <h2 class="text-sm font-bold text-amber-900">Master Time — missing wage</h2>
            <p class="text-xs text-amber-800">These names appear in Master Time but don't have a pay rate yet. Labor cost won't calculate until you set one.</p>
          </div>
          <div class="divide-y divide-amber-100">
            @for (name of missingPay(); track name) {
              <div class="px-5 py-3 flex flex-wrap items-center gap-3">
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-slate-900">{{ name }}</p>
                  <p class="text-xs text-slate-600">{{ masterTimeHours(name).toFixed(1) }} hrs in Master Time</p>
                </div>
                @if (quickPayName() === name) {
                  <input type="number" [(ngModel)]="quickPayValue" placeholder="$/hr" class="w-28 border rounded-lg px-3 py-2 text-sm" />
                  <button type="button" (click)="saveQuickPay(name)" [disabled]="saving()"
                          class="bg-slate-900 text-white px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
                    Save
                  </button>
                  <button type="button" (click)="quickPayName.set(null)" class="text-sm text-slate-500">Cancel</button>
                } @else {
                  <button type="button" (click)="startQuickPay(name)"
                          class="text-xs font-semibold bg-white border border-amber-200 text-amber-900 px-3 py-1.5 rounded-lg">
                    Set wage
                  </button>
                }
              </div>
            }
          </div>
        </section>
      }

      @if (saveError()) {
        <p class="px-4 py-3 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl">{{ saveError() }}</p>
      }

      <section class="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div class="px-5 py-3 border-b flex flex-wrap justify-between items-center gap-2">
          <div>
            <h2 class="text-sm font-bold">Employee roster</h2>
            <p class="text-xs text-slate-500">Reg × wage + OT × 1.5 × wage + DT × 2 × wage</p>
          </div>
          <button type="button" (click)="toggleAddForm()"
                  class="text-xs font-semibold bg-slate-900 text-white px-3 py-1.5 rounded-lg">
            {{ showAddForm() ? 'Cancel' : 'Add Employee' }}
          </button>
        </div>
        @if (showAddForm()) {
          <div class="p-4 border-b bg-slate-50 grid sm:grid-cols-3 gap-3">
            <input [(ngModel)]="addDraft.name" placeholder="Employee name *" class="border rounded-lg px-3 py-2 text-sm" />
            <input type="number" [(ngModel)]="addDraft.payPerHour" placeholder="Wage per hour ($) *" class="border rounded-lg px-3 py-2 text-sm" />
            <button type="button" (click)="saveNewEmployee()" [disabled]="saving()"
                    class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
              {{ saving() ? 'Saving…' : 'Save' }}
            </button>
          </div>
        }
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-[10px] uppercase text-slate-500">
            <tr>
              <th class="px-4 py-2 text-left">Name</th>
              <th class="px-4 py-2 text-right">Wage / hr</th>
              <th class="px-4 py-2 text-right">Master Time hrs</th>
              <th class="px-4 py-2 text-left">Source</th>
            </tr>
          </thead>
          <tbody>
            @for (emp of sortedEmployees(); track emp.id) {
              <tr class="border-t border-slate-100">
                <td class="px-4 py-2 font-semibold">{{ emp.name }}</td>
                <td class="px-4 py-2 text-right">
                  @if (editingId() === emp.id) {
                    <div class="flex items-center justify-end gap-2">
                      <input type="number" [(ngModel)]="editPayValue" class="w-28 border rounded px-2 py-1 text-sm text-right" />
                      <button type="button" (click)="saveEditPay(emp)" class="text-xs font-semibold text-indigo-700">Save</button>
                      <button type="button" (click)="editingId.set(null)" class="text-xs text-slate-500">Cancel</button>
                    </div>
                  } @else {
                    <button type="button" (click)="startEditPay(emp)" class="font-mono hover:text-indigo-700">
                      @if (emp.payPerHour) {
                        {{ fmt(emp.payPerHour) }}/hr
                      } @else {
                        <span class="text-amber-700">Set wage</span>
                      }
                    </button>
                  }
                </td>
                <td class="px-4 py-2 text-right font-mono">
                  @if (masterTimeHours(emp.name) > 0) {
                    {{ masterTimeHours(emp.name).toFixed(1) }}
                  } @else {
                    <span class="text-slate-400">—</span>
                  }
                </td>
                <td class="px-4 py-2 text-xs text-slate-500">
                  {{ emp.source === 'sheet' ? 'Master Time sheet' : 'Manual' }}
                  @if (!emp.payPerHour && inMasterTime(emp)) {
                    <span class="text-amber-700"> · needs wage</span>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="4" class="p-6">
                  <app-empty-state
                    title="No employees yet"
                    message="Add employees and wages, or set wages for names that appear in Master Time above." />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </section>
    </div>
  `,
})
export class EmployeesPage {
  private data = inject(DataService);
  private employeeSvc = inject(EmployeeDirectoryService);

  employees = toSignal(this.data.getEmployees(), { initialValue: [] as Employee[] });
  showAddForm = signal(false);
  saving = signal(false);
  saveError = signal<string | null>(null);
  editingId = signal<string | null>(null);
  quickPayName = signal<string | null>(null);
  editPayValue: number | null = null;
  quickPayValue: number | null = null;
  addDraft = { name: '', payPerHour: null as number | null };

  masterTimeNames = computed(() => this.employeeSvc.masterTimeEmployeeNames());

  missingPay = computed(() => this.employeeSvc.namesMissingPayRate());

  sortedEmployees = computed(() =>
    [...this.employees()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
  );

  fmt = formatMoney;

  masterTimeHours(name: string): number {
    return this.employeeSvc.masterTimeHoursForName(name);
  }

  inMasterTime(emp: Employee): boolean {
    return this.employeeSvc.isReferencedInMasterTime(emp);
  }

  toggleAddForm(): void {
    this.saveError.set(null);
    this.showAddForm.update(v => !v);
  }

  startEditPay(emp: Employee): void {
    this.editingId.set(emp.id);
    this.editPayValue = emp.payPerHour ?? null;
  }

  startQuickPay(name: string): void {
    this.saveError.set(null);
    this.quickPayName.set(name);
    const existing = findEmployeeByName(this.employees(), name);
    this.quickPayValue = existing?.payPerHour ?? null;
  }

  async saveNewEmployee(): Promise<void> {
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await this.employeeSvc.createEmployee(this.addDraft.name, this.addDraft.payPerHour ?? 0);
      this.addDraft = { name: '', payPerHour: null };
      this.showAddForm.set(false);
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Could not save employee.');
    } finally {
      this.saving.set(false);
    }
  }

  async saveEditPay(emp: Employee): Promise<void> {
    this.saveError.set(null);
    try {
      await this.employeeSvc.updateEmployeePay(emp, this.editPayValue ?? 0);
      this.editingId.set(null);
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Could not update wage.');
    }
  }

  async saveQuickPay(name: string): Promise<void> {
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await this.employeeSvc.setPayForMasterTimeName(name, this.quickPayValue ?? 0);
      this.quickPayName.set(null);
      this.quickPayValue = null;
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Could not save wage.');
    } finally {
      this.saving.set(false);
    }
  }
}
