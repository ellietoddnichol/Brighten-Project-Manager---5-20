import { Routes } from '@angular/router';

export const LABOR_ROUTES: Routes = [
  {
    path: 'labor/certified-payroll',
    redirectTo: 'certified-payroll',
    pathMatch: 'full',
  },
  {
    path: 'certified-payroll',
    loadComponent: () => import('@features/labor/pages/certified-payroll').then(m => m.CertifiedPayroll),
  },
  {
    path: 'labor-actuals',
    loadComponent: () => import('@features/labor/pages/labor-actuals-page').then(m => m.LaborActualsPage),
  },
  {
    path: 'foreman-bonuses',
    loadComponent: () => import('@features/labor/pages/foreman-bonuses-page').then(m => m.ForemanBonusesPage),
  },
  { path: 'labor', loadComponent: () => import('@features/labor/pages/labor').then(m => m.Labor) },
  {
    path: 'employees',
    loadComponent: () => import('@features/labor/pages/employees-page').then(m => m.EmployeesPage),
  },
];
