import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  private readonly _token = signal<string | null>(
    localStorage.getItem('token'),
  );
  readonly token = this._token.asReadonly();

  register(email: string, password: string) {
    return this.http
      .post<{ token: string }>(`${environment.apiUrl}/auth/register`, {
        email,
        password,
      })
      .pipe(tap((res) => this.setToken(res.token)));
  }

  login(email: string, password: string) {
    return this.http
      .post<{ token: string }>(`${environment.apiUrl}/auth/login`, {
        email,
        password,
      })
      .pipe(tap((res) => this.setToken(res.token)));
  }

  logout() {
    localStorage.removeItem('token');
    this._token.set(null);
  }

  private setToken(token: string) {
    localStorage.setItem('token', token);
    this._token.set(token);
  }
}
