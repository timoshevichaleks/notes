import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <h2>Login</h2>
    <form (ngSubmit)="submit()">
      <input [(ngModel)]="email" name="email" placeholder="email" />
      <input
        [(ngModel)]="password"
        name="password"
        type="password"
        placeholder="password"
      />
      <button type="submit">Sign in</button>
      <button type="button" (click)="register()">Register</button>
    </form>
    @if (error) {
      <p style="color:red">{{ error }}</p>
    }
  `,
})
export class Login {
  private auth = inject(AuthService);
  private router = inject(Router);
  email = '';
  password = '';
  error = '';

  submit() {
    this.auth.login(this.email, this.password).subscribe({
      next: () => this.router.navigateByUrl('/notes'),
      error: () => (this.error = 'Login failed'),
    });
  }

  register() {
    this.auth.register(this.email, this.password).subscribe({
      next: () => this.router.navigateByUrl('/notes'),
      error: () => (this.error = 'Register failed'),
    });
  }
}
