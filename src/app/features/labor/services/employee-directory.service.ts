import { Injectable, inject } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';
import { Employee, TimeEntry } from '@app/models/types';
import { DataService } from '@core/services/data.service';
import { findEmployeeByName } from '@shared/utils/labor-cost.compute';

@Injectable({ providedIn: 'root' })
export class EmployeeDirectoryService {
  private data = inject(DataService);

  employees(): Employee[] {
    return this.data.employeesSnapshot();
  }

  masterTimeEmployeeNames(): string[] {
    const names = new Set<string>();
    for (const entry of this.data.timeEntriesSnapshot()) {
      const name = (entry.employeeName ?? '').trim();
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }

  namesMissingPayRate(): string[] {
    const employees = this.employees();
    return this.masterTimeEmployeeNames().filter(name => {
      const emp = findEmployeeByName(employees, name);
      return !emp?.payPerHour;
    });
  }

  masterTimeHoursForName(name: string): number {
    const key = name.trim().toLowerCase();
    return this.data.timeEntriesSnapshot()
      .filter(e => (e.employeeName ?? '').trim().toLowerCase() === key)
      .reduce((s, e) => s + (e.totalHours ?? 0), 0);
  }

  isReferencedInMasterTime(employee: Employee): boolean {
    const key = (employee.name ?? '').trim().toLowerCase();
    if (!key) return false;
    return this.data.timeEntriesSnapshot()
      .some(e => (e.employeeName ?? '').trim().toLowerCase() === key);
  }

  async createEmployee(name: string, payPerHour: number): Promise<Employee> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Enter an employee name.');
    if (!payPerHour || payPerHour <= 0) throw new Error('Enter a wage per hour.');

    const existing = findEmployeeByName(this.employees(), trimmed);
    if (existing) {
      await this.data.upsertEmployee({ ...existing, payPerHour, source: existing.source ?? 'manual' });
      return { ...existing, payPerHour };
    }

    const id = uuidv4();
    const employee: Employee = { id, name: trimmed, payPerHour, source: 'manual', status: 'Active' };
    await this.data.upsertEmployee(employee);
    return employee;
  }

  async updateEmployeePay(employee: Employee, payPerHour: number): Promise<void> {
    if (!payPerHour || payPerHour <= 0) throw new Error('Enter a wage per hour.');
    await this.data.upsertEmployee({
      ...employee,
      payPerHour,
      source: employee.source ?? 'manual',
    });
  }

  async setPayForMasterTimeName(name: string, payPerHour: number): Promise<Employee> {
    const existing = findEmployeeByName(this.employees(), name);
    if (existing) {
      await this.updateEmployeePay(existing, payPerHour);
      return { ...existing, payPerHour };
    }
    return this.createEmployee(name, payPerHour);
  }
}
