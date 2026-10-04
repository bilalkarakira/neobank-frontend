import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { Accounts } from '../accounts/accounts';

@Component({
  selector: 'app-home',
  imports: [Accounts],
  templateUrl: './home.html',
})
export class Home {
  protected readonly user = inject(AuthService).user;
}
