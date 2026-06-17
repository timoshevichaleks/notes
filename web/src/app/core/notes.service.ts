import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface Note {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  tags: string[];
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
}

export interface SearchResult {
  answer: string;
  sources: { id: string; title: string }[];
}

@Injectable({ providedIn: 'root' })
export class NotesService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/notes`;

  list() {
    return this.http.get<Note[]>(this.base);
  }

  create(title: string, content: string) {
    return this.http.post<Note>(this.base, { title, content });
  }

  get(id: string) {
    return this.http.get<Note>(`${this.base}/${id}`);
  }

  search(query: string) {
    return this.http.post<SearchResult>(`${this.base}/search`, { query });
  }
}
