import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NotesService, Note, SearchResult } from '../core/notes.service';

@Component({
  selector: 'app-notes-list',
  imports: [FormsModule],
  template: `
    <h2>My notes</h2>
    <form (ngSubmit)="add()">
      <input [(ngModel)]="title" name="title" placeholder="title" />
      <textarea [(ngModel)]="content" name="content" placeholder="content"></textarea>
      <button type="submit">Add</button>
    </form>
    <button (click)="reload()">Refresh</button>

    <hr />
    <h3>Ask your notes (semantic search)</h3>
    <form (ngSubmit)="search()">
      <input [(ngModel)]="query" name="query" placeholder="e.g. when is the deadline?" style="width: 70%" />
      <button type="submit" [disabled]="searching()">Search</button>
    </form>
    @if (searching()) {
      <p>Searching…</p>
    }
    @if (result(); as r) {
      <p><strong>Answer:</strong> {{ r.answer }}</p>
      @if (r.sources.length) {
        <p><strong>Sources:</strong></p>
        <ul>
          @for (s of r.sources; track s.id) {
            <li>{{ s.title }}</li>
          }
        </ul>
      }
    }

    <hr />
    <ul>
      @for (note of notes(); track note.id) {
        <li>
          <strong>{{ note.title }}</strong> — {{ note.status }}
          @if (note.summary) {
            <p>
              <em>{{ note.summary }}</em>
            </p>
            <small>{{ note.tags.join(', ') }}</small>
          }
        </li>
      }
    </ul>
  `,
})
export class NotesList implements OnInit {
  private service = inject(NotesService);
  notes = signal<Note[]>([]);
  title = '';
  content = '';

  query = '';
  searching = signal(false);
  result = signal<SearchResult | null>(null);

  ngOnInit() {
    this.reload();
  }

  search() {
    if (!this.query.trim()) return;
    this.searching.set(true);
    this.service.search(this.query).subscribe({
      next: (r) => {
        this.result.set(r);
        this.searching.set(false);
      },
      error: () => this.searching.set(false),
    });
  }

  reload() {
    this.service.list().subscribe((n) => this.notes.set(n));
  }

  add() {
    this.service.create(this.title, this.content).subscribe(() => {
      this.title = '';
      this.content = '';
      this.reload();
    });
  }
}
