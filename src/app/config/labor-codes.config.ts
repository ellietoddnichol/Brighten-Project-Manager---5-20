import { signal } from '@angular/core';

const DEFER_LABOR_CODE_SETUP_KEY = 'brighten.deferLaborCodeSetup';

function readDeferSetup(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const stored = localStorage.getItem(DEFER_LABOR_CODE_SETUP_KEY);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  // Default deferred — labor code mapping can wait while projects are set up manually.
  return true;
}

export const laborCodesDeferred = signal(readDeferSetup());

export const laborCodesConfig = {
  get deferSetup(): boolean {
    return laborCodesDeferred();
  },

  setDeferSetup(deferred: boolean): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DEFER_LABOR_CODE_SETUP_KEY, String(deferred));
    }
    laborCodesDeferred.set(deferred);
  },
};
