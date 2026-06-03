import { GlobalModuleId } from '@app/models/global-enabled-modules.types';

export const GLOBAL_SHOW_ALL_TOOLS_KEY = 'brighten.globalShowAllTools';
export const GLOBAL_PINNED_TOOLS_KEY = 'brighten.pinnedTools';

export const DEFAULT_PINNED_TOOLS: GlobalModuleId[] = [
  'active-2026-control',
  'projects',
  'tasks',
  'wip',
  'ar',
];

export const PINNABLE_TOOLS: GlobalModuleId[] = [
  'active-2026-control',
  'projects',
  'tasks',
  'wip',
  'ar',
  'certified-payroll',
  'subcontractors',
  'foreman-bonuses',
  'import-review',
  'labor',
  'documents',
  'rfis',
  'submittals',
  'billing',
  'changes',
];

export function loadGlobalShowAllTools(): boolean {
  try {
    return localStorage.getItem(GLOBAL_SHOW_ALL_TOOLS_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveGlobalShowAllTools(value: boolean): void {
  try {
    localStorage.setItem(GLOBAL_SHOW_ALL_TOOLS_KEY, value ? 'true' : 'false');
  } catch { /* ignore */ }
}

export function loadPinnedTools(): GlobalModuleId[] {
  try {
    const raw = localStorage.getItem(GLOBAL_PINNED_TOOLS_KEY);
    if (!raw) return [...DEFAULT_PINNED_TOOLS];
    const parsed = JSON.parse(raw) as GlobalModuleId[];
    return Array.isArray(parsed) && parsed.length ? parsed : [...DEFAULT_PINNED_TOOLS];
  } catch {
    return [...DEFAULT_PINNED_TOOLS];
  }
}

export function savePinnedTools(ids: GlobalModuleId[]): void {
  try {
    localStorage.setItem(GLOBAL_PINNED_TOOLS_KEY, JSON.stringify(ids));
  } catch { /* ignore */ }
}

export function isPinned(id: GlobalModuleId, pinned: GlobalModuleId[]): boolean {
  return pinned.includes(id);
}

export function togglePinnedTool(id: GlobalModuleId, pinned: GlobalModuleId[]): GlobalModuleId[] {
  if (pinned.includes(id)) {
    return pinned.filter(p => p !== id);
  }
  return [...pinned, id];
}

export function resetPinnedTools(): GlobalModuleId[] {
  return [...DEFAULT_PINNED_TOOLS];
}

export interface PinnableToolGroup {
  label: string;
  toolIds: GlobalModuleId[];
}

/** All tools the user can pin, grouped for Settings UI. */
export const PINNABLE_TOOL_GROUPS: PinnableToolGroup[] = [
  {
    label: 'Dashboard',
    toolIds: ['active-2026-control', 'dashboard'],
  },
  {
    label: 'Projects',
    toolIds: ['projects'],
  },
  {
    label: 'Work',
    toolIds: ['tasks', 'changes', 'rfis', 'submittals', 'daily-logs', 'field-issues', 'certified-payroll'],
  },
  {
    label: 'Financials',
    toolIds: ['wip', 'ar', 'billing', 'foreman-bonuses', 'pos', 'sub-invoices'],
  },
  {
    label: 'Documents',
    toolIds: ['documents', 'drive-mapping', 'generated-docs', 'missing-required-docs'],
  },
  {
    label: 'More',
    toolIds: ['labor', 'labor-actuals', 'subcontractors', 'import-review', 'seed-completeness', 'settings'],
  },
];
