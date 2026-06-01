export function cellStr(value) {
  if (value == null) return '';
  return String(value).trim();
}

export function parseMoney(value) {
  if (value == null || value === '') return 0;
  const raw = String(value).trim();
  if (!raw || raw === '-' || raw === '—' || raw.includes('#DIV')) return 0;
  const negative = raw.includes('(') && raw.includes(')');
  const n = Number(raw.replace(/[$,\s()]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

export function parseAmount(value) {
  return parseMoney(value);
}

export function parseDate(value) {
  const raw = cellStr(value);
  if (!raw) return undefined;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    return iso;
  }
  return raw;
}

export function monthFromDate(dateStr) {
  if (!dateStr) return undefined;
  const d = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function normalizeVendorName(name) {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\binc\.?\b/gi, 'Inc.')
    .replace(/\bllc\.?\b/gi, 'LLC');
}

export function displayVendorName(name) {
  const trimmed = name.trim();
  if (trimmed.length <= 4 && trimmed === trimmed.toLowerCase()) {
    return trimmed.toUpperCase();
  }
  return normalizeVendorName(trimmed);
}

export function parseJobFromCustomer(customer) {
  const match = cellStr(customer).match(/^(\d+)\s*-\s*(.+)$/);
  if (match) return { jobNumber: match[1], projectName: match[2].trim() };
  const digits = cellStr(customer).replace(/\D/g, '');
  return { jobNumber: digits || undefined, projectName: customer.trim() };
}

export function jobNumberFromFilename(filename) {
  const match = filename.match(/J(\d+)/i);
  return match ? match[1] : undefined;
}

export function stableImportKey(parts) {
  return parts.filter(Boolean).join('|').toLowerCase();
}

export function isRetainageDescription(description) {
  const d = (description ?? '').toLowerCase();
  return /\bret\b/.test(d) || d.includes('retention') || d.includes('retainage');
}

export function categorizeDistributionAccount(account) {
  const acct = account.trim().toLowerCase();
  if (acct.includes('wages') || acct.includes('union benefits')) return 'Labor';
  if (acct.includes('sub contract')) return 'Subcontractor';
  if (acct.includes('supplies') || acct.includes('material')) return 'Material';
  if (acct.includes('equipment') || acct.includes('tools') || acct.includes('rental')) return 'Equipment';
  if (acct.includes('general condition') || acct.includes('supervision') || acct.includes('preconstruction')) {
    return 'GeneralConditions';
  }
  return 'Other';
}
