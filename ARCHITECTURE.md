# Архитектура AI Notes

Техническое описание: как устроена система, как сервисы общаются, что происходит на каждый запрос.

---

## 1. Общая картина

```
                 ┌──────────────┐
   Браузер  ───▶ │   Angular     │  http://localhost:4200
                 │   (web)       │
                 └──────┬───────┘
                        │  HTTP + JWT (Authorization: Bearer)
                        ▼
                 ┌──────────────────────────────────────────┐
                 │  GATEWAY (HTTP :3000)                      │
                 │  • валидирует JWT (guard)                  │
                 │  • REST → сообщения микросервисам          │
                 │  • маппит RPC-ошибки обратно в HTTP-коды   │
                 └───────┬───────────────────────┬───────────┘
                         │ TCP (send/await)       │ TCP (send/await)
                         ▼                        ▼
                 ┌───────────────┐        ┌───────────────────┐
                 │ AUTH (:3001)   │        │ NOTES (:3002)      │
                 │ register/login │        │ CRUD + search      │
                 │ выдача JWT      │        │ продюсер очереди   │
                 └──────┬────────┘        └───┬───────────┬────┘
                        │                      │ SQL        │ queue.add (Redis)
                        ▼                      ▼            ▼
                 ┌───────────────────────────────┐   ┌──────────────┐
                 │      PostgreSQL (pgvector)      │   │   Redis       │
                 │      общая БД: User, Note       │   │  очередь      │
                 └───────────────────────────────┘   └──────┬───────┘
                        ▲                                     │ воркер забирает задачу
                        │ UPDATE summary/embedding            ▼
                        │                              ┌───────────────┐
                        └──────────────────────────────│ WORKER         │
                                                        │ summary+vector │──▶ Claude API
                                                        └───────────────┘
```

Ключевая идея: **наружу смотрит только gateway**. Всё остальное — внутренняя сеть. Браузер ничего не знает про auth/notes/worker.

---

## 2. Сервисы и зоны ответственности

| Сервис | Транспорт | Ответственность | Зависит от |
|---|---|---|---|
| **gateway** | HTTP (Express) | REST-API для фронта, JWT-guard, проксирование в auth/notes, маппинг ошибок | auth (TCP), notes (TCP) |
| **auth** | TCP (микросервис) | хэш пароля (bcrypt), проверка дублей, подпись JWT | PostgreSQL |
| **notes** | TCP (микросервис) | CRUD заметок (изоляция по userId), постановка задач, семантический поиск | PostgreSQL, Redis, ai |
| **worker** | — (consumer) | индексация: summary (Claude) + embedding (локальная модель) | PostgreSQL, Redis, ai |

Каждый сервис — отдельное приложение NestJS со своим `main.ts` и своим деплоем (контейнером).

---

## 3. Три способа коммуникации

В системе три разных канала связи — это важно понимать, потому что у каждого своя задача.

### 3.1. Браузер ↔ gateway — синхронный HTTP

Обычный REST. Контракт не менялся при разбивке на микросервисы:
```
POST /auth/register   {email, password}        → {token}
POST /auth/login      {email, password}        → {token}
GET  /notes           (JWT)                      → Note[]
POST /notes           (JWT) {title, content}     → Note (PENDING)
POST /notes/search    (JWT) {query}              → {answer, sources[]}
GET  /notes/:id       (JWT)                      → Note
PATCH/DELETE /notes/:id (JWT)
GET  /health                                     → {status:"ok"}
```

### 3.2. gateway ↔ auth/notes — синхронный TCP (request/response)

Это «сердце» межсервисной связи. NestJS даёт это через `@nestjs/microservices`.

**На стороне сервиса** (auth/notes) — вместо HTTP-эндпоинтов стоят **обработчики сообщений**. Сервис слушает TCP-порт и реагирует на «паттерн» (строковый ключ):
```typescript
// apps/notes/src/notes.controller.ts
@MessagePattern(NOTES_PATTERNS.create)        // 'notes.create'
create(@Payload() p: CreateNotePayload) {
  return this.notes.create(p.userId, { title: p.title, content: p.content });
}
```

**На стороне gateway** — клиент `ClientProxy` отправляет сообщение с этим паттерном и **ждёт ответ**:
```typescript
// apps/gateway/src/notes.controller.ts
@Post()
create(@CurrentUser() user, @Body() dto) {
  return callService(this.notes.send(NOTES_PATTERNS.create, { userId: user.userId, ...dto }));
}
```

- `client.send(pattern, payload)` → возвращает `Observable`, который эмитит **один ответ** (request/response). Мы оборачиваем его в `firstValueFrom`, чтобы получить Promise.
- Паттерны и типы payload вынесены в общую библиотеку **`@app/contracts`** — gateway и сервис ссылаются на одни и те же константы (`NOTES_PATTERNS.create`), поэтому опечатка в строке невозможна.
- `client.emit(pattern, payload)` (без ожидания ответа) тоже есть — для событий «выстрелил и забыл»; здесь мы используем только `send`.

**Конфигурация клиента** — gateway знает, куда стучаться, из env (`AUTH_HOST/PORT`, `NOTES_HOST/PORT`):
```typescript
// apps/gateway/src/app.module.ts
ClientsModule.registerAsync([
  { name: NOTES_SERVICE, useFactory: (c) => ({
      transport: Transport.TCP,
      options: { host: c.get('NOTES_HOST','localhost'), port: +c.get('NOTES_PORT','3002') },
  })},
])
```

### 3.3. notes → worker — асинхронная очередь (BullMQ поверх Redis)

Для тяжёлой фоновой работы (Claude + расчёт вектора) синхронный вызов не годится — клиент ждал бы секунды. Поэтому notes **кладёт задачу в очередь и сразу отвечает**, а worker обрабатывает её позже.

```typescript
// notes: продюсер
await this.queue.add('summarize', { noteId: note.id });   // в Redis

// worker: консьюмер
@Processor(SUMMARIZE_QUEUE)
class SummarizeProcessor extends WorkerHost {
  async process(job) { /* summary + embedding, затем UPDATE Note */ }
}
```

Это «развязывает» сервисы во времени: notes не зависит от скорости Claude, worker можно масштабировать/перезапускать отдельно, при сбое — ретраи (3 попытки с экспоненциальной задержкой).

---

## 4. Жизненный цикл запросов (по шагам)

### 4.1. Регистрация
```
браузер  ──POST /auth/register {email,password}──▶ gateway
gateway: ValidationPipe проверяет DTO (email, пароль ≥8)
gateway  ──TCP send('auth.register', {email,password})──▶ auth
auth:    bcrypt.hash, проверка дубля, prisma.user.create, jwt.sign
auth     ──{token}──▶ gateway  ──200 {token}──▶ браузер
```

### 4.2. Создание заметки (асинхронная индексация)
```
браузер  ──POST /notes {title,content} (Bearer JWT)──▶ gateway
gateway: JwtAuthGuard валидирует токен, достаёт userId
gateway  ──TCP send('notes.create', {userId,title,content})──▶ notes
notes:   prisma.note.create(status=PENDING)
notes:   queue.add('summarize', {noteId})   ← кладём в Redis
notes    ──Note(PENDING)──▶ gateway ──201──▶ браузер   (быстро, не ждём AI)

...позже, независимо...
worker:  забирает задачу из очереди
worker:  status=PROCESSING → summaries.summarize() (Claude/мок) → embeddings.embed()
worker:  UPDATE Note SET summary, tags, status=DONE, embedding=<vector>
```

### 4.3. Семантический поиск (RAG)
```
браузер  ──POST /notes/search {query} (JWT)──▶ gateway ──TCP──▶ notes
notes:   vector = embeddings.embed(query)                        (текст → 384-мерный вектор)
notes:   SQL: SELECT ... WHERE userId=? AND embedding IS NOT NULL
              ORDER BY embedding <=> $vector LIMIT 5             (поиск ближайших по косинусу)
notes:   answer = summaries.answerFromContext(query, найденные)  (Claude отвечает по контексту)
notes    ──{answer, sources[]}──▶ gateway ──200──▶ браузер
```

---

## 5. Аутентификация между сервисами

JWT валидируется **в одном месте — в gateway**:

1. auth подписывает токен секретом `JWT_SECRET` (полезная нагрузка: `{sub: userId, email}`).
2. На приватных роутах gateway стоит `JwtAuthGuard` + `JwtStrategy` — они проверяют подпись тем же `JWT_SECRET` и кладут `{userId, email}` в `request.user`.
3. Дальше gateway передаёт **`userId` явно в payload** TCP-запроса (`{userId, ...}`).

Поэтому auth и notes **не знают про JWT** — они доверяют `userId`, который пришёл от gateway. Это упрощает внутренние сервисы: вся аутентификация — на периметре. (Во внутренней сети сервисы не выставлены наружу; в проде периметр дополнительно закрывают сетевыми политиками / mTLS.)

---

## 6. Данные

- **Одна общая БД PostgreSQL** на все сервисы (через общий `@app/prisma`). Это сознательный компромисс «распределённый монолит» — проще на старте, нет распределённых транзакций. JOIN `Note ↔ User` остаётся возможен.
- Таблицы: `User` (id, email, passwordHash), `Note` (id, userId, title, content, summary, tags, status, **embedding vector(384)**).
- **pgvector** — расширение PostgreSQL для векторов. Колонка `embedding` хранит 384-мерный вектор; оператор `<=>` — косинусное расстояние (меньше = ближе по смыслу). Prisma не типизирует `vector`, поэтому чтение/запись вектора — сырым SQL (`$queryRawUnsafe` / `$executeRawUnsafe`).
- Миграции — Prisma (`prisma/migrations`). В Docker их применяет `worker` при старте (`prisma migrate deploy`).

---

## 7. RAG-конвейер (как работает «поиск по смыслу»)

1. **Индексация** (в worker, при создании/изменении заметки): текст → `EmbeddingsService.embed()` → вектор 384. Модель `all-MiniLM-L6-v2` крутится локально через `@xenova/transformers` (без API-ключа, без интернета после первой загрузки).
2. **Хранение**: вектор пишется в `Note.embedding` (pgvector).
3. **Запрос** (в notes): вопрос пользователя → тоже вектор → SQL находит топ-5 ближайших векторов этого пользователя.
4. **Генерация ответа**: найденные заметки кладутся в промпт Claude (`answerFromContext`) — «ответь только по этим заметкам». Без ключа Claude → мок-ответ.

Почему это «по смыслу»: близкие по значению тексты дают близкие векторы, даже без общих слов («когда дедлайн» находит «крайний срок в сентябре»).

---

## 8. Обработка ошибок (RPC → HTTP)

Доменные сервисы бросают обычные Nest-исключения (`ConflictException` 409, `UnauthorizedException` 401, `NotFoundException` 404). Через TCP они прилетают в gateway как объект с `statusCode`/`message`. Хелпер `callService` в gateway превращает их обратно в HTTP:

```typescript
// apps/gateway/src/rpc.util.ts
export async function callService(obs$) {
  try { return await firstValueFrom(obs$); }
  catch (e) {
    const status = e?.statusCode ?? e?.status;
    if (typeof status === 'number') throw new HttpException(e.message, status);
    throw new InternalServerErrorException('Upstream service error');  // сервис недоступен → 503/500
  }
}
```

Так клиент видит корректный HTTP-код (409 при дубле email и т.д.), а не «непонятную RPC-ошибку».

---

## 9. Монорепо и общие библиотеки

Бэкенд — **NestJS monorepo**: несколько приложений (`apps/`) и общих библиотек (`libs/`), один `package.json`, один `node_modules`.

| Библиотека | Что внутри | Кто использует |
|---|---|---|
| `@app/prisma` | `PrismaService` + `PrismaModule` (подключение к БД) | auth, notes, worker |
| `@app/contracts` | message-паттерны, payload-типы, имя очереди, тип RPC-ошибки | gateway, auth, notes, worker |
| `@app/ai` | `EmbeddingsService`, `SummariesService` | notes (поиск), worker (индексация) |

Алиасы `@app/*` прописаны в `tsconfig.json` (`paths`) и в jest (`moduleNameMapper`). Это даёт строгие, переиспользуемые контракты между сервисами без дублирования кода.

---

## 10. Конфигурация (env по сервисам)

| Переменная | gateway | auth | notes | worker |
|---|:---:|:---:|:---:|:---:|
| `JWT_SECRET` | ✅ (валидация) | ✅ (подпись) | | |
| `AUTH_HOST` / `AUTH_PORT` | ✅ | (свой порт) | | |
| `NOTES_HOST` / `NOTES_PORT` | ✅ | | (свой порт) | |
| `DATABASE_URL` | | ✅ | ✅ | ✅ |
| `REDIS_HOST` / `REDIS_PORT` | | | ✅ | ✅ |
| `ANTHROPIC_API_KEY` | | | | ✅ (+ notes для ответа) |

Локально всё берётся из `api/.env`; в Docker — из `environment:` в `docker-compose.yml`, где хосты — это имена сервисов (`auth`, `notes`, `postgres`, `redis`).

---

## 11. Почему так и куда расти

**Почему TCP, а не gRPC/Kafka:** встроен в NestJS, нулевая настройка, идеально для понимания паттерна. gRPC/Kafka — следующий шаг, если нужны строгие контракты/стриминг/событийная шина.

**Почему общая БД:** убирает распределённые транзакции на старте. Честно называется «распределённый монолит».

**Точки роста (вне текущего scope):**
- **DB-per-service** + Saga/outbox для согласованности (тогда `Note.userId` ↔ `User` — это межсервисный вызов, а не JOIN).
- **gRPC** вместо TCP (контракты в `.proto`).
- **API gateway** уровня инфраструктуры (Kong/Traefik) + service discovery.
- **Observability**: трейс одного запроса через gateway→notes→worker (OpenTelemetry), Langfuse вокруг вызовов Claude.
- Отдельные миграции/схемы на сервис.
