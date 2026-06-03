import { Routes } from '@angular/router';

export const SETTINGS_ROUTES: Routes = [
  { path: 'settings', loadComponent: () => import('@features/settings/pages/settings').then(m => m.Settings) },
];
