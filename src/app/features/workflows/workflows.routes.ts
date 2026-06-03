import { Routes } from '@angular/router';

export const WORKFLOWS_ROUTES: Routes = [
  { path: 'tasks', loadComponent: () => import('@features/workflows/pages/tasks-hub-page').then(m => m.TasksHubPage) },
  { path: 'tasks/board', loadComponent: () => import('@features/workflows/pages/tasks').then(m => m.Tasks) },
  { path: 'rfis', loadComponent: () => import('@features/workflows/pages/rfis').then(m => m.Rfis) },
  {
    path: 'submittals',
    loadComponent: () => import('@features/workflows/pages/submittals-page').then(m => m.Submittals),
  },
  { path: 'daily-logs', loadComponent: () => import('@features/workflows/pages/daily-logs').then(m => m.DailyLogs) },
  {
    path: 'field-issues',
    loadComponent: () => import('@features/workflows/pages/field-issues-page').then(m => m.FieldIssuesPage),
  },
];
