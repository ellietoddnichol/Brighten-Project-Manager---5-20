import { Routes } from '@angular/router';

export const SUBCONTRACTORS_ROUTES: Routes = [
  {
    path: 'directory',
    loadComponent: () => import('@features/subcontractors/pages/directory-hub-page').then(m => m.DirectoryHubPage),
  },
  {
    path: 'subcontractors',
    loadComponent: () => import('@features/subcontractors/pages/subcontractors-page').then(m => m.SubcontractorsPage),
  },
];
