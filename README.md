# AI Notes

Учебный full-stack проект: заметки с AI-summary.
Стек: **Angular 20** (web) + **NestJS** (api) + **PostgreSQL** (Prisma) + **Redis/BullMQ** + **Claude API**.

Пользователь сохраняет заметку → фоновый воркер асинхронно обращается к Claude и генерирует краткое summary + теги.

## Архитектура

```
Angular (4200) ──JWT──▶ NestJS API (3000) ──┬──▶ PostgreSQL (Prisma, миграции)
                                             ├──▶ Redis (очередь BullMQ)
                                             └──▶ BullMQ Worker ──▶ Claude API
```

## Быстрый старт (Docker)

```bash
# (опционально) реальный Claude вместо мока:
export ANTHROPIC_API_KEY=sk-ant-...
docker compose up --build
```

- API + Postgres + Redis поднимаются вместе. Миграции применяются автоматически при старте контейнера.
- Health: http://localhost:3000/health → `{"status":"ok"}`
- Фронт запускается отдельно (см. ниже).

## Локальная разработка

```bash
# 1. Инфраструктура (Postgres + Redis)
docker compose up postgres redis -d

# 2. Backend
cd api
npm install
npx prisma migrate dev      # применить миграции локально
npm run start:dev           # API + встроенный BullMQ-воркер на :3000

# 3. Frontend (в отдельном терминале)
cd web
npm install
npm start                   # http://localhost:4200
```

Открой http://localhost:4200 , зарегистрируйся, добавь заметку, нажми **Refresh** — через секунду появится summary.
Без `ANTHROPIC_API_KEY` summary будет вида `[mock] ...` (проект работает из коробки).

## Переменные окружения (api/.env)

| Переменная           | Назначение                                      |
| -------------------- | ----------------------------------------------- |
| `DATABASE_URL`       | строка подключения к PostgreSQL                 |
| `REDIS_HOST` / `REDIS_PORT` | подключение к Redis                       |
| `JWT_SECRET`         | секрет для подписи JWT                           |
| `ANTHROPIC_API_KEY`  | ключ Claude (пусто → мок-summary)               |

## Тесты

```bash
cd api && npm test            # unit (Jest)
cd api && npm run test:e2e    # e2e (supertest) — нужны запущенные Postgres + Redis
cd web && npm test -- --watch=false --browsers=ChromeHeadless
```

## Структура

```
test/
├── api/          # NestJS: auth, notes, summaries, jobs, prisma, health
├── web/          # Angular: core (auth/notes services, interceptor), auth, notes
├── docker-compose.yml
├── .github/workflows/ci.yml
├── README.md
└── RUNBOOK.md
```
