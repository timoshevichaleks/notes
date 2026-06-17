import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { NotesService } from './notes.service';
import { environment } from '../../environments/environment';

describe('NotesService', () => {
  let service: NotesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [NotesService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(NotesService);
    http = TestBed.inject(HttpTestingController);
  });

  it('search posts the query and returns answer + sources', () => {
    let result: any;
    service.search('deadlines?').subscribe((r) => (result = r));

    const req = http.expectOne(`${environment.apiUrl}/notes/search`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ query: 'deadlines?' });
    req.flush({ answer: 'in September', sources: [{ id: 'n1', title: 'Q3' }] });

    expect(result.answer).toBe('in September');
    expect(result.sources[0].title).toBe('Q3');
  });
});
