import { Routes } from '@angular/router';
import { DASHBOARD_ROUTES } from '@features/dashboard/dashboard.routes';
import { PROJECTS_ROUTES } from '@features/projects/projects.routes';
import { FINANCIALS_ROUTES } from '@features/financials/financials.routes';
import { SUBCONTRACTORS_ROUTES } from '@features/subcontractors/subcontractors.routes';
import { WORKFLOWS_ROUTES } from '@features/workflows/workflows.routes';
import { DOCUMENTS_ROUTES } from '@features/documents/documents.routes';
import { LABOR_ROUTES } from '@features/labor/labor.routes';
import { SETTINGS_ROUTES } from '@features/settings/settings.routes';

export const routes: Routes = [
  ...DASHBOARD_ROUTES,
  ...PROJECTS_ROUTES,
  ...FINANCIALS_ROUTES,
  ...SUBCONTRACTORS_ROUTES,
  ...WORKFLOWS_ROUTES,
  ...DOCUMENTS_ROUTES,
  ...LABOR_ROUTES,
  ...SETTINGS_ROUTES,
  { path: '**', redirectTo: '' },
];
