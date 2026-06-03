import { Routes } from '@angular/router';

export const DOCUMENTS_ROUTES: Routes = [
  {
    path: 'documents',
    loadComponent: () => import('@features/documents/pages/documents-page').then(m => m.Documents),
  },
];
