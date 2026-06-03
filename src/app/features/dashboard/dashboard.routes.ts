import { Routes } from '@angular/router';

export const DASHBOARD_ROUTES: Routes = [
  { path: '', loadComponent: () => import('@features/dashboard/pages/dashboard').then(m => m.Dashboard) },
  {
    path: 'active-2026-control',
    loadComponent: () => import('@features/dashboard/pages/active-2026-control-page').then(m => m.Active2026ControlPage),
  },
];
