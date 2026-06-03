export interface LaborCodeHoursRow {
  laborCode: string;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  totalHours: number;
  totalCost: number;
  rowCount: number;
}

export interface LaborCodeHoursEntry {
  laborCode?: string;
  regularHours?: number;
  overtimeHours?: number;
  doubleTimeHours?: number;
  totalHours?: number;
}

export function groupHoursByLaborCode<T extends LaborCodeHoursEntry>(
  entries: T[],
  costForEntry: (entry: T) => number = () => 0,
): LaborCodeHoursRow[] {
  const map = new Map<string, LaborCodeHoursRow>();

  for (const entry of entries) {
    const code = (entry.laborCode ?? '').trim() || '— Unassigned';
    const existing = map.get(code) ?? {
      laborCode: code,
      regularHours: 0,
      overtimeHours: 0,
      doubleTimeHours: 0,
      totalHours: 0,
      totalCost: 0,
      rowCount: 0,
    };

    existing.regularHours += entry.regularHours ?? 0;
    existing.overtimeHours += entry.overtimeHours ?? 0;
    existing.doubleTimeHours += entry.doubleTimeHours ?? 0;
    existing.totalHours += entry.totalHours
      ?? (entry.regularHours ?? 0) + (entry.overtimeHours ?? 0) + (entry.doubleTimeHours ?? 0);
    existing.totalCost += costForEntry(entry);
    existing.rowCount += 1;
    map.set(code, existing);
  }

  return [...map.values()].sort((a, b) => b.totalHours - a.totalHours);
}
