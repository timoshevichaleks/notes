# AI Notes (микросервисы)

Учебный full-stack проект: заметки с AI-summary и семантическим поиском.
Бэкенд разнесён на **4 микросервиса** (NestJS monorepo), фронт — **Angular 20**.

> Полное техническое описание (как всё устроено и как сервисы общаются) — в [ARCHITECTURE.md](ARCHITECTURE.md).
> Эксплуатация (деплой, откат, логи, траблшутинг) — в [RUNBOOK.md](RUNBOOK.md).

---

## Что это и что умеет

1. Регистрируешься / логинишься (JWT).
2. Создаёшь заметку (заголовок + текст) — она сразу сохраняется со статусом `PENDING`.
3. В фоне отдельный сервис-воркер считает **summary + теги** (через Claude) и **embedding** (вектор), статус становится `DONE`.
4. Спрашиваешь заметки «своими словами» — семантический поиск (RAG) находит релевантные по смыслу, не по словам.

Без ключа Claude всё работает «из коробки» в мок-режиме (summary/ответы вида `[mock] ...`).

---

## Карта сервисов

| Сервис | Порт | Тип | За что отвечает |
|---|---|---|---|
| **gateway** | 3000 (HTTP) | вход | принимает REST от фронта, проверяет JWT, зовёт auth/notes |
| **auth** | 3001 (TCP) | микросервис | регистрация/логин, выдача JWT |
| **notes** | 3002 (TCP) | микросервис | CRUD заметок, постановка задач в очередь, поиск |
| **worker** | — | фоновый | берёт задачи из очереди → summary + embedding |
| postgres | 5432 | инфра | данные (pgvector) |
| redis | 6379 | инфра | очередь BullMQ |

Наружу торчит **только gateway (:3000)**. Фронт ходит только в него.

---

## Запуск — Вариант А: всё в Docker (проще всего)

Нужен только установленный **Docker**.

```bash
# 1. (необязательно) реальный Claude вместо мока:
export ANTHROPIC_API_KEY=sk-ant-...        # Windows PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-..."

# 2. поднять весь бэкенд (gateway + auth + notes + worker + postgres + redis):
docker compose up --build
```

Что произойдёт по шагам:
1. Поднимутся `postgres` (pgvector) и `redis`.
2. Сервис `worker` при старте применит миграции БД (`prisma migrate deploy`).
3. Поднимутся `auth`, `notes`, `gateway`.
4. Проверь, что gateway жив:
   ```bash
   curl http://localhost:3000/health        # → {"status":"ok"}
   ```

Фронт запускается отдельно (Docker для него не настроен — это dev-режим):
```bash
cd web
npm install
npm start            # http://localhost:4200
```

Открой **http://localhost:4200** → зарегистрируйся (email + пароль ≥ 8 символов) → добавь заметку → нажми **Refresh** (через ~секунду статус `DONE` + summary) → внизу в «Ask your notes» задай вопрос.

Остановить весь стек: `docker compose down` (данные в томах сохранятся).

---

## Запуск — Вариант Б: локально, без Docker для приложений (для разработки)

Здесь Docker нужен только для инфраструктуры (Postgres + Redis), а 4 сервиса бэкенда ты запускаешь как Node-процессы — удобно для отладки. **Каждый сервис — в своём терминале.**

### Шаг 0 — один раз: зависимости и инфраструктура
```bash
cd api
npm install
docker compose up postgres redis -d        # только БД и очередь
npx prisma migrate dev                      # применить миграции в БД
```

В `api/.env` должны быть переменные (файл уже есть; `ANTHROPIC_API_KEY` можно оставить пустым):
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ainotes?schema=public"
REDIS_HOST="localhost"
REDIS_PORT=6379
JWT_SECRET="dev-secret-change-me"
ANTHROPIC_API_KEY=""
```

### Шаг 1 — собрать сервисы
```bash
cd api
npm run build           # соберёт gateway + auth + notes + worker
```

### Шаг 2 — запустить 4 сервиса (4 отдельных терминала, все из папки api)
```bash
# терминал 1 — auth (TCP :3001)
node dist/apps/auth/main.js

# терминал 2 — notes (TCP :3002)
node dist/apps/notes/main.js

# терминал 3 — worker (без порта, слушает очередь)
node dist/apps/worker/main.js

# терминал 4 — gateway (HTTP :3000)
node dist/apps/gateway/main.js
```

> Режим разработки с авто-перезапуском (вместо `node dist/...`): `npm run start:auth`, `start:notes`, `start:worker`, `start:gateway` — каждый в своём терминале.

### Шаг 3 — фронт (ещё один терминал)
```bash
cd web
npm install
npm start               # http://localhost:4200
```

### Шаг 4 — проверить
- `curl http://localhost:3000/health` → `{"status":"ok"}`
- Открой http://localhost:4200 и пройди сценарий (регистрация → заметка → поиск).

Порядок запуска: **auth и notes — раньше gateway** (gateway к ним подключается по TCP). worker можно поднимать в любой момент.

---

## Проверка без фронта (через curl)

```bash
# регистрация → получаем токен
TOKEN=$(curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"me@test.local","password":"password123"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')

# создать заметку
curl -s -X POST http://localhost:3000/notes \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Release","content":"Shipping deadline is end of September."}'

# (подождать пару секунд, пока worker обработает) семантический поиск
curl -s -X POST http://localhost:3000/notes/search \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"when do we ship?"}'
```

---

## Тесты, линт, формат

```bash
cd api
npm test            # юнит-тесты всех сервисов (Jest)
npm run build       # сборка всех 4 сервисов
npm run lint:check  # ESLint (без правок)
npm run format:check

cd web
npm test -- --watch=false --browsers=ChromeHeadless
```

---

## Структура репозитория

```
test/
├── api/                         # NestJS monorepo (бэкенд)
│   ├── apps/
│   │   ├── gateway/             # HTTP-вход (:3000)
│   │   ├── auth/                # TCP-микросервис (:3001)
│   │   ├── notes/               # TCP-микросервис (:3002)
│   │   └── worker/              # фоновый обработчик очереди
│   ├── libs/
│   │   ├── prisma/              # общий PrismaService (общая БД)
│   │   ├── contracts/           # message-паттерны и payload-типы
│   │   └── ai/                  # EmbeddingsService + SummariesService
│   └── prisma/                  # schema + миграции
├── web/                         # Angular 20 (фронт)
├── docker-compose.yml           # 6 контейнеров (4 сервиса + postgres + redis)
├── ARCHITECTURE.md              # как всё работает и как общаются сервисы
├── RUNBOOK.md                   # эксплуатация
└── README.md
```
