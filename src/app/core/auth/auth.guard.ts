import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Only logged-in users may enter. */
export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService).isLoggedIn() ? true : router.createUrlTree(['/login']);
};

/** Only administrators may enter; everyone else lands on the dashboard (guests are sent to log in first). */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/login']);
  }
  return auth.isAdmin() ? true : router.createUrlTree(['/dashboard']);
};

/** Logged-in users have no business on the login/register pages. */
export const guestGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService).isLoggedIn() ? router.createUrlTree(['/dashboard']) : true;
};
