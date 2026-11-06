import { inject } from '@angular/core';
import { CanMatchFn, Router, Routes } from '@angular/router';
import { AdminService } from './core/admin.service';

/** The Simulate and Machine pages exist only while the admin tabs are open. */
const adminOnly: CanMatchFn = () => inject(AdminService).unlocked() || inject(Router).createUrlTree(['/design']);

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'design' },
  { path: 'design', loadComponent: () => import('./design/design-page').then((m) => m.DesignPage) },
  {
    path: 'simulate',
    canMatch: [adminOnly],
    loadComponent: () => import('@app/features/simulate/simulate-page').then((m) => m.SimulatePage),
  },
  {
    path: 'machine',
    canMatch: [adminOnly],
    loadComponent: () => import('@app/features/machine/machine-page').then((m) => m.MachinePage),
  },
  { path: '**', redirectTo: 'design' },
];
