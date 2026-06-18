# RUNBOOK — AI Notes (микросервисы)

Оперативная шпаргалка: деплой, откат, логи, траблшутинг.
Архитектура целиком — в [ARCHITECTURE.md](ARCHITECTURE.md).

## Топология

6 контейнеров: `gateway` (:3000, единственный наружу), `auth` (TCP :3001), `notes` (TCP :3002), `worker` (без порта), `postgres` (pgvector :5432), `redis` (:6379).

## Деплой

Каждый сервис собирается из своего Dockerfile (`apps/<svc>/Dockerfile`). Поднять весь стек:

```bash
export ANTHROPIC_API_KEY=sk-ant-...        # необязательно (без него — мок)
docker compose up --build -d
```

- Миграции БД применяет сервис **worker** при старте (`prisma migrate deploy` в его `CMD`).
- Проверка: `curl http://localhost:3000/health` → `{"status":"ok"}`.
- Порядок старта разруливается через `depends_on` (gateway ждёт auth+notes; те ждут postgres).

**Staging vs production:** те же образы, разные переменные окружения (`DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, хосты сервисов). Релиз = пересборка образов из нужного git-коммита.

**Пересобрать/перезапустить один сервис** (не трогая остальные):
```bash
docker compose up -d --build notes
docker compose restart gateway
```

## Rollback

- **Код:** откат на предыдущий git-тег и пересборка. В CI образы стоит тегировать по git-SHA → откат = деплой предыдущего тега каждого сервиса.
- **Один сервис:** можно откатить только проблемный (например `notes`), остальные оставить — плюс микросервисов.
- **Миграция БД:**
  - бэкап перед релизом: `docker exec ainotes-pg-compose pg_dump -U postgres ainotes > backup.sql`
  - откат: `npx prisma migrate resolve --rolled-back <migration_name>` + восстановление из бэкапа при необходимости.
- **Быстрый откат фичи:** `git revert <sha>` → push → CI пересоберёт.

> Важно: общая БД одна на все сервисы. Миграция, ломающая схему, затронет всех — катить аккуратно (сначала совместимые изменения, потом код).

## Логи и наблюдаемость

- gateway пишет **структурные JSON-логи** (pino) в stdout. Логи по сервису:
  ```bash
  docker compose logs -f gateway
  docker compose logs -f worker      # здесь видно индексацию/ошибки Claude
  docker compose logs -f notes auth  # сразу несколько
  ```
- Точки роста:
  - **Метрики:** `@willsoto/nestjs-prometheus` → `/metrics` на каждом сервисе → Prometheus + Grafana.
  - **Распределённый трейсинг:** OpenTelemetry — проследить один запрос через gateway → notes → worker (важно именно в микросервисах).
  - **LLM-observability:** Langfuse вокруг `SummariesService` (промпты/токены/латентность Claude).

## Типовые проблемы

| Симптом | Вероятная причина | Действие |
| ------- | ----------------- | -------- |
| 503 / «Upstream service error» на `/auth/*` или `/notes/*` | целевой сервис (auth/notes) не поднялся | `docker compose ps`; `docker compose logs auth notes`; проверь `AUTH_HOST/PORT`, `NOTES_HOST/PORT` у gateway |
| Заметки висят в `PENDING` | worker или Redis недоступны | `docker compose logs worker redis`; проверь `REDIS_HOST/PORT` |
| Все summary/ответы `[mock] ...` | не задан `ANTHROPIC_API_KEY` | задай ключ для `worker` (и `notes` для ответов поиска), перезапусти |
| Статус заметки `FAILED` | Claude недоступен / исчерпаны 3 ретрая | `docker compose logs worker`; проверь ключ и лимиты |
| 401 на `/notes` | нет/истёк JWT (срок 1 день) | перелогинься |
| Поиск ничего не находит | заметки ещё не проиндексированы (нет `embedding`) | подожди обработки worker; проверь, что worker жив |
| gateway не стартует | auth/notes ещё не готовы | это норм при старте; проверь `depends_on`; gateway переподключится |
| Порт 5432/6379/3000 занят | конфликт с другим контейнером/процессом | останови конфликтующее или поменяй проброс портов в compose |

## Полезные команды

```bash
docker compose ps                                  # статус всех сервисов
docker compose logs -f gateway                     # логи входного сервиса
docker exec -it ainotes-pg-compose psql -U postgres ainotes   # консоль БД
docker compose down                                # остановить стек (тома сохраняются)

# заглянуть в очередь / БД руками:
docker exec ainotes-pg-compose psql -U postgres ainotes -c 'SELECT id,status FROM "Note" ORDER BY "createdAt" DESC LIMIT 5;'
```

## Локальный запуск без Docker (dev)

Инфраструктура в Docker, 4 сервиса — Node-процессами (по терминалу на сервис). См. README → «Вариант Б». Кратко:
```bash
cd api && npm install && docker compose up postgres redis -d && npx prisma migrate dev && npm run build
# затем в 4 терминалах:
node dist/apps/auth/main.js
node dist/apps/notes/main.js
node dist/apps/worker/main.js
node dist/apps/gateway/main.js
```
