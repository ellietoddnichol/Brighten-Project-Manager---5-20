/** Normalize employee names for matching "Last, First" ↔ "First Last". */
export function employeeNameParts(name: string): string[] {
  const raw = name.trim().toLowerCase();
  if (!raw) return [];
  if (raw.includes(',')) {
    const [last, ...firstParts] = raw.split(',');
    const first = firstParts.join(',').trim();
    return [...first.split(/\s+/), ...last.trim().split(/\s+/)]
      .map(p => p.trim())
      .filter(Boolean);
  }
  return raw.split(/\s+/).filter(Boolean);
}

export function employeeNameMatchKey(name: string): string {
  return employeeNameParts(name).sort().join(' ');
}

/** Convert ADP-style "Last, First M" to "First M Last" for display / Master Time. */
export function formatEmployeeDisplayName(reportName: string): string {
  const raw = reportName.trim();
  if (!raw.includes(',')) return raw;
  const [last, ...rest] = raw.split(',');
  const first = rest.join(',').trim();
  const lastTrim = last.trim();
  if (!first) return lastTrim;
  return `${first} ${lastTrim}`.replace(/\s+/g, ' ');
}
