import { Routes } from '@angular/router';
import { Login } from './auth/login';
import { NotesList } from './notes/notes-list';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'notes', component: NotesList },
];
