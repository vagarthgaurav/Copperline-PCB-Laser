import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'design' },
  {
    path: 'design',
    loadComponent: () => import('./features/design/design-page').then((m) => m.DesignPage),
  },
  {
    path: 'simulate',
    loadComponent: () => import('./features/simulate/simulate-page').then((m) => m.SimulatePage),
  },
  {
    path: 'machine',
    loadComponent: () => import('./features/machine/machine-page').then((m) => m.MachinePage),
  },
  { path: '**', redirectTo: 'design' },
];
