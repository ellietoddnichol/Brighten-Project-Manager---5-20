import { Routes } from '@angular/router';

export const FINANCIALS_ROUTES: Routes = [
  {
    path: 'financials',
    loadComponent: () => import('@features/financials/pages/financials-hub-page').then(m => m.FinancialsHubPage),
  },
  { path: 'billing', loadComponent: () => import('@features/financials/pages/billing').then(m => m.Billing) },
  { path: 'wip', loadComponent: () => import('@features/financials/pages/wip-page').then(m => m.WipPage) },
  { path: 'ar', loadComponent: () => import('@features/financials/pages/ar-page').then(m => m.ArPage) },
  { path: 'pos', loadComponent: () => import('@features/financials/pages/pos-page').then(m => m.PosPage) },
  { path: 'changes', loadComponent: () => import('@features/financials/pages/changes').then(m => m.Changes) },
  { path: 'reports', loadComponent: () => import('@features/financials/pages/reports').then(m => m.Reports) },
];
