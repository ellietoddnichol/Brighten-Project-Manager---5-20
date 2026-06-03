import { Routes } from '@angular/router';

export const PROJECTS_ROUTES: Routes = [
  { path: 'projects', loadComponent: () => import('@features/projects/pages/projects').then(m => m.Projects) },
  {
    path: 'projects/:id',
    loadComponent: () => import('@features/projects/pages/project-details').then(m => m.ProjectDetails),
  },
];
