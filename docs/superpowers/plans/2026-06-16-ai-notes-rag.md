# AI Notes RAG — Implementation Plan

> **For agentic workers:** выполняется через superpowers:executing-plans, по задачам. Шаги «Checkpoint» = «проверь и иди дальше», БЕЗ git (учебный пример, без коммитов).

**Goal:** добавить семантический поиск по заметкам (RAG) на pgvector + локальных эмбеддингах.

**Architecture:** локальная модель эмбеддингов (transformers.js) превращает текст в вектор 384; векторы хранятся в Postgres (pgvector); существующий BullMQ-воркер индексирует заметки; новый эндпоинт `POST /notes/search` ищет ближайшие векторы и отвечает через Claude.

**Tech Stack:** @xenova/transformers, pgvector (`pgvector/pgvector:pg16`), Prisma (raw SQL для vector), NestJS, Jest.

**Все команды — из `c:\TransPerfect\test\api` (оболочка PowerShell). Без git.**

---

## Task 1: Перевести Postgres на pgvector

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Поменять образ Postgres в compose**

Modify `docker-compose.yml` — у сервиса `postgres` заменить:
```yaml
    image: pgvector/pgvector:pg16
```
(остальное без изменений).

- [ ] **Step 2: Пересоздать локальный dev-контейнер на pgvector**

Run (из `test/`):
```
docker rm -f ainotes-pg
docker run --name ainotes-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ainotes -p 5432:5432 -d pgvector/pgvector:pg16
```
Expected: новый контейнер запущен на pgvector-образе.

- [ ] **Step 3: Checkpoint**

Дождись готовности БД (`docker exec ainotes-pg pg_isready -U postgres`). Данные прошлой БД сброшены — это норм для учебного проекта (миграции накатим заново).

---

## Task 2: Миграция — расширение vector + колонка embedding

**Files:**
- Modify: `api/prisma/schema.prisma`
- Create: миграция через `prisma migrate dev`

- [ ] **Step 1: Добавить поле в схему**

Modify `api/prisma/schema.prisma` — в модель `Note` добавить строку:
```prisma
  embedding Unsupported("vector(384)")?
```

- [ ] **Step 2: Создать пустую миграцию для расширения**

Поскольку `prisma migrate dev` сам не создаёт `CREATE EXTENSION`, делаем так: сперва создаём расширение вручную, затем генерим миграцию.

Run (из `api/`):
```
docker exec ainotes-pg psql -U postgres -d ainotes -c "CREATE EXTENSION IF NOT EXISTS vector;"
npx prisma migrate dev --name add_note_embedding
```
Expected: миграция создана и применена; колонка `embedding` есть.

- [ ] **Step 3: Дописать CREATE EXTENSION в миграцию (для воспроизводимости)**

Открой свежесозданный файл `api/prisma/migrations/<ts>_add_note_embedding/migration.sql` и добавь ПЕРВОЙ строкой:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```
Так миграция накатится на чистой БД (CI/prod) без ручного шага.

- [ ] **Step 4: Checkpoint**

Run:
```
npx prisma generate
docker exec ainotes-pg psql -U postgres -d ainotes -c "\d \"Note\""
```
Expected: среди колонок есть `embedding | vector(384)`.

---

## Task 3: EmbeddingsService (transformers.js)

**Files:**
- Create: `api/src/embeddings/embeddings.service.ts`
- Create: `api/src/embeddings/embeddings.module.ts`
- Test: `api/src/embeddings/embeddings.service.spec.ts`

- [ ] **Step 1: Поставить зависимость**

Run (из `api/`):
```
npm install @xenova/transformers
```

- [ ] **Step 2: Написать падающий тест**

Create `api/src/embeddings/embeddings.service.spec.ts`:
```typescript
import { EmbeddingsService } from './embeddings.service';

describe('EmbeddingsService', () => {
  let service: EmbeddingsService;

  beforeAll(() => {
    service = new EmbeddingsService();
  });

  function cosine(a: number[], b: number[]): number {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  it('produces a 384-dim vector and ranks similar text closer', async () => {
    const deadline = await service.embed('project deadline in Q3');
    const similar = await service.embed('the cutoff date is this autumn');
    const unrelated = await service.embed('a recipe for borscht soup');

    expect(deadline.length).toBe(384);
    expect(cosine(deadline, similar)).toBeGreaterThan(
      cosine(deadline, unrelated),
    );
  }, 60000);
});
```

- [ ] **Step 3: Запустить тест — убедиться, что падает**

Run (из `api/`):
```
npm test -- embeddings.service
```
Expected: FAIL — модуль не найден.

- [ ] **Step 4: Реализовать сервис**

Create `api/src/embeddings/embeddings.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';

type FeatureExtractionPipeline = (
  text: string,
  opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array }>;

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

  private async getPipeline(): Promise<FeatureExtractionPipeline> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = (async () => {
        const { pipeline } = await import('@xenova/transformers');
        this.logger.log('Loading embedding model all-MiniLM-L6-v2...');
        return (await pipeline(
          'feature-extraction',
          'Xenova/all-MiniLM-L6-v2',
        )) as unknown as FeatureExtractionPipeline;
      })();
    }
    return this.pipelinePromise;
  }

  async embed(text: string): Promise<number[]> {
    const extractor = await this.getPipeline();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }
}
```

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run (из `api/`):
```
npm test -- embeddings.service
```
Expected: PASS (первый прогон скачивает модель ~25МБ).

- [ ] **Step 6: Создать модуль**

Create `api/src/embeddings/embeddings.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';

@Module({
  providers: [EmbeddingsService],
  exports: [EmbeddingsService],
})
export class EmbeddingsModule {}
```

- [ ] **Step 7: Checkpoint** — `npm run build` (exit 0).

---

## Task 4: Индексация в воркере

**Files:**
- Modify: `api/src/jobs/summarize.processor.ts`
- Modify: `api/src/jobs/jobs.module.ts`

- [ ] **Step 1: Подключить EmbeddingsModule в JobsModule**

Modify `api/src/jobs/jobs.module.ts` — добавить в `imports`:
```typescript
import { EmbeddingsModule } from '../embeddings/embeddings.module';
```
и в массив `imports`: `EmbeddingsModule`.

- [ ] **Step 2: Считать и сохранить embedding в процессоре**

Modify `api/src/jobs/summarize.processor.ts`:
- в конструктор добавить `private embeddings: EmbeddingsService` (импорт из `../embeddings/embeddings.service`);
- после получения `result` и перед финальным апдейтом вычислить вектор и записать его сырым SQL (Prisma не умеет писать `vector` через `update`):
```typescript
const result = await this.summaries.summarize(note.title, note.content);
const vector = await this.embeddings.embed(`${note.title}\n${note.content}`);
await this.prisma.note.update({
  where: { id: noteId },
  data: { summary: result.summary, tags: result.tags, status: 'DONE' },
});
await this.prisma.$executeRawUnsafe(
  `UPDATE "Note" SET embedding = $1::vector WHERE id = $2`,
  `[${vector.join(',')}]`,
  noteId,
);
```

- [ ] **Step 3: Checkpoint** — `npm test` (все прежние тесты зелёные) + `npm run build`.

---

## Task 5: Поиск — сервис + эндпоинт

**Files:**
- Modify: `api/src/notes/notes.service.ts`
- Modify: `api/src/notes/notes.controller.ts`
- Modify: `api/src/notes/notes.module.ts`
- Create: `api/src/notes/dto/search.dto.ts`
- Test: `api/src/notes/notes.search.spec.ts`

- [ ] **Step 1: DTO поиска**

Create `api/src/notes/dto/search.dto.ts`:
```typescript
import { IsString, MinLength } from 'class-validator';

export class SearchDto {
  @IsString()
  @MinLength(1)
  query: string;
}
```

- [ ] **Step 2: Падающий тест search**

Create `api/src/notes/notes.search.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotesService } from './notes.service';
import { PrismaService } from '../prisma/prisma.service';
import { SUMMARIZE_QUEUE } from '../jobs/jobs.constants';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { SummariesService } from '../summaries/summaries.service';

describe('NotesService.search', () => {
  let service: NotesService;
  let prisma: any;
  let embeddings: { embed: jest.Mock };
  let summaries: { answerFromContext: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRawUnsafe: jest.fn() };
    embeddings = { embed: jest.fn().mockResolvedValue([0.1, 0.2]) };
    summaries = {
      answerFromContext: jest.fn().mockResolvedValue('the answer'),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotesService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(SUMMARIZE_QUEUE), useValue: { add: jest.fn() } },
        { provide: EmbeddingsService, useValue: embeddings },
        { provide: SummariesService, useValue: summaries },
      ],
    }).compile();
    service = moduleRef.get(NotesService);
  });

  it('embeds query, finds notes, asks Claude with context', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      { id: 'n1', title: 'Q3 plan', content: 'deadlines...' },
    ]);

    const res = await service.search('u1', 'when are deadlines');

    expect(embeddings.embed).toHaveBeenCalledWith('when are deadlines');
    expect(summaries.answerFromContext).toHaveBeenCalled();
    expect(res.sources).toEqual([{ id: 'n1', title: 'Q3 plan' }]);
    expect(res.answer).toBe('the answer');
  });
});
```

- [ ] **Step 3: Запустить — убедиться, что падает**

Run: `npm test -- notes.search`
Expected: FAIL (нет `answerFromContext` / `search`).

- [ ] **Step 4: Добавить `answerFromContext` в SummariesService**

Modify `api/src/summaries/summaries.service.ts` — добавить метод:
```typescript
async answerFromContext(query: string, notes: { title: string; content: string }[]): Promise<string> {
  const context = notes
    .map((n, i) => `[${i + 1}] ${n.title}\n${n.content}`)
    .join('\n\n');
  if (!this.client) {
    return notes.length
      ? `[mock answer] Based on ${notes.length} note(s): ${notes[0].title}`
      : '[mock answer] No relevant notes found.';
  }
  const response = await this.client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content:
          `Answer the question using ONLY the notes below. ` +
          `If the notes do not contain the answer, say you could not find it.\n\n` +
          `Notes:\n${context}\n\nQuestion: ${query}`,
      },
    ],
  });
  return response.content
    .filter((b): b is import('@anthropic-ai/sdk').TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}
```

- [ ] **Step 5: Добавить `search` в NotesService**

Modify `api/src/notes/notes.service.ts`:
- в конструктор добавить `private embeddings: EmbeddingsService` и `private summaries: SummariesService` (импорты);
- добавить метод:
```typescript
async search(userId: string, query: string) {
  const vector = await this.embeddings.embed(query);
  const rows = await this.prisma.$queryRawUnsafe<
    { id: string; title: string; content: string }[]
  >(
    `SELECT id, title, content FROM "Note"
     WHERE "userId" = $1 AND embedding IS NOT NULL
     ORDER BY embedding <=> $2::vector
     LIMIT 5`,
    userId,
    `[${vector.join(',')}]`,
  );
  const answer = await this.summaries.answerFromContext(query, rows);
  return { answer, sources: rows.map((r) => ({ id: r.id, title: r.title })) };
}
```

- [ ] **Step 6: Подключить зависимости в NotesModule**

Modify `api/src/notes/notes.module.ts` — добавить в `imports`: `EmbeddingsModule`, `SummariesModule` (импорты из соответствующих путей).

- [ ] **Step 7: Эндпоинт в контроллере**

Modify `api/src/notes/notes.controller.ts` — добавить:
```typescript
import { SearchDto } from './dto/search.dto';
```
и метод:
```typescript
@Post('search')
search(@CurrentUser() user: { userId: string }, @Body() dto: SearchDto) {
  return this.notes.search(user.userId, dto.query);
}
```
(Поставить ВЫШЕ `@Get(':id')`/`@Post()` неважно, но эндпоинт `POST /notes/search` не конфликтует с `POST /notes`.)

- [ ] **Step 8: Запустить — убедиться, что проходит**

Run: `npm test -- notes.search`
Expected: PASS.

- [ ] **Step 9: Checkpoint** — `npm test` (всё зелёное) + `npm run build`.

---

## Task 6: e2e — реальный RAG-цикл

**Files:**
- Create: `api/test/rag.e2e-spec.ts`

- [ ] **Step 1: Написать e2e**

Create `api/test/rag.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('RAG search (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const email = `rag-${Date.now()}@test.local`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123' });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123' });
    token = login.body.token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('indexes notes and finds the relevant one by meaning', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    await request(app.getHttpServer())
      .post('/notes')
      .set(auth)
      .send({ title: 'Q3 roadmap', content: 'Deadline for the release is in September.' });
    await request(app.getHttpServer())
      .post('/notes')
      .set(auth)
      .send({ title: 'Lunch ideas', content: 'Try the new ramen place downtown.' });

    // wait for the worker to index (embedding written)
    await new Promise((r) => setTimeout(r, 8000));

    const res = await request(app.getHttpServer())
      .post('/notes/search')
      .set(auth)
      .send({ query: 'when is the cutoff date for shipping' })
      .expect(201);

    expect(res.body.sources.length).toBeGreaterThan(0);
    expect(res.body.sources[0].title).toBe('Q3 roadmap');
  }, 30000);
});
```

- [ ] **Step 2: Запустить e2e (нужны pgvector-Postgres и Redis)**

Run (из `api/`):
```
npm run test:e2e
```
Expected: PASS — релевантная заметка `Q3 roadmap` первой в `sources`.

- [ ] **Step 3: Checkpoint** — финальный `npm test` + `npm run build`.

---

## Соответствие спеку

| Раздел спека | Задача |
|---|---|
| Хранилище pgvector | Task 1, 2 |
| EmbeddingsService | Task 3 |
| Индексация в воркере | Task 4 |
| Поиск + эндпоинт | Task 5 |
| Тесты (unit + e2e) | Task 3, 5, 6 |

---

## Замечания
- Первый прогон теста эмбеддингов скачивает модель (~25МБ) — медленно один раз, дальше из кеша.
- `embedding <=> $vector` — оператор косинусного расстояния pgvector; меньше = ближе.
- Точки роста: чанкинг, гибридный поиск, Langfuse вокруг retrieval, фронт для поиска.
