import { Component, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { NotificationsService } from './features/notifications/notifications.service';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly notifications = inject(NotificationsService);
  private readonly router = inject(Router);

  constructor() {
    // the badge needs the count as soon as someone is signed in, and none once they are not
    effect(() => {
      if (this.auth.isLoggedIn()) {
        this.notifications.refresh();
      } else {
        this.notifications.clear();
      }
    });
  }

  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }

  /** If the request fails the user stays logged in, so nothing is hidden behind a false "you are logged out". */
  protected logoutEverywhere(): void {
    this.auth.logoutAll().subscribe({
      next: () => void this.router.navigate(['/login']),
      error: () => undefined,
    });
  }
}
