# AI Notes — учебный full-stack проект (дизайн)

**Дата:** 2026-06-15
**Стек:** Angular (frontend) + NestJS (backend) + PostgreSQL + Redis/BullMQ + Anthropic Claude API
**Цель:** учебный, но «production-like» проект, который проходит через все требования вакансии full-stack JS engineer: модели, API, авторизация, миграции, фоновые задачи, интеграции, CI/CD, runbook/README, демо.

---

## 1. Что делает приложение

Сервис заметок с AI-саммари. Пользователь сохраняет заметку (заголовок + текст). Фоновая задача асинхронно обращается к Claude API и генерирует краткое summary + список тегов, которые записываются обратно в заметку. Пользователь видит статус обработки и готовый результат.

Это покрывает CRUD, аутентификацию, миграции БД, фоновые задачи и AI/LLM-интеграцию (прямое попадание в раздел «будет плюсом» вакансии).

---

## 2. Архитектура

```
┌─────────────┐      HTTPS/JSON      ┌──────────────────────┐
│  Angular     │ ───────────────────▶ │   NestJS API          │
│  (web)       │   JWT в заголовке     │   :3000               │
└─────────────┘ ◀─────────────────── └──────────┬───────────┘
                                                  │
                            ┌─────────────────────┼─────────────────────┐
                            ▼                     ▼                     ▼
                    ┌──────────────┐     ┌──────────────┐      ┌──────────────┐
                    │ PostgreSQL    │     │  Redis        │      │  BullMQ       │
                    │ (Prisma)      │     │  (очередь)    │◀────▶│  Worker       │
                    └──────────────┘     └──────────────┘      └──────┬───────┘
                                                                       │ Claude API
                                                                       ▼
                                                                ┌──────────────┐
                                                                │ Anthropic SDK │
                                                                └──────────────┘
```

Весь стек поднимается командой `docker compose up`. Worker — тот же NestJS-код, запущенный в отдельном процессе/контейнере, который слушает очередь BullMQ.

### Поток данных (главный сценарий)

1. Пользователь логинится → получает JWT.
2. Создаёт заметку (`POST /notes`) → запись сохраняется в Postgres со статусом `PENDING`, в очередь BullMQ кладётся задача `summarize`.
3. API сразу отвечает `201` (не ждёт AI).
4. Worker забирает задачу → зовёт Claude API → получает summary + теги → обновляет заметку, статус `DONE`.
5. Frontend опрашивает `GET /notes/:id` (или показывает статус) и отображает готовое summary.

---

## 3. Компоненты

### Backend (NestJS)

| Модуль | Назначение |
|---|---|
| `AuthModule` | Регистрация, логин, JWT, `JwtAuthGuard`, bcrypt-хэш паролей |
| `UsersModule` | Модель пользователя, профиль |
| `NotesModule` | CRUD заметок, привязка к пользователю, постановка задачи в очередь |
| `SummariesModule` | Сервис обращения к Claude (Anthropic SDK), мок при отсутствии ключа |
| `JobsModule` | BullMQ producer + worker (processor `summarize`) |
| `PrismaModule` | Подключение к БД, общий `PrismaService` |
| `HealthModule` | `GET /health` (для Docker healthcheck) |

### Frontend (Angular)

| Часть | Назначение |
|---|---|
| `AuthService` + HTTP interceptor | Хранит JWT, подставляет в заголовки |
| `auth` страницы | Login / Register формы (Reactive Forms) |
| `NotesListComponent` | Список заметок + статус (PENDING/DONE) |
| `NoteEditorComponent` | Создание/редактирование, показ summary и тегов |
| `NotesService` | HttpClient-вызовы к API |

Angular — standalone-компоненты, signals для состояния. Каждый модуль имеет одну зону ответственности и тестируется отдельно.

---

## 4. Модель данных (Prisma schema)

```
User
  id          (uuid, PK)
  email       (unique)
  passwordHash
  createdAt

Note
  id          (uuid, PK)
  userId      → User
  title
  content
  summary     (nullable)
  tags        (string[])
  status      (PENDING | PROCESSING | DONE | FAILED)
  createdAt
  updatedAt
```

Миграции — через `prisma migrate dev` (локально) и `prisma migrate deploy` (CI/prod). Закрывает требование «миграции».

---

## 5. API (контракт)

```
POST   /auth/register   {email, password}        → {token}
POST   /auth/login      {email, password}        → {token}
GET    /notes           (auth)                    → Note[]
POST   /notes           (auth) {title, content}   → Note (status=PENDING)
GET    /notes/:id       (auth)                    → Note
PATCH  /notes/:id       (auth) {title?, content?} → Note (заново ставит в очередь)
DELETE /notes/:id       (auth)                    → 204
GET    /health                                    → {status:"ok"}
```

- Валидация входных данных — `class-validator` DTO.
- Авторизация — `JwtAuthGuard` + проверка владения: пользователь видит/меняет только свои заметки.

---

## 6. Обработка ошибок и наблюдаемость

- **Claude API падает / нет ключа:** worker делает ретраи (BullMQ: 3 попытки, экспоненциальная задержка). После исчерпания → статус `FAILED`, ошибка логируется. При отсутствии ключа `ANTHROPIC_API_KEY` → мок-summary (проект работает «из коробки» без ключа).
- **Глобальный exception filter** в NestJS → единый формат ошибок `{statusCode, message}`.
- **Логирование:** структурные логи (pino) с request-id. Зародыш observability — в RUNBOOK описано, как подключить Prometheus / OpenTelemetry.

---

## 7. Тестирование

- **Unit (Jest):** `NotesService`, `SummariesService` (с мок-Claude), `AuthService`.
- **e2e (supertest):** register → login → create note → get note.
- **Frontend:** пара тестов компонента/сервиса.
- CI прогоняет lint + unit + e2e на каждый push.

---

## 8. Поставка (готовый результат)

- `docker-compose.yml` — `up` поднимает api + web + postgres + redis.
- `.github/workflows/ci.yml` — lint, test, build, проверка миграций (`prisma migrate diff`/`deploy`).
- **README.md** — что это, как запустить локально за несколько команд, переменные окружения.
- **RUNBOOK.md** — деплой, rollback, env-переменные, как читать логи, точки роста (real deploy, observability).

---

## Соответствие требованиям вакансии

| Требование вакансии | Где закрыто |
|---|---|
| Backend: модели, API, авторизация, миграции, фоновые задачи | NestJS + Prisma + JWT + BullMQ |
| Подключить frontend | Angular SPA |
| Интеграции | Anthropic Claude API |
| CI/CD, staging, prod, rollback | GitHub Actions + Docker Compose + RUNBOOK |
| Runbook и README | RUNBOOK.md + README.md |
| Демо по ходу цикла | Рабочий end-to-end сценарий |
| AI-assisted разработка | Проект строится с Claude Code; интеграция с Claude API |
| LLM / agents (плюс) | Summary через Claude |
| Observability (плюс) | pino + хук под Prometheus/OTel в RUNBOOK |

---

## Вне scope (YAGNI)

- Реальный облачный деплой (только описан в RUNBOOK).
- OAuth / соцлогины (только email+пароль).
- Vector DB / RAG (можно как будущее расширение).
- Mobile (React Native/Expo) — фокус на web.
