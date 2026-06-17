import { signal } from '@angular/core';

const USE_QB_WORKBOOK_SYNC_KEY = 'brighten.useQuickBooksWorkbookSync';

function readUseWorkbookSync(): boolean {
  if (typeof localStorage === 'undefined') return false;
  const stored = localStorage.getItem(USE_QB_WORKBOOK_SYNC_KEY);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  // Default off — financials and subs are updated manually in the app.
  return false;
}

/** Reactive flag for templates; mirrors localStorage. */
export const qbWorkbookSyncEnabled = signal(readUseWorkbookSync());

export const qbSyncConfig = {
  get useWorkbookSync(): boolean {
    return qbWorkbookSyncEnabled();
  },

  setUseWorkbookSync(enabled: boolean): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(USE_QB_WORKBOOK_SYNC_KEY, String(enabled));
    }
    qbWorkbookSyncEnabled.set(enabled);
  },

  isManualMode(): boolean {
    return !this.useWorkbookSync;
  },
};
