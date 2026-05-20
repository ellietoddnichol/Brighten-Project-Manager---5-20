import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/dashboard').then(m => m.Dashboard) },
  { path: 'projects', loadComponent: () => import('./pages/projects').then(m => m.Projects) },
  { path: 'projects/:id', loadComponent: () => import('./pages/project-details').then(m => m.ProjectDetails) },
  { path: 'reports', loadComponent: () => import('./pages/reports').then(m => m.Reports) },
  { path: 'settings', loadComponent: () => import('./pages/settings').then(m => m.Settings) },
  { path: '**', redirectTo: '' }
];
