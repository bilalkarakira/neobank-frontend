import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },
  {
    path: 'home',
    canActivate: [authGuard],
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  {
    path: 'transfer',
    canActivate: [authGuard],
    loadComponent: () => import('./features/transfer/transfer').then((m) => m.Transfer),
  },
  {
    path: 'recurring',
    canActivate: [authGuard],
    loadComponent: () => import('./features/recurring/recurring').then((m) => m.Recurring),
  },
  {
    path: 'history',
    canActivate: [authGuard],
    loadComponent: () => import('./features/history/history').then((m) => m.History),
  },
  {
    path: 'security',
    canActivate: [authGuard],
    loadComponent: () => import('./features/account-security/account-security').then((m) => m.AccountSecurity),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin').then((m) => m.Admin),
  },
  { path: '**', redirectTo: 'dashboard' },
];
