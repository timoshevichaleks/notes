export const AUTH_PATTERNS = {
  register: 'auth.register',
  login: 'auth.login',
} as const;

export const NOTES_PATTERNS = {
  create: 'notes.create',
  list: 'notes.list',
  get: 'notes.get',
  update: 'notes.update',
  remove: 'notes.remove',
  search: 'notes.search',
} as const;

export const AUTH_SERVICE = 'AUTH_SERVICE';
export const NOTES_SERVICE = 'NOTES_SERVICE';

export interface AuthCredentials {
  email: string;
  password: string;
}
export interface CreateNotePayload {
  userId: string;
  title: string;
  content: string;
}
export interface NoteIdPayload {
  userId: string;
  id: string;
}
export interface UpdateNotePayload {
  userId: string;
  id: string;
  title?: string;
  content?: string;
}
export interface SearchPayload {
  userId: string;
  query: string;
}
export interface ListPayload {
  userId: string;
}
